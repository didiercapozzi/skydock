import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import { VIDEO_EXTENSIONS } from './constants'
import { getCacheDir, getFilmstripDir, getManifestPath, getOutputDir, getThumbDir } from './utils'
import { writeStatus, scheduleIdle } from './status'
import { loadManifest, saveManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'

type ProxyOptions = {
  outputDir?: string
  jobs?: number
}

type ProxyConfig = {
  outputDir: string
  manifestPath: string
  thumbDir: string
  filmstripBaseDir: string
  logDir: string
  jobs: number
  niceLevel: number
  ioniceClass: number
  ioniceLevel: number
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
    filmstripBaseDir: getFilmstripDir(outputDir),
    logDir: `${outputDir}/.cache/logs`,
    jobs,
    niceLevel: parseInt(process.env.SKYDOCK_PROXY_NICE || '10', 10),
    ioniceClass: parseInt(process.env.SKYDOCK_PROXY_IONICE_CLASS || '2', 10),
    ioniceLevel: parseInt(process.env.SKYDOCK_PROXY_IONICE_LEVEL || '6', 10),
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

const generateFilmstrip = (src: string, fid: string, config: ProxyConfig): boolean => {
  if (!fs.existsSync(src)) return false

  const dir = path.join(config.filmstripBaseDir, fid)
  const probe = path.join(dir, '0001.jpg')
  if (fs.existsSync(probe)) {
    const srcMtime = fs.statSync(src).mtimeMs
    const stripMtime = fs.statSync(probe).mtimeMs
    if (srcMtime <= stripMtime) return true
  }

  fs.mkdirSync(dir, { recursive: true })
  const runPrefix = getRunPrefix(config)
  const tmpDir = `${dir}.tmp`
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
  fs.mkdirSync(tmpDir, { recursive: true })
  const cmd = `${runPrefix} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "fps=1,scale=160:-2" -q:v 5 -threads ${config.ffmpegThreads} "${tmpDir}/%04d.jpg" 2>/dev/null`
  try {
    execSync(cmd, { stdio: 'ignore' })
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
    fs.renameSync(tmpDir, dir)
    return true
  } catch {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
    return false
  }
}

const extractKeyframes = (src: string): number[] => {
  if (!fs.existsSync(src)) return []
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries frame=key_frame,pkt_pts_time,best_effort_timestamp_time -of json "${src}" 2>/dev/null`,
      { encoding: 'utf-8' }
    )
    const json = JSON.parse(out) as {
      frames?: Array<{
        key_frame: number
        pkt_pts_time?: string
        best_effort_timestamp_time?: string
      }>
    }
    const frames = json.frames ?? []
    const times: number[] = []
    for (const f of frames) {
      if (f.key_frame === 1) {
        const raw = f.pkt_pts_time ?? f.best_effort_timestamp_time
        if (raw !== undefined) {
          const t = parseFloat(raw)
          if (Number.isFinite(t)) times.push(t)
        }
      }
    }
    return times
  } catch {
    return []
  }
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
    for (const f of fs.readdirSync(config.filmstripBaseDir)) {
      if (!validIds.has(f)) {
        try {
          fs.rmSync(path.join(config.filmstripBaseDir, f), { recursive: true, force: true })
        } catch {}
      }
    }
  } catch {}

  try {
    const oldProxyDir = path.join(getCacheDir(config.outputDir), 'proxies')
    for (const f of fs.readdirSync(oldProxyDir)) {
      const base = path.basename(f, path.extname(f))
      if (!validIds.has(base)) {
        try {
          fs.unlinkSync(path.join(oldProxyDir, f))
        } catch {}
      }
    }
    if (fs.readdirSync(oldProxyDir).length === 0) {
      try {
        fs.rmdirSync(oldProxyDir)
      } catch {}
    }
  } catch {}
}

const updateManifestPaths = (manifest: Manifest, config: ProxyConfig): void => {
  const isVideoPath = (p: string): boolean =>
    VIDEO_EXTENSIONS_SET.has(path.extname(p).slice(1).toLowerCase())

  for (const file of manifest.files) {
    if (file.id && isVideoPath(file.path)) {
      const thumbPath = path.join(config.thumbDir, `${file.id}.jpg`)
      if (fs.existsSync(thumbPath)) file.thumbPath = thumbPath
      else delete file.thumbPath

      const filmstripDir = path.join(config.filmstripBaseDir, file.id)
      const probe = path.join(filmstripDir, '0001.jpg')
      if (fs.existsSync(probe)) file.filmstripDir = filmstripDir
      else delete file.filmstripDir

      if (file.keyframes === null) delete file.keyframes
      if (!file.keyframes) file.keyframes = undefined
    } else {
      delete file.thumbPath
      delete file.filmstripDir
      delete file.keyframes
    }
  }

  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (file.id && isVideoPath(file.path)) {
        const thumbPath = path.join(config.thumbDir, `${file.id}.jpg`)
        if (fs.existsSync(thumbPath)) file.thumbPath = thumbPath
        else delete file.thumbPath

        const filmstripDir = path.join(config.filmstripBaseDir, file.id)
        const probe = path.join(filmstripDir, '0001.jpg')
        if (fs.existsSync(probe)) file.filmstripDir = filmstripDir
        else delete file.filmstripDir

        if (file.keyframes === null) delete file.keyframes
        if (!file.keyframes) file.keyframes = undefined
      } else {
        delete file.thumbPath
        delete file.filmstripDir
        delete file.keyframes
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
  fs.mkdirSync(config.filmstripBaseDir, { recursive: true })
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
  let existingStrips = 0
  for (const { fid } of videos) {
    if (fs.existsSync(path.join(config.thumbDir, `${fid}.jpg`))) existingThumbs++
    if (fs.existsSync(path.join(config.filmstripBaseDir, fid, '0001.jpg'))) existingStrips++
  }

  writeStatus('proxy', 'running', `Generating thumbnails (320px)`, config.outputDir, {
    total: videos.length,
    done: 0
  })

  const thumbResults = await runParallel(videos, config.jobs, async ({ file, fid }) => {
    return generateThumbnail(file.path, fid, config)
  })

  console.log(`[Proxies] Thumbnails ready (${thumbResults}/${videos.length})`)

  writeStatus('proxy', 'running', `Generating filmstrips (160px, 1 fps)`, config.outputDir, {
    total: videos.length,
    done: thumbResults
  })

  const MAX_RETRIES = 2
  let stripResults = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    stripResults = await runParallel(videos, config.jobs, async ({ file, fid }) => {
      const ok = generateFilmstrip(file.path, fid, config)
      if (ok) {
        const kf = extractKeyframes(file.path)
        if (kf.length > 0) {
          file.keyframes = kf
        }
      }
      return ok
    })

    if (stripResults >= videos.length) break

    if (attempt < MAX_RETRIES) {
      const missing = videos.length - stripResults
      console.log(
        `[Proxies] Retry ${attempt + 1}/${MAX_RETRIES}: ${missing} filmstrips still missing`
      )
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  const newThumbs = Math.max(0, thumbResults - existingThumbs)
  const newStrips = Math.max(0, stripResults - existingStrips)

  pruneStale(manifest, config)
  updateManifestPaths(manifest, config)

  for (const { file } of videos) {
    if (file.keyframes && file.keyframes.length === 0) delete file.keyframes
  }

  saveManifest(config.manifestPath, manifest)

  if (stripResults === videos.length && thumbResults === videos.length) {
    const msg = `Thumbnails and filmstrips ready (${stripResults}/${videos.length})`
    console.log(
      `[Proxies] Done: ${thumbResults} thumbs (${newThumbs} new), ${stripResults} filmstrips (${newStrips} new)`
    )
    writeStatus('proxy', 'done', msg, config.outputDir, {
      total: videos.length,
      done: stripResults
    })
    scheduleIdle('proxy', 8000, config.outputDir)
  } else {
    const failedThumbs = videos.length - thumbResults
    const failedStrips = videos.length - stripResults
    const msg = `Failed ${failedThumbs} thumbs, ${failedStrips} filmstrips`
    console.error(`[Proxies] ERROR: ${msg}`)
    writeStatus('proxy', 'error', msg, config.outputDir, {
      total: videos.length,
      done: stripResults
    })
  }

  return { thumbs: thumbResults, proxies: stripResults, total: videos.length }
}

const isCli =
  process.argv[1] &&
  (process.argv[1].endsWith('proxies.ts') || process.argv[1].endsWith('proxies.js'))

if (isCli) {
  generateProxies().catch(console.error)
}

export { generateProxies }
export type { ProxyOptions }
