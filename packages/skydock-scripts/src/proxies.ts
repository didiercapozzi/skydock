import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import { VIDEO_EXTENSIONS } from './constants'
import { getOutputDir, getManifestPath, getThumbDir, getProxyDir } from './utils'
import { writeStatus, scheduleIdle } from './status'
import { loadManifest, saveManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'

type ProxyOptions = {
  outputDir?: string
  jobs?: number
  preset?: string
  scale?: number
  crf?: number
  fps?: number
  audio?: boolean
}

type ProxyConfig = {
  outputDir: string
  manifestPath: string
  thumbDir: string
  proxyDir: string
  logDir: string
  jobs: number
  preset: string
  scale: number
  crf: number
  fps: number
  audio: boolean
  niceLevel: number
  ioniceClass: number
  ioniceLevel: number
  encoder: string
  ffmpegThreads: number
}

const VIDEO_EXTENSIONS_SET = new Set(VIDEO_EXTENSIONS.map((e) => e.toLowerCase()))

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const detectEncoder = (): string => {
  try {
    const encoders = execSync('ffmpeg -encoders 2>/dev/null', { encoding: 'utf-8' })
    if (encoders.includes('h264_nvenc')) return 'h264_nvenc'
    if (encoders.includes('h264_qsv')) return 'h264_qsv'
    if (encoders.includes('h264_videotoolbox')) return 'h264_videotoolbox'
  } catch {}
  return 'libx264'
}

const buildConfig = (options?: ProxyOptions): ProxyConfig => {
  const outputDir = options?.outputDir || getOutputDir()
  const totalCpus = os.cpus().length || 4

  let jobs = options?.jobs || totalCpus - 1
  if (jobs < 1) jobs = 1
  if (jobs > 8) jobs = 8

  return {
    outputDir,
    manifestPath: getManifestPath(outputDir),
    thumbDir: getThumbDir(outputDir),
    proxyDir: getProxyDir(outputDir),
    logDir: `${outputDir}/.cache/logs`,
    jobs,
    preset: options?.preset || process.env.SKYDOCK_PROXY_PRESET || 'ultrafast',
    scale: options?.scale || parseInt(process.env.SKYDOCK_PROXY_SCALE || '144', 10),
    crf: options?.crf || parseInt(process.env.SKYDOCK_PROXY_CRF || '35', 10),
    fps: options?.fps || parseInt(process.env.SKYDOCK_PROXY_FPS || '12', 10),
    audio: options?.audio ?? process.env.SKYDOCK_PROXY_AUDIO === '1',
    niceLevel: parseInt(process.env.SKYDOCK_PROXY_NICE || '10', 10),
    ioniceClass: parseInt(process.env.SKYDOCK_PROXY_IONICE_CLASS || '2', 10),
    ioniceLevel: parseInt(process.env.SKYDOCK_PROXY_IONICE_LEVEL || '6', 10),
    encoder: detectEncoder(),
    ffmpegThreads: jobs > 2 ? 1 : 2
  }
}

const getRunPrefix = (config: ProxyConfig): string => {
  const parts: string[] = []
  if (hasCommand('nice')) parts.push(`nice -n ${config.niceLevel}`)
  if (hasCommand('ionice')) parts.push(`ionice -c ${config.ioniceClass} -n ${config.ioniceLevel}`)
  return parts.join(' ')
}

const generateThumbnail = (src: string, fid: string, config: ProxyConfig): boolean => {
  if (!fs.existsSync(src)) return false

  const thumb = path.join(config.thumbDir, `${fid}.jpg`)
  if (fs.existsSync(thumb)) {
    const srcMtime = fs.statSync(src).mtimeMs
    const thumbMtime = fs.statSync(thumb).mtimeMs
    if (srcMtime <= thumbMtime) return true
  }

  const tmp = `${thumb}.tmp.jpg`
  const runPrefix = getRunPrefix(config)
  const cmd = `${runPrefix} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -ss 0.5 -i "${src}" -vframes 1 -vf "scale=320:-2" -q:v 3 -threads ${config.ffmpegThreads} "${tmp}" 2>/dev/null`

  try {
    execSync(cmd, { stdio: 'ignore' })
    fs.renameSync(tmp, thumb)
    return true
  } catch {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    return false
  }
}

const generateProxy = (src: string, fid: string, config: ProxyConfig): boolean => {
  if (!fs.existsSync(src)) return false

  const proxy = path.join(config.proxyDir, `${fid}.mp4`)
  if (fs.existsSync(proxy)) {
    const srcMtime = fs.statSync(src).mtimeMs
    const proxyMtime = fs.statSync(proxy).mtimeMs
    if (srcMtime <= proxyMtime) return true
  }

  const tmp = `${proxy}.tmp.mp4`
  const runPrefix = getRunPrefix(config)
  const logFile = path.join(config.logDir, `${fid}.log`)
  const audioArgs = config.audio ? '-c:a aac -b:a 64k -vn' : '-an'

  let encOk = false

  const tryEncode = (encoderArgs: string): boolean => {
    const cmd = `${runPrefix} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:${config.scale},fps=${config.fps}" ${encoderArgs} ${audioArgs} -movflags +faststart -threads ${config.ffmpegThreads} "${tmp}" 2>/dev/null`
    try {
      execSync(cmd, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  switch (config.encoder) {
    case 'h264_nvenc':
      encOk = tryEncode(`-c:v h264_nvenc -rc vbr_hq -cq ${config.crf} -preset fast`)
      if (!encOk) {
        try {
          fs.unlinkSync(tmp)
        } catch {}
        encOk = tryEncode(`-c:v libx264 -crf ${config.crf} -preset ${config.preset}`)
      }
      break
    case 'h264_qsv':
      encOk = tryEncode(`-c:v h264_qsv -global_quality ${config.crf} -preset veryfast`)
      if (!encOk) {
        try {
          fs.unlinkSync(tmp)
        } catch {}
        encOk = tryEncode(`-c:v libx264 -crf ${config.crf} -preset ${config.preset}`)
      }
      break
    case 'h264_videotoolbox':
      encOk = tryEncode(`-c:v h264_videotoolbox -q:v 60`)
      if (!encOk) {
        try {
          fs.unlinkSync(tmp)
        } catch {}
        encOk = tryEncode(`-c:v libx264 -crf ${config.crf} -preset ${config.preset}`)
      }
      break
    default:
      encOk = tryEncode(`-c:v libx264 -crf ${config.crf} -preset ${config.preset}`)
  }

  if (encOk) {
    fs.renameSync(tmp, proxy)
    try {
      fs.unlinkSync(logFile)
    } catch {}
    return true
  }

  try {
    fs.unlinkSync(tmp)
  } catch {}
  return false
}

const getVideoFiles = (manifest: Manifest): Array<{ file: ManifestFile; fid: string }> => {
  const results: Array<{ file: ManifestFile; fid: string }> = []

  for (const file of manifest.files) {
    if (!file.id) continue
    const ext = path.extname(file.path).slice(1).toLowerCase()
    if (!VIDEO_EXTENSIONS_SET.has(ext)) continue

    results.push({ file, fid: file.id })
  }

  return results
}

const pruneStale = (manifest: Manifest, config: ProxyConfig): void => {
  const validIds = new Set<string>()
  for (const file of manifest.files) {
    if (file.id) validIds.add(file.id)
  }
  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (file.id) validIds.add(file.id)
    }
  }

  if (validIds.size === 0) return

  try {
    for (const f of fs.readdirSync(config.thumbDir)) {
      const base = path.basename(f, path.extname(f))
      if (!validIds.has(base)) {
        try {
          fs.unlinkSync(path.join(config.thumbDir, f))
        } catch {}
      }
    }
  } catch {}

  try {
    for (const f of fs.readdirSync(config.proxyDir)) {
      const base = path.basename(f, path.extname(f))
      if (!validIds.has(base)) {
        try {
          fs.unlinkSync(path.join(config.proxyDir, f))
        } catch {}
      }
    }
  } catch {}
}

const updateManifestPaths = (manifest: Manifest, config: ProxyConfig): void => {
  const isVideoPath = (p: string): boolean =>
    VIDEO_EXTENSIONS_SET.has(path.extname(p).slice(1).toLowerCase())

  for (const file of manifest.files) {
    if (file.id && isVideoPath(file.path)) {
      const thumbPath = path.join(config.thumbDir, `${file.id}.jpg`)
      const proxyPath = path.join(config.proxyDir, `${file.id}.mp4`)
      if (fs.existsSync(thumbPath)) file.thumbPath = thumbPath
      else delete file.thumbPath
      if (fs.existsSync(proxyPath)) file.proxyPath = proxyPath
      else delete file.proxyPath
    } else {
      delete file.thumbPath
      delete file.proxyPath
    }
  }

  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (file.id && isVideoPath(file.path)) {
        const thumbPath = path.join(config.thumbDir, `${file.id}.jpg`)
        const proxyPath = path.join(config.proxyDir, `${file.id}.mp4`)
        if (fs.existsSync(thumbPath)) file.thumbPath = thumbPath
        else delete file.thumbPath
        if (fs.existsSync(proxyPath)) file.proxyPath = proxyPath
        else delete file.proxyPath
      } else {
        delete file.thumbPath
        delete file.proxyPath
      }
    }
  }
}

