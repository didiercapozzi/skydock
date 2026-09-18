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

/* Shared by every encoder. `-g 1` makes every frame a keyframe: that is what the editor's own
   proxies do and what makes both halves of this work — scrubbing lands instantly, and a crop can be
   taken out of the proxy with a stream copy that cuts exactly where it was asked to.

   `-f mp4` is not decoration: the file is written under a temporary name ending in `.part`, and
   ffmpeg picks the container from the extension unless it is told. Without this it refuses every
   clip before encoding a frame — "unable to choose an output format" — and every proxy fails. */
const CONTAINER_ARGS = [
  '-f',
  'mp4',
  '-g',
  '1',
  '-bf',
  '0',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart'
]

/* Which encoder this machine can actually use. Decoding is the expensive half — a card of 4K HEVC
   clips spends its time unpacking them, not writing the small copy — so what matters most is that
   the graphics card does the decode too. Measured on one 148-second clip: 165s on the processor,
   under 10s on the card.

   Hardware all-intra costs more bits than x264 does for the same picture, so the quality knob is
   set per encoder rather than shared. */
type ProxyEncoder = 'nvenc' | 'vaapi' | 'cpu'

const DRI_DEVICE = () => process.env.SKYDOCK_DRI_DEVICE?.trim() || '/dev/dri/renderD128'

/* `-tune ull` is what lets NVENC make every frame a keyframe at all: without it the driver refuses
   `-g 1` outright — "Gop Length should be greater than number of B frames + 1" — and `-g 2` gives
   every *other* frame, which is not the same thing and breaks cutting a crop out with a copy. It
   costs bits: NVENC needs a much higher qp than the others to land on the same file size.

   No `-pix_fmt` on the hardware paths. The frames are in the card's own memory, and naming a pixel
   format makes ffmpeg insert a conversion it cannot link to — "impossible to convert between the
   formats supported by the filter". */
const ENCODER_ARGS: Record<ProxyEncoder, string[]> = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'ull', '-rc', 'constqp', '-qp', '36'],
  vaapi: ['-c:v', 'h264_vaapi', '-qp', '30'],
  cpu: ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']
}

/* Being listed by ffmpeg is not the same as working: the encoder is compiled in whether or not the
   card, its driver and its device node are all reachable. NVENC in particular is listed and then
   fails at "device creation" when the driver libraries are missing, which is exactly the state a
   container is in until it is given them.

   The trial carries the same settings the real thing does, `-g 1` included. One that leaves them
   out proves only that the encoder exists: NVENC passed exactly such a trial and then refused
   every clip on the card, because what it objects to is the all-intra setting and nothing else. */
const canEncode = (args: string[], before: string[] = []) => {
  try {
    childProcess.execSync(
      `ffmpeg -hide_banner -loglevel error ${before.join(' ')} -f lavfi -i color=black:s=320x240:d=0.2 ${args.join(' ')} ${TRIAL_ARGS.join(' ')} -f null - `,
      { stdio: 'ignore', timeout: 20_000 }
    )
    return true
  } catch {
    return false
  }
}

/* A VAAPI card that can encode cannot necessarily scale. Resizing on the card goes through its
   video-processing unit, which is a separate entrypoint the driver may simply not offer — an Intel
   iHD driver that decodes and encodes perfectly well answered every `scale_vaapi` with "the
   requested VAProfile is not supported", and every clip on the card failed. So the scaler gets a
   trial of its own, and a card without one still decodes and encodes while the processor does the
   resize in between: 5 seconds of 2.7K HEVC in 2 seconds that way, against the 165s the processor
   takes doing all of it. */
