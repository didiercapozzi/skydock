import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ProxyFact } from './boardAnswer'
import { changeBoardSoon, flushBoardChanges, loadManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { following, job } from './live'
import { lastComplaint, run, runWatched } from './tools'
import {
  ffmpegPath,
  ffprobePath,
  getManifestPath,
  getOutputDir,
  hasCommand,
  systemTool,
  isVideoFile
} from './utils'
import { untilQuiet } from './lib/quiet'
import { messageOf } from './lib/words'

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
const canEncode = async (program: string, args: string[], before: string[] = []) => {
  const trial = run(program, [
    '-hide_banner',
    '-loglevel',
    'error',
    ...before,
    '-f',
    'lavfi',
    '-i',
    'color=black:s=320x240:d=0.2',
    ...args,
    ...TRIAL_ARGS,
    '-f',
    'null',
    '-'
  ])
  /* a card that hangs is a card that cannot encode, and must not hold everything waiting on it */
  const hung = new Promise<{ ok: false }>((resolve) =>
    setTimeout(() => resolve({ ok: false }), 20_000).unref()
  )
  return (await Promise.race([trial, hung])).ok
}

/* A VAAPI card that can encode cannot necessarily scale. Resizing on the card goes through its
   video-processing unit, which is a separate entrypoint the driver may simply not offer — an Intel
   iHD driver decodes and encodes perfectly well yet answers every `scale_vaapi` with "the requested
   VAProfile is not supported". So the scaler gets a trial of its own, and a card without one still
   decodes and encodes while the processor does the resize in between: 5 seconds of 2.7K HEVC in 2
   seconds that way, against the 165s the processor takes doing all of it. */
const vaapiCanScale = async (program: string) =>
  canEncode(
    program,
    [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload,scale_vaapi=w=160:h=-2'],
    ['-vaapi_device', DRI_DEVICE()]
  )

/* which ffmpeg does it, and with what: a card is only reachable by an ffmpeg built to reach it */
type Detected = { encoder: ProxyEncoder; cardScales: boolean; program: string }

/* Tried once, in the background, as soon as anything needs an encoder — never while a request
   waits: each trial can take seconds, and a card that hangs, twenty.

   The ffmpeg the app carries is tried first, and then the one the machine has installed: the carried one
   is built to run anywhere and so has no graphics card in it, where the installed one usually has the
   card the machine has. The first pair that works is used for every proxy; none, and it is the processor
   with the one the app carries. */
const detectEncoder = async (): Promise<Detected> => {
  const asked = process.env.SKYDOCK_PROXY_ENCODER?.trim().toLowerCase()
  const carried = ffmpegPath()
  if (asked === 'cpu' || asked === 'nvenc')
    return { encoder: asked, cardScales: true, program: carried }
  if (asked === 'vaapi')
    return { encoder: 'vaapi', cardScales: await vaapiCanScale(carried), program: carried }
  if (!hasCommand('ffmpeg')) return { encoder: 'cpu', cardScales: false, program: carried }
  const vaapiReady = async (program: string) =>
    fs.existsSync(DRI_DEVICE()) &&
    (await canEncode(
      program,
      [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload'],
      ['-vaapi_device', DRI_DEVICE()]
    ))
  for (const program of [carried, systemTool('ffmpeg')].flatMap((one) => (one ? [one] : []))) {
    if (await canEncode(program, ENCODER_ARGS.nvenc))
      return { encoder: 'nvenc', cardScales: true, program }
    if (await vaapiReady(program))
      return { encoder: 'vaapi', cardScales: await vaapiCanScale(program), program }
  }
  return { encoder: 'cpu', cardScales: false, program: carried }
}

let detected: Promise<Detected> | null = null

const detection = () =>
  (detected ??= detectEncoder().then((found) => {
    console.log(`[Proxy] making small copies with ${found.encoder} through ${found.program}`)
    return found
  }))

const proxyEncoder = async () => (await detection()).encoder

/* only for tests and for saying which one was picked in a log line. A card is assumed to scale
   unless a test says otherwise, as most cards do. */
const setProxyEncoder = (next: ProxyEncoder | null, cardScales = true) => {
  detected =
    next === null ? null : Promise.resolve({ encoder: next, cardScales, program: ffmpegPath() })
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
const getProxyPath = (file: ManifestFile, outputDir?: string) => {
  /* a copy is of the same clip as its original, so the two share the one proxy */
  const clip = file.copyOf ?? file.id
  return clip ? path.join(getProxyDir(outputDir), `${clip}.mp4`) : null
}

/* Width, height and how the clip is meant to be turned. A phone or a 360 camera records sideways
   and records the turn beside it, so the frame on disk is not the frame anyone sees. */
const videoShape = async (src: string) => {
  if (!hasCommand('ffprobe')) return null
  const ran = await run(ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:stream_side_data=rotation',
    '-of',
    'default=nw=1',
    src
  ])
  if (!ran.ok) return null
  const out = ran.stdout
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
}

/* How wide the clip looks to someone watching it, which is the number the proxy has to shrink. */
const shownWidth = (shape: { width: number; height: number; turned: boolean }) =>
  shape.turned ? shape.height : shape.width

/* Every card scales to `nv12`, whatever the clip is: a 10-bit picture, which a camera now records, would
   otherwise stay 10-bit on the card and the encoder, which only takes 8, would refuse it. */
/* The processor's scaler is handed frames ffmpeg has already turned the right way up, so asking
   for a 640-wide frame is the whole of it. A graphics card is handed them as they sit on disk and
   the turn stays as a note on the side, so the edge to shrink is whichever one ends up across —
   get this wrong and a sideways clip, as a 360 camera records, comes out three times the size it
   was asked for. */
const scaleFilter = (shape: { turned: boolean } | null, hardware: boolean) => {
  if (!hardware) return `scale=${PROXY_WIDTH}:-2`
  return shape?.turned
    ? `scale_vaapi=w=-2:h=${PROXY_WIDTH}:format=nv12`
    : `scale_vaapi=w=${PROXY_WIDTH}:h=-2:format=nv12`
}

/* Written to a temporary name and moved into place, so an interrupted run leaves nothing that looks
   finished — the next pass would otherwise skip a half-written proxy forever. Why it failed comes
   back with the answer. */

const buildWith = async (
  program: string,
  pick: ProxyEncoder,
  cardScales: boolean,
  src: string,
  dest: string,
  shape: Awaited<ReturnType<typeof videoShape>>,
  onPercent?: (percent: number) => void
) => {
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
        ? `scale_cuda=w=-2:h=${PROXY_WIDTH}:format=nv12`
        : `scale_cuda=w=${PROXY_WIDTH}:h=-2:format=nv12`
      : vaapiHybrid
        ? `${scaleFilter(shape, false)},format=nv12,hwupload`
        : scaleFilter(shape, pick === 'vaapi')
  /* named for this process as well: two runs over the same clip — two windows, two servers — must never
     write into one file, or what is renamed into place is the two interleaved */
  const partial = `${dest}.${process.pid}.part`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  /* Making a small copy is the heaviest thing the app does and nobody is waiting on it, so it takes
     what the machine has to spare: half the processor at most, and behind everything else — the window
     and the pointer come first. */
  const cap =
    pick === 'cpu' ? ['-threads', String(Math.max(1, Math.floor(os.cpus().length / 2)))] : []
  const ran = await runWatched(
    program,
    [
      '-y',
      ...decode,
      '-i',
      src,
      '-vf',
      filter,
      ...ENCODER_ARGS[pick],
      ...cap,
      ...CONTAINER_ARGS,
      partial
    ],
    onPercent,
    undefined,
    true
  )
  if (ran.ok) {
    try {
      fs.renameSync(partial, dest)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, reason: messageOf(e) }
    }
  }
  if (fs.existsSync(partial)) fs.unlinkSync(partial)
  return { ok: false as const, reason: lastComplaint(ran.stderr) }
}

/* A card that passed its trial can still refuse a particular clip — a 10-bit or 4:4:4 picture, a codec it
   has no decoder for — and a clip without a small copy is the worst outcome, so what the card will not
   make is made by the processor, which takes anything. */
const buildProxy = async (
  src: string,
  dest: string,
  shape: Awaited<ReturnType<typeof videoShape>> = null,
  /* how far through the clip it is, for whoever is watching */
  onPercent?: (percent: number) => void
) => {
  if (!hasCommand('ffmpeg')) return { ok: false as const, reason: 'ffmpeg is not installed' }
  const { encoder, cardScales, program } = await detection()
  const first = await buildWith(program, encoder, cardScales, src, dest, shape, onPercent)
  if (first.ok || encoder === 'cpu') return first
  const again = await buildWith(ffmpegPath(), 'cpu', false, src, dest, shape, onPercent)
  return again.ok ? again : first
}

/* The timeline carries the cut footage, so a proxy of the whole clip would not line up with it.
   Every frame is a keyframe, so the same cut comes out of the proxy as a stream copy — no second
   transcode, and the same frames as the processed copy. */
/* Either end on its own is a trim: no start means from the beginning, no end means to the end of
   the clip. */
const cropProxy = async (
  src: string,
  dest: string,
  cropStart: number | null | undefined,
  cropEnd: number | null | undefined
) => {
  if (!hasCommand('ffmpeg')) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const ran = await run(ffmpegPath(), [
    '-y',
    ...(cropStart != null ? ['-ss', String(cropStart)] : []),
    '-i',
    src,
    ...(cropEnd != null ? ['-t', (cropEnd - (cropStart ?? 0)).toFixed(6)] : []),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    dest
  ])
  return ran.ok
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
  if (candidates.length === 0) return report
  /* no ffmpeg: every clip is settled with that as its reason, not left to look as though one is coming */
  if (!hasCommand('ffmpeg')) {
    for (const file of candidates)
      if (!fs.existsSync(getProxyPath(file, outputDir) ?? '') && file.proxy !== file.path)
        proxyFailures().set(file.path, 'ffmpeg is not installed, so no small copy can be made')
    return report
  }

  /* What is still to be made is the corner's to show, each clip with a bar of its own: a pass over what
     is all made already is over before anyone could read it, and says nothing. */
  const toMake = candidates.filter((file) => {
    const proxyPath = getProxyPath(file, outputDir)
    return proxyPath !== null && !fs.existsSync(proxyPath)
  })
  const making = toMake.length > 0 ? job({ type: 'proxy', label: '', total: toMake.length }) : null
  const rowOf = (file: ManifestFile) => file.id ?? file.path
  making?.rows(toMake.map((file) => ({ key: rowOf(file), name: file.filename, size: 0 })))
  try {
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
      /* an original that is not here cannot be copied small: said, so the clip does not wait for ever */
      if (!fs.existsSync(file.path)) {
        proxyFailures().set(file.path, 'The original is not on this machine')
        making?.row({ key: rowOf(file), at: 'failed', note: 'The original is not on this machine' })
        making?.step()
        continue
      }
      await untilQuiet()
      const shape = await videoShape(file.path)
      /* already smaller than the proxy would be — the clip is its own proxy */
      if (shape !== null && shownWidth(shape) <= PROXY_MIN_WIDTH) {
        if (file.proxy !== file.path) {
          file.proxy = file.path
          onBuilt?.()
        }
        report.skipped++
        making?.row({ key: rowOf(file), at: 'skipped' })
        making?.step()
        continue
      }
      /* said as it goes, and what the clip plays from now on said with its landing, so the board
       flags it without asking */
      const live = following('proxy', file.id)
      making?.row({ key: rowOf(file), at: 'now', part: 0 })
      const built = await buildProxy(file.path, proxyPath, shape, (percent) => {
        live.at(percent)
        making?.row({ key: rowOf(file), at: 'now', part: percent / 100 })
      })
      making?.row(
        built.ok
          ? { key: rowOf(file), at: 'done' }
          : { key: rowOf(file), at: 'failed', note: built.reason }
      )
      making?.step()
      if (built.ok) {
        proxyFailures().delete(file.path)
        file.proxy = proxyPath
        report.built++
        onBuilt?.()
        live.done(true, { proxy: { path: file.path, fact: { state: 'ready', play: proxyPath } } })
      } else {
        delete file.proxy
        proxyFailures().set(file.path, built.reason)
        report.failed.push(file.filename)
        report.reason ??= built.reason
        /* the failure said with its reason, so the board knows the clip is settled — it plays as it
         is, and a montage no longer waits on it — without reading everything again */
        live.done(false, {
          proxy: {
            path: file.path,
            fact: { state: 'none', play: file.path, reason: built.reason }
          }
        })
      }
    }
    onProgress?.(candidates.length, candidates.length, '')
    making?.finish()
    return report
  } catch (e) {
    making?.fail(e instanceof Error ? e.message : String(e))
    throw e
  }
}

/* One run at a time in a process: the board's Scan can be pressed twice, and two ffmpeg passes over
   the same card would fight over the same half-written files. The second caller waits for the first
   rather than starting again. */
let running: Promise<ProxyReport> | null = null

/* What a pass made, written into the manifest as it is on disk at that moment — never over it.

   A proxy is half a minute of transcoding, and the board goes on working meanwhile: a file dragged
   in, a jump named, a clip trimmed. All of that is saved by whoever did it, and saving the snapshot
   this pass began with would quietly undo it — which is how two of four files dropped in together
   came to be on the disk with no row on the board. So only what this pass is here to write is
   carried over: the small copy it made. */
const recordProxies = (manifestPath: string, pass: Manifest) =>
  changeBoardSoon(
    manifestPath,
    (current) => {
      const made = new Map(pass.files.map((file) => [file.id ?? file.path, file]))
      for (const file of current.files) {
        const done = made.get(file.id ?? file.path)
        if (!done) continue
        if (done.proxy) file.proxy = done.proxy
        /* a proxy that could not be made leaves no record behind — but only the disk may say that */ else if (
          file.proxy &&
          !fs.existsSync(file.proxy)
        )
          delete file.proxy
      }
    },
    /* the pass as it is now says everything an earlier call of it did */
    'proxies'
  )

/* Loads, builds what is missing, saves. Kept apart from the scan itself because a scan should
   answer at once — the proxies catch up behind it, and everything works without them meanwhile.

   Once round again whenever something was built: a file that arrived while ffmpeg was busy is in
   the manifest now but was not when this pass read it, and with one caller at a time nothing else
   would come back for it. */
const buildMissingProxies = async (outputDir?: string) => {
  if (running) return await running
  const dir = outputDir || getOutputDir()
  running = (async () => {
    const manifestPath = getManifestPath(dir)
    const report: ProxyReport = { built: 0, skipped: 0, failed: [] }
    for (;;) {
      const manifest = loadManifest(manifestPath)
      if (!manifest) break
      /* written down as each one lands: whoever asked for this may never see it finish, and a
         proxy nobody recorded is a proxy nobody uses */
      const pass = await ensureProxies(manifest, dir, undefined, () =>
        recordProxies(manifestPath, manifest)
      )
      /* the next round reads the board with this one's proxies on it */
      flushBoardChanges(manifestPath)
      report.built += pass.built
      report.skipped = pass.skipped
      /* a clip the next round tries again is one clip that could not be made, not two */
      report.failed = [...new Set([...report.failed, ...pass.failed])]
      report.reason ??= pass.reason
      if (pass.built === 0) break
    }
    if (report.built > 0) {
      const { encoder, cardScales } = await detection()
      console.log(
        `[Proxy] Built ${report.built} proxy file(s) in ${dir}/proxies using ${encoder}${
          encoder === 'vaapi' && !cardScales ? ' (resized on the processor)' : ''
        }`
      )
    }
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

/* The server can be stopped half way through a card — restarted, or the machine put to sleep — and
   the proxies it had not reached would then wait for the next scan, which may never come. So the
   first board to connect to a server just started has them made, taking up where the last run
   stopped; what that run left half written is cleared first, since nothing can still be writing it. */
declare global {
  var skydockProxiesResumed: boolean | undefined
}

/* a half-written copy is named for the process writing it: another server still running is not cleared */
const isBeingWritten = (name: string) => {
  const pid = Number(/\.(\d+)\.part$/.exec(name)?.[1])
  if (!pid || pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const resumeProxies = (outputDir?: string) => {
  /* what a stopped server left half written is cleared once, by the first board: nothing else can be
     writing it then, and a later board would be clearing what a pass is writing now */
  if (!globalThis.skydockProxiesResumed) {
    globalThis.skydockProxiesResumed = true
    const dir = getProxyDir(outputDir)
    if (fs.existsSync(dir))
      for (const name of fs.readdirSync(dir))
        if (name.endsWith('.part') && !isBeingWritten(name))
          fs.rmSync(path.join(dir, name), { force: true })
  }
  /* but what is missing is looked for each time a board connects: proxies taken from under a running
     server — a folder emptied, a disk changed — are made again, and a pass already under way is joined
     rather than started twice */
  void buildMissingProxies(outputDir).catch((e: unknown) => {
    console.error('[Proxy] resuming failed:', messageOf(e))
  })
}

/* Where each clip's proxy has got to, and which file to actually play, keyed by the clip's path.

   Read off the disk rather than off the record. `file.proxy` is written only when a whole pass
   finishes, so a card half way through a twenty-minute build has proxies sitting there that the
   record knows nothing about — and the crop bar would drag the 4K original through the browser
   while the small copy went unused. Emptying the folder is the same problem the other way round
   (RULES, Principles — a state is a fact that can be checked).

   `own` is a clip already smaller than a proxy would be. It is finished, not pending: there is
   nothing left to make, which is a different thing from having nothing yet. */

/* Why each clip's proxy could not be made, by its path, while the server runs — so the board names
   the failure with its reason rather than showing it as still to come. A pass that makes it clears
   it; every pass tries again. */
declare global {
  var skydockProxyFailures: Map<string, string> | undefined
}

const proxyFailures = () => (globalThis.skydockProxyFailures ??= new Map())

const statProxies = (manifest: Manifest, outputDir?: string) => {
  const facts: Record<string, ProxyFact> = {}
  for (const file of manifest.files) {
    if (!needsProxy(file)) continue
    const proxyPath = getProxyPath(file, outputDir)
    if (file.proxy === file.path) facts[file.path] = { state: 'own', play: file.path }
    else if (proxyPath && fs.existsSync(proxyPath))
      facts[file.path] = { state: 'ready', play: proxyPath }
    else {
      const reason =
        proxyFailures().get(file.path) ??
        (fs.existsSync(file.path) ? undefined : 'The original is not on this machine')
      facts[file.path] = { state: 'none', play: file.path, ...(reason ? { reason } : {}) }
    }
  }
  return facts
}

export {
  buildMissingProxies,
  resumeProxies,
  cropProxy,
  DRI_DEVICE,
  proxyEncoder,
  setProxyEncoder,
  videoShape,
  ensureProxies,
  getCutProxyDir,
  getProxyPath,
  needsProxy,
  statProxies
}
export type { ProxyEncoder }