const runParallel = async <T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<boolean>
): Promise<number> => {
  let successCount = 0
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency))
  }
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(fn))
    successCount += results.filter(Boolean).length
  }
  return successCount
}

const generateProxies = async (
  options?: ProxyOptions
): Promise<{ thumbs: number; proxies: number; total: number }> => {
  const config = buildConfig(options)

  if (!fs.existsSync(config.manifestPath)) {
    return { thumbs: 0, proxies: 0, total: 0 }
  }

  if (!hasCommand('ffmpeg')) {
    console.log('[Proxies] ffmpeg not found, skipping')
    return { thumbs: 0, proxies: 0, total: 0 }
  }

  fs.mkdirSync(config.thumbDir, { recursive: true })
  fs.mkdirSync(config.proxyDir, { recursive: true })
  fs.mkdirSync(config.logDir, { recursive: true })

  const manifest = loadManifest(config.manifestPath)
  if (!manifest) return { thumbs: 0, proxies: 0, total: 0 }

  const videos = getVideoFiles(manifest)
  if (videos.length === 0) {
    console.log('[Proxies] No videos in manifest')
    return { thumbs: 0, proxies: 0, total: 0 }
  }

  console.log(`[Proxies] Processing ${videos.length} video(s)`)

  let existingThumbs = 0
  let existingProxies = 0
  for (const { fid } of videos) {
    if (fs.existsSync(path.join(config.thumbDir, `${fid}.jpg`))) existingThumbs++
    if (fs.existsSync(path.join(config.proxyDir, `${fid}.mp4`))) existingProxies++
  }

  writeStatus('proxy', 'running', `Generating thumbnails (320px)`, config.outputDir, {
    total: videos.length,
    done: 0
  })

  const thumbResults = await runParallel(videos, config.jobs, async ({ file, fid }) => {
    return generateThumbnail(file.path, fid, config)
  })

  console.log(`[Proxies] Thumbnails ready (${thumbResults}/${videos.length})`)

  writeStatus(
    'proxy',
    'running',
    `Generating ${config.scale}p proxies (${config.encoder} ${config.preset})`,
    config.outputDir,
    {
      total: videos.length,
      done: thumbResults
    }
  )

  const MAX_RETRIES = 2
  let proxyResults = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    proxyResults = await runParallel(videos, config.jobs, async ({ file, fid }) => {
      return generateProxy(file.path, fid, config)
    })

    if (proxyResults >= videos.length) break

    if (attempt < MAX_RETRIES) {
      const missing = videos.length - proxyResults
      console.log(`[Proxies] Retry ${attempt + 1}/${MAX_RETRIES}: ${missing} proxies still missing`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  const newThumbs = Math.max(0, thumbResults - existingThumbs)
  const newProxies = Math.max(0, proxyResults - existingProxies)

  pruneStale(manifest, config)
  updateManifestPaths(manifest, config)
  saveManifest(config.manifestPath, manifest)

  if (proxyResults === videos.length && thumbResults === videos.length) {
    const msg = `Thumbnails and proxies ready (${proxyResults}/${videos.length} ${config.encoder} ${config.preset})`
    console.log(
      `[Proxies] Done: ${thumbResults} thumbs (${newThumbs} new), ${proxyResults} proxies (${newProxies} new)`
    )
    writeStatus('proxy', 'done', msg, config.outputDir, {
      total: videos.length,
      done: proxyResults
    })
    scheduleIdle('proxy', 8000, config.outputDir)
  } else {
    const failedThumbs = videos.length - thumbResults
    const failedProxies = videos.length - proxyResults
    const msg = `Failed ${failedThumbs} thumbs, ${failedProxies} proxies`
    console.error(`[Proxies] ERROR: ${msg}`)
    writeStatus('proxy', 'error', msg, config.outputDir, {
      total: videos.length,
      done: proxyResults
    })
  }

  return { thumbs: thumbResults, proxies: proxyResults, total: videos.length }
}

const isCli =
  process.argv[1] &&
  (process.argv[1].endsWith('proxies.ts') || process.argv[1].endsWith('proxies.js'))

if (isCli) {
  generateProxies().catch(console.error)
}

export { generateProxies }
export type { ProxyOptions }