const vaapiCanScale = () =>
  canEncode(
    [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload,scale_vaapi=w=160:h=-2'],
    ['-vaapi_device', DRI_DEVICE()]
  )

type Detected = { encoder: ProxyEncoder; cardScales: boolean }

const detectEncoder = (): Detected => {
  const asked = process.env.SKYDOCK_PROXY_ENCODER?.trim().toLowerCase()
  const vaapiReady = () =>
    fs.existsSync(DRI_DEVICE()) &&
    canEncode(
      [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload'],
      ['-vaapi_device', DRI_DEVICE()]
    )
  if (asked === 'cpu' || asked === 'nvenc') return { encoder: asked, cardScales: true }
  if (asked === 'vaapi') return { encoder: 'vaapi', cardScales: vaapiCanScale() }
  if (!hasCommand('ffmpeg')) return { encoder: 'cpu', cardScales: false }
  if (canEncode(ENCODER_ARGS.nvenc)) return { encoder: 'nvenc', cardScales: true }
  if (vaapiReady()) return { encoder: 'vaapi', cardScales: vaapiCanScale() }
  return { encoder: 'cpu', cardScales: false }
}

let detected: Detected | null = null

const detection = () => (detected ??= detectEncoder())

const proxyEncoder = () => detection().encoder

/* only for tests and for saying which one was picked in a log line. A card is assumed to scale
   unless a test says otherwise, which is what every card did until one did not. */
const setProxyEncoder = (next: ProxyEncoder | null, cardScales = true) => {
  detected = next === null ? null : { encoder: next, cardScales }
}

/* everything the real command sets, minus the container, since a trial writes to nothing */
const TRIAL_ARGS = CONTAINER_ARGS.filter((a, i) => a !== '-f' && CONTAINER_ARGS[i - 1] !== '-f')

const getProxyDir = (outputDir?: string) => path.join(outputDir || getOutputDir(), 'proxies')

/* The cut proxies of one jump. Kept here rather than beside the copies they belong to, because a
   passenger's folder is walked whole when it is uploaded — anything left in there goes to the
   storage. A proxy is a working file: it never leaves this machine, and the montage reaches it by
   an absolute path, so where it sits is nobody's business but ours. */
const getCutProxyDir = (outputDir: string, groupId: string) =>
  path.join(getProxyDir(outputDir), 'cut', groupId)

/* Keyed by what the file *is*, not where it sits: the same clip copied twice off the same card is
   one proxy, and moving a file does not orphan it. */
const getProxyPath = (file: ManifestFile, outputDir?: string) =>
  file.id ? path.join(getProxyDir(outputDir), `${file.id}.mp4`) : null

/* Width, height and how the clip is meant to be turned. A phone or a 360 camera records sideways
   and records the turn beside it, so the frame on disk is not the frame anyone sees. */
const videoShape = (src: string) => {
  if (!hasCommand('ffprobe')) return null
  try {
    const out = childProcess.execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation -of default=nw=1 "${src.replace(/(["$`\\])/g, '\\$1')}"`,
      { encoding: 'utf-8' }
    )
    const read = (key: string) => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
      const value = Number.parseInt(line?.slice(key.length + 1) ?? '', 10)
      return Number.isFinite(value) ? value : null
    }
    const width = read('width')
    const height = read('height')
    if (width === null || height === null) return null
    /* a quarter turn either way swaps what counts as the wide edge */
    const turned = Math.abs(read('rotation') ?? 0) % 180 === 90
    return { width, height, turned }
  } catch {
    return null
  }
}

/* How wide the clip looks to someone watching it, which is the number the proxy has to shrink. */
const shownWidth = (shape: { width: number; height: number; turned: boolean }) =>
  shape.turned ? shape.height : shape.width

/* The processor's scaler is handed frames ffmpeg has already turned the right way up, so asking
   for a 640-wide frame is the whole of it. A graphics card is handed them as they sit on disk and
   the turn stays as a note on the side, so the edge to shrink is whichever one ends up across —
   get this wrong and a sideways clip comes out three times the size it was asked for, which is
   what happened to every 360 camera clip on the first card through. */
const scaleFilter = (shape: { turned: boolean } | null, hardware: boolean) => {
  if (!hardware) return `scale=${PROXY_WIDTH}:-2`
  return shape?.turned ? `scale_vaapi=w=-2:h=${PROXY_WIDTH}` : `scale_vaapi=w=${PROXY_WIDTH}:h=-2`
}

/* ffmpeg signs off with "Conversion failed!", which says only that it did — the diagnosis is a
   line further up, naming the setting it would not accept. So the sign-offs are dropped and the
   first line that actually gives a reason is kept: once one stage fails, every stage after it
   reports its own failure too, and the last of those is a consequence. A scaler that could not
   start used to be reported as the encoder's "error code -22 (Invalid argument)", which pointed
   at the wrong thing entirely. */
