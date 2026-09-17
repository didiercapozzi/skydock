import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { getManifestPath, getOutputDir, hasCommand, isVideoFile } from './utils'

/* A proxy is a small, all-intra copy of a clip. It exists twice over: the editor opens on proxies
   instead of transcoding every GoPro clip itself, which is the longest wait in the whole flow, and
   the crop bar scrubs against one instead of dragging a 4K file through the browser a frame at a
   time.

   One file serves both, which is the only reason "reuse them" is true rather than a figure of
   speech. That decides the codec: the template asks for ProRes, and no browser plays ProRes, so
   these are H.264 in MP4 — which is a proxy profile kdenlive ships anyway, just not the one that
   template names. */

/* The template's own numbers: `proxyresize` and `proxyminsize`. Scaling up is not a proxy, so a
   clip already narrower than the threshold is left alone. */
const PROXY_WIDTH = 640

const PROXY_MIN_WIDTH = 1000

/* `-g 1` makes every frame a keyframe. That is what the editor's proxies do and what makes both
   halves of this work: scrubbing lands instantly, and a crop can be taken out of the proxy with a
   stream copy that cuts exactly where it was asked to. */
const PROXY_ARGS = [
  '-c:v',
  'libx264',
  '-crf',
  '20',
  '-preset',
  'veryfast',
  '-g',
  '1',
  '-bf',
  '0',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart'
]

const getProxyDir = (outputDir?: string) => path.join(outputDir || getOutputDir(), 'proxies')

/* Keyed by what the file *is*, not where it sits: the same clip copied twice off the same card is
   one proxy, and moving a file does not orphan it. */
const getProxyPath = (file: ManifestFile, outputDir?: string) =>
  file.id ? path.join(getProxyDir(outputDir), `${file.id}.mp4`) : null

const videoWidth = (src: string) => {
  if (!hasCommand('ffprobe')) return null
  try {
    const out = childProcess.execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${src.replace(/(["$`\\])/g, '\\$1')}"`,
      { encoding: 'utf-8' }
    )
    const width = Number.parseInt(out.trim().split(/\r?\n/)[0] ?? '', 10)
    return Number.isFinite(width) ? width : null
  } catch {
    return null
  }
}

/* Written to a temporary name and moved into place, so an interrupted run leaves nothing that
   looks finished — the next pass would otherwise skip a half-written proxy forever. */
const buildProxy = (src: string, dest: string) => {
  if (!hasCommand('ffmpeg')) return false
  const partial = `${dest}.part`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    childProcess.execSync(
      `ffmpeg -y -i "${src.replace(/(["$`\\])/g, '\\$1')}" -vf scale=${PROXY_WIDTH}:-2 ${PROXY_ARGS.join(' ')} "${partial.replace(/(["$`\\])/g, '\\$1')}" 2>/dev/null`,
      { stdio: 'ignore' }
    )
    fs.renameSync(partial, dest)
    return true
  } catch {
    if (fs.existsSync(partial)) fs.unlinkSync(partial)
    return false
  }
}

/* The timeline carries the cut footage, so a proxy of the whole clip would not line up with it.
   Every frame is a keyframe, so the same cut comes out of the proxy as a stream copy — no second
   transcode, and the same frames as the processed copy. */
const cropProxy = (src: string, dest: string, cropStart: number, cropEnd: number) => {
  if (!hasCommand('ffmpeg')) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    childProcess.execSync(
      `ffmpeg -y -ss ${cropStart} -i "${src.replace(/(["$`\\])/g, '\\$1')}" -t ${(cropEnd - cropStart).toFixed(6)} -c copy -avoid_negative_ts make_zero "${dest.replace(/(["$`\\])/g, '\\$1')}" 2>/dev/null`,
      { stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

/* What a proxy is of, so a stale one is not mistaken for a current one: the clip's own bytes never
   change, but a file replaced on disk keeps its path and takes a new content id. */
const proxyIsCurrent = (file: ManifestFile, outputDir?: string) => {
  const proxyPath = getProxyPath(file, outputDir)
  return !!proxyPath && fs.existsSync(proxyPath)
}

const needsProxy = (file: ManifestFile) => isVideoFile(file.path) && !!file.id

type ProxyReport = { built: number; skipped: number; failed: string[] }

/* Runs over everything and records what it made on the registry entry. Resumable by construction:
   a clip whose proxy is already there is passed over, so an interrupted run costs only the clip it
   was on. It never throws — a card that cannot be proxied is still a card that can be sorted. */
const ensureProxies = (
  manifest: Manifest,
  outputDir?: string,
  onProgress?: (done: number, total: number, filename: string) => void
) => {
  const report: ProxyReport = { built: 0, skipped: 0, failed: [] }
  const candidates = manifest.files.filter(needsProxy)
  if (candidates.length === 0 || !hasCommand('ffmpeg')) return report

  candidates.forEach((file, index) => {
    onProgress?.(index, candidates.length, file.filename)
    const proxyPath = getProxyPath(file, outputDir)
    if (!proxyPath) return
    if (fs.existsSync(proxyPath)) {
      file.proxy = proxyPath
      report.skipped++
      return
    }
    if (!fs.existsSync(file.path)) return
    const width = videoWidth(file.path)
    /* already smaller than the proxy would be — the clip is its own proxy */
    if (width !== null && width <= PROXY_MIN_WIDTH) {
      file.proxy = file.path
      report.skipped++
      return
    }
    if (buildProxy(file.path, proxyPath)) {
      file.proxy = proxyPath
      report.built++
    } else {
      delete file.proxy
      report.failed.push(file.filename)
    }
  })
  onProgress?.(candidates.length, candidates.length, '')
  return report
}

/* One run at a time in a process: the board's Scan can be pressed twice, and two ffmpeg passes over
   the same card would fight over the same half-written files. The second caller waits for the first
   rather than starting again. */
let running: Promise<ProxyReport> | null = null

/* Loads, builds what is missing, saves. Kept apart from the scan itself because a scan should
   answer at once — the proxies catch up behind it, and everything works without them meanwhile. */
const buildMissingProxies = async (outputDir?: string) => {
  if (running) return await running
  const dir = outputDir || getOutputDir()
  running = (async () => {
    const manifestPath = getManifestPath(dir)
    const manifest = loadManifest(manifestPath)
    if (!manifest) return { built: 0, skipped: 0, failed: [] }
    const report = ensureProxies(manifest, dir)
    if (report.built > 0 || report.skipped > 0) saveManifest(manifestPath, manifest)
    if (report.built > 0)
      console.log(`[Proxy] Built ${report.built} proxy file(s) in ${dir}/proxies`)
    if (report.failed.length > 0)
      console.warn(`[Proxy] Could not build: ${report.failed.join(', ')}`)
    return report
  })()
  try {
    return await running
  } finally {
    running = null
  }
}

/* How far along the whole card is, for a line the board can show without polling anything. */
const proxyCounts = (manifest: Manifest, outputDir?: string) => {
  const videos = manifest.files.filter(needsProxy)
  return {
    ready: videos.filter((f) => proxyIsCurrent(f, outputDir) || f.proxy === f.path).length,
    total: videos.length
  }
}

export {
  buildMissingProxies,
  buildProxy,
  cropProxy,
  ensureProxies,
  getProxyDir,
  getProxyPath,
  needsProxy,
  proxyCounts,
  proxyIsCurrent,
  PROXY_MIN_WIDTH,
  PROXY_WIDTH
}
export type { ProxyReport }