const NOISE = [
  /^Conversion failed!?$/i,
  /^Error opening output file/i,
  /^Terminating thread/i,
  /^Task finished with error code/i
]

const NAMES_A_REASON = /failed|invalid|unable|impossible|not (supported|implemented)/i

const lastComplaint = (stderr: string) => {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim().replace(/^\[[^\]]+\]\s*/, ''))
    .filter((l) => l !== '' && !NOISE.some((n) => n.test(l)))
  const named = lines.filter((l) => NAMES_A_REASON.test(l))
  return named[0] ?? lines[lines.length - 1] ?? 'ffmpeg failed with no output'
}

/* Written to a temporary name and moved into place, so an interrupted run leaves nothing that
   looks finished — the next pass would otherwise skip a half-written proxy forever.

   Why it failed comes back with the answer. This used to be thrown away three times over — stderr
   to /dev/null, stdio ignored, the error swallowed — so when every clip on a card failed, the app
   could say only that it had. */
/* A proxy is minutes of ffmpeg per clip, and a card is dozens of clips: run with the blocking call,
   the server answered nothing until the last one was made — a scan, or one clip dragged in, froze
   the whole board. So ffmpeg is waited on without holding the thread, and its complaint is kept. */
const runFfmpeg = (line: string) =>
  new Promise<{ ok: true } | { ok: false; stderr: string }>((resolve) => {
    childProcess.exec(line, { maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) =>
      resolve(error ? { ok: false, stderr: String(stderr ?? '') } : { ok: true })
    )
  })

const buildProxy = async (
  src: string,
  dest: string,
  shape: ReturnType<typeof videoShape> = null
) => {
  if (!hasCommand('ffmpeg')) return { ok: false as const, reason: 'ffmpeg is not installed' }
  const quote = (p: string) => `"${p.replace(/(["$`\\])/g, '\\$1')}"`
  const { encoder: pick, cardScales } = detection()
  /* A VAAPI card with no scaler decodes into ordinary memory instead, where ffmpeg turns the frame
     the right way up exactly as it does for the processor path, and hands the resized frame back
     to the card to encode. */
  const vaapiHybrid = pick === 'vaapi' && !cardScales
  /* NVENC scales on the card with cuda; VAAPI with its own filter. The processor path is left
     exactly as it was, turn and all, because ffmpeg has already done that part for it. */
  const decode =
    pick === 'nvenc'
      ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
      : vaapiHybrid
        ? ['-hwaccel', 'vaapi', '-vaapi_device', DRI_DEVICE()]
        : pick === 'vaapi'
          ? ['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi', '-vaapi_device', DRI_DEVICE()]
          : []
  const filter =
    pick === 'nvenc'
      ? shape?.turned
        ? `scale_cuda=w=-2:h=${PROXY_WIDTH}`
        : `scale_cuda=w=${PROXY_WIDTH}:h=-2`
      : vaapiHybrid
        ? `${scaleFilter(shape, false)},format=nv12,hwupload`
        : scaleFilter(shape, pick === 'vaapi')
  const partial = `${dest}.part`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const run = await runFfmpeg(
    `ffmpeg -y ${decode.join(' ')} -i ${quote(src)} -vf ${filter} ${ENCODER_ARGS[pick].join(' ')} ${CONTAINER_ARGS.join(' ')} ${quote(partial)}`
  )
  if (run.ok) {
    try {
      fs.renameSync(partial, dest)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, reason: e instanceof Error ? e.message : String(e) }
    }
  }
  if (fs.existsSync(partial)) fs.unlinkSync(partial)
  return { ok: false as const, reason: lastComplaint(run.stderr) }
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

/* a freed clip is on the storage only — there is nothing here to make a small copy of */
const needsProxy = (file: ManifestFile) => isVideoFile(file.path) && !!file.id && !file.freed

/* `reason` is why the failures failed — one line, because when proxies break they break for the
   same reason on every clip, and 27 copies of it is not 27 pieces of information. */
type ProxyReport = { built: number; skipped: number; failed: string[]; reason?: string }

/* Runs over everything and records what it made on the registry entry. Resumable by construction:
   a clip whose proxy is already there is passed over, so an interrupted run costs only the clip it
   was on. It never throws — a card that cannot be proxied is still a card that can be sorted.

   `onBuilt` fires as each one lands, so the caller can write the record down then rather than at
   the end. A card of clips is twenty minutes of transcoding, and a run that only saves when it
   finishes leaves every proxy it has already made unrecorded — which is how the crop bar came to
   drag 4K originals through the browser with twenty small copies sitting unused on disk. */
const ensureProxies = async (
  manifest: Manifest,
  outputDir?: string,
  onProgress?: (done: number, total: number, filename: string) => void,
  onBuilt?: () => void
) => {
  const report: ProxyReport = { built: 0, skipped: 0, failed: [] }
  const candidates = manifest.files.filter(needsProxy)
  if (candidates.length === 0 || !hasCommand('ffmpeg')) return report

  for (const [index, file] of candidates.entries()) {
    onProgress?.(index, candidates.length, file.filename)
    const proxyPath = getProxyPath(file, outputDir)
    if (!proxyPath) continue
    if (fs.existsSync(proxyPath)) {
      if (file.proxy !== proxyPath) {
        file.proxy = proxyPath
        onBuilt?.()
      }
      report.skipped++
      continue
    }
    if (!fs.existsSync(file.path)) continue
    const shape = videoShape(file.path)
    /* already smaller than the proxy would be — the clip is its own proxy */
    if (shape !== null && shownWidth(shape) <= PROXY_MIN_WIDTH) {
      if (file.proxy !== file.path) {
        file.proxy = file.path
        onBuilt?.()
      }
      report.skipped++
      continue
    }
    const built = await buildProxy(file.path, proxyPath, shape)
    if (built.ok) {
      file.proxy = proxyPath
      report.built++
      onBuilt?.()
    } else {
      delete file.proxy
      report.failed.push(file.filename)
      report.reason ??= built.reason
    }
  }
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
    /* written down as each one lands: whoever asked for this may never see it finish, and a
       proxy nobody recorded is a proxy nobody uses */
    const report = await ensureProxies(manifest, dir, undefined, () =>
      saveManifest(manifestPath, manifest)
    )
    if (report.built > 0)
      console.log(
        `[Proxy] Built ${report.built} proxy file(s) in ${dir}/proxies using ${proxyEncoder()}${
          proxyEncoder() === 'vaapi' && !detection().cardScales ? ' (resized on the processor)' : ''
        }`
      )
    if (report.failed.length > 0)
      console.warn(
        `[Proxy] Could not build ${report.failed.length} of ${report.failed.length + report.built + report.skipped}: ${report.reason}\n[Proxy] ${report.failed.join(', ')}`
      )
    return report
  })()
  try {
    return await running
  } finally {
    running = null
  }
}

/* Where each clip's proxy has got to, and which file to actually play, keyed by the clip's path.

   Read off the disk rather than off the record. `file.proxy` is written only when a whole pass
   finishes, so a card half way through a twenty-minute build has proxies sitting there that the
   record knows nothing about — and the crop bar would drag the 4K original through the browser
   while the small copy went unused. Emptying the folder is the same problem the other way round
   (RULES, Principles — a state is a fact that can be checked).

   `own` is a clip already smaller than a proxy would be. It is finished, not pending: there is
   nothing left to make, which is a different thing from having nothing yet. */
type ProxyFact = { state: 'ready' | 'own' | 'none'; play: string }

const statProxies = (manifest: Manifest, outputDir?: string) => {
  const facts: Record<string, ProxyFact> = {}
  for (const file of manifest.files) {
    if (!needsProxy(file)) continue
    const proxyPath = getProxyPath(file, outputDir)
    if (file.proxy === file.path) facts[file.path] = { state: 'own', play: file.path }
    else if (proxyPath && fs.existsSync(proxyPath))
      facts[file.path] = { state: 'ready', play: proxyPath }
    else facts[file.path] = { state: 'none', play: file.path }
  }
  return facts
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
  proxyEncoder,
  setProxyEncoder,
  videoShape,
  ensureProxies,
  getCutProxyDir,
  getProxyDir,
  getProxyPath,
  needsProxy,
  proxyCounts,
  proxyIsCurrent,
  PROXY_MIN_WIDTH,
  PROXY_WIDTH,
  statProxies
}
export type { ProxyEncoder, ProxyFact, ProxyReport }
