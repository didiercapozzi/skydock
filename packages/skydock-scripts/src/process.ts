import * as fs from 'node:fs'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
import { startOfFiles } from './clustering'
import { counted } from './lib/counted'
import { loadManifest, saveManifest } from './manifest'
import { isWholeFrame, orientationAfter, pictureFilter } from './frameCrop'
import { cropProxy, DRI_DEVICE, getCutProxyDir, proxyEncoder, videoShape } from './proxy'
import type { ProxyEncoder } from './proxy'
import { following } from './live'
import { keepProject } from './projectHistory'
import { lastComplaint, run, runWatched, stoppable } from './tools'
import type { ManifestFile, ManifestGroup } from './types'
import {
  exiftoolPath,
  ffmpegPath,
  getManifestPath,
  getOutputDir,
  hasCommand,
  isVideoFile,
  parseDayEpoch
} from './utils'
import {
  buildFsTime,
  buildGroupBaseName,
  buildPassengerFolder,
  formatGroupDay,
  hasCompletePassenger,
  isMontage,
  makeFileName,
  MONTAGES_FOLDER,
  toFileStem
} from './workspace'
import { messageOf } from './lib/words'

type ProcessOptions = {
  manifestPath?: string
  outputDir?: string
  groupIds?: string[]
  destination?: string
  /* only these files of a dropzone, by their id: a dropzone's day with one file still to prepare is
     not prepared again whole — what is up there already is left as it is */
  fileIds?: string[]
}

/* exiftool where it has to succeed: what it printed, or the reason it did not */
const exif = async (args: string[]) => {
  const ran = await run(exiftoolPath(), args)
  if (!ran.ok) throw new Error(lastComplaint(ran.stderr))
  return ran.stdout
}

/* The picture as it is watched: a clip carrying a turn in its metadata is shown turned, and the
   filters are handed frames already turned that way, so its sides are measured that way round. */
const shownShape = async (src: string) => {
  const shape = await videoShape(src)
  return shape && (shape.turned ? { width: shape.height, height: shape.width } : shape)
}

/* What a delivered file was made from, written into the file itself: the content id of the
   original. Every name changes on the way out, so a copy that leaves SkyDock — downloaded from the
   storage, passed on, found again years later — can still say where it came from, and a storage
   whose list was lost can be read back from the files themselves.

   Written with exiftool rather than by the ffmpeg that made the file, so that it costs a moment
   whatever the file weighs and touches nothing but the metadata: a quarter of a second on a
   230 MB clip, with every stream left as it was. Remuxing to add a label would not be that — a DJI
   clip carries a debug track that has no tag in an mp4 at all, so ffmpeg cannot write it back, and
   a copy relabelled that way would come out short of what the camera recorded.

   Only delivered copies carry it. An original never does: what is proved against a camera is the
   bytes of the file on the card, and a tag would change them (RULES, Seeing what is on a camera). */
const ORIGIN_TAG = 'skydock:from='

const tagOrigin = async (dest: string, from: string | undefined) => {
  if (!from || !hasCommand('exiftool')) return
  /* the label is a courtesy: a file that could not take one is still the file that was asked for */
  await exif(['-overwrite_original', '-q', `-Comment=${ORIGIN_TAG}${from}`, dest]).catch(
    () => undefined
  )
}

/* A photo is turned by its orientation tag, added to whatever turn it already carries: nothing is
   re-encoded, so nothing is lost, and every viewer draws it the way the tag says. */
const turnPhoto = async (dest: string, rotation: 90 | 180 | 270) => {
  const current = Number.parseInt((await exif(['-n', '-s3', '-Orientation', dest])).trim(), 10)
  const next = orientationAfter(Number.isFinite(current) ? current : 1, rotation)
  await exif(['-n', '-overwrite_original', '-q', `-Orientation=${next}`, dest])
}

/* Cutting the ends off a clip moves no pixels, so the stream is copied: instant, and not a frame
   of quality lost. Cutting the frame cannot be: the picture itself changes, so it has to be
   encoded again, and that is the one thing here that costs real time.

   Delivery is encoded for quality, not for speed. These are the files a passenger is given and the
   ones the montage is cut from — nothing like the proxies, which are throwaway and can be coarse. */
const DELIVERY_ARGS: Record<ProxyEncoder, string[]> = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '20', '-b:v', '0'],
  vaapi: ['-c:v', 'h264_vaapi', '-qp', '20'],
  cpu: ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p']
}

/* A trim is two ends and either of them on its own is a trim: dragging the right handle alone says
   "up to here", and the clip still starts where it starts. Asking for both made a one-ended trim
   silently do nothing — the copy came out whole while everything else recorded it as cut. */
const isTrimmed = (file: { cropStart?: number | null; cropEnd?: number | null }) =>
  file.cropStart != null || file.cropEnd != null

const timeArgs = (cropStart?: number | null, cropEnd?: number | null) => [
  ...(cropStart != null ? ['-ss', String(cropStart)] : []),
  ...(cropEnd != null ? ['-t', (cropEnd - (cropStart ?? 0)).toFixed(6)] : [])
]

type OnPercent = (percent: number) => void

/* how long what is being written runs for, when that is the trim rather than the clip. A trim with
   no end runs to the end of the clip, whose length is not known here. */
const trimSeconds = (cropStart?: number | null, cropEnd?: number | null) =>
  cropEnd != null ? cropEnd - (cropStart ?? 0) : null

/* The ends only: copied, never re-encoded. */
const trimVideo = async (
  src: string,
  dest: string,
  cropStart: number | null | undefined,
  cropEnd: number | null | undefined,
  onPercent?: OnPercent
) => {
  if (!hasCommand('ffmpeg')) return false
  const ran = await runWatched(
    ffmpegPath(),
    [
      '-y',
      ...timeArgs(cropStart, cropEnd),
      '-i',
      src,
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      dest
    ],
    onPercent,
    trimSeconds(cropStart, cropEnd)
  )
  return ran.ok
}

/* ffmpeg's own words when it fails — the one line that says why, not the stage that gave up after */
const runFfmpeg = async (args: string[], onPercent?: OnPercent, seconds?: number | null) => {
  const ran = await runWatched(ffmpegPath(), args, onPercent, seconds)
  return ran.ok ? { ok: true as const } : { ok: false as const, reason: lastComplaint(ran.stderr) }
}

/* A whole file copied as it is, streamed, so a run that is cancelled stops mid-file — and counted as
   it goes (lib/counted), so how far it has got is said without asking the disk. */
const copyWhole = async (src: string, dest: string, onPercent?: OnPercent) => {
  const total = onPercent ? fs.statSync(src).size : 0
  const bytes = counted(
    total > 0 ? (done) => onPercent?.(Math.min(99, Math.floor((done / total) * 100))) : undefined,
    false
  )
  await streams.pipeline(fs.createReadStream(src), bytes.through, fs.createWriteStream(dest), {
    signal: stoppable().getStore()
  })
}

/* The picture changed — cut, turned, or both — and the ends with it if they were set. Decoding on the
   card where there is one, the same as the proxies, because unpacking 4K HEVC is what takes the time
   either way.

   The filter works in ordinary memory: `crop` and `scale` have hardware twins, but naming the
   rectangle in pixels of the source frame is the same arithmetic either way and this keeps one code
   path. An Intel or AMD card's encoder only takes frames that are on the card, so there they are
   handed back up before encoding — otherwise every clip that needs its picture changed, turned or
   cropped, fails there with nothing more to say than that it did. */
const recodeVideo = async (
  src: string,
  dest: string,
  filter: string,
  cropStart?: number | null,
  cropEnd?: number | null,
  onPercent?: OnPercent
) => {
  if (!hasCommand('ffmpeg')) return { ok: false as const, reason: 'ffmpeg is not installed' }
  const encode = (pick: ProxyEncoder) => {
    const decode =
      pick === 'nvenc'
        ? ['-hwaccel', 'cuda']
        : pick === 'vaapi'
          ? ['-vaapi_device', DRI_DEVICE(), '-hwaccel', 'vaapi']
          : []
    const chain = pick === 'vaapi' ? `${filter},format=nv12,hwupload` : filter
    return runFfmpeg(
      [
        '-y',
        ...decode,
        ...timeArgs(cropStart, cropEnd),
        '-i',
        src,
        '-vf',
        chain,
        ...DELIVERY_ARGS[pick],
        '-c:a',
        'copy',
        dest
      ],
      onPercent,
      trimSeconds(cropStart, cropEnd)
    )
  }
  /* A graphics card is the fast way, not the only one. Whatever the card, its driver or the clip's
     format, a clip it cannot do is done again on the processor — slower, and certain wherever
     ffmpeg is — so no machine is ever left unable to deliver a turned or cropped clip. */
  const pick = await proxyEncoder()
  const first = await encode(pick)
  if (first.ok || pick === 'cpu') return first
  const again = await encode('cpu')
  if (again.ok) {
    console.warn(
      `[Process] ${path.basename(src)}: the graphics card could not (${first.reason}) — done on the processor`
    )
    return again
  }
  return { ok: false as const, reason: `${first.reason}; on the processor: ${again.reason}` }
}

const updateMetadata = async (files: string[]) => {
  if (files.length === 0) return
  try {
    await exif([
      '-P',
      '-overwrite_original',
      '-m',
      '-q',
      '-CreateDate<FileModifyDate',
      '-MediaCreateDate<FileModifyDate',
      '-TrackCreateDate<FileModifyDate',
      '-MediaModifyDate<FileModifyDate',
      '-TrackModifyDate<FileModifyDate',
      '-ModifyDate<FileModifyDate',
      '-DateTimeOriginal<FileModifyDate',
      '-CreationDate<FileModifyDate',
      ...files
    ])
  } catch (e) {
    throw new Error(
      `EXIF failed for ${path.basename(path.dirname(files[0]))}: ${messageOf(e)} — install exiftool`
    )
  }
}

/* Preparing again writes over what is there. Nothing is moved aside first: a copy is made from an
   original that has not moved, so the thing being replaced is a copy of the same file, and keeping
   the old one would only leave a folder of near-duplicates nobody is going to look through.

   What has to go is the copy whose name is no longer generated — a clip whose time was corrected
   leaves one behind, and a file nobody expects is a file that would be delivered anyway. So the
   names just written are the folder's contents, and anything else under them is removed.

   Only ever for a folder one group owns. A dropzone folder holds every day ever shot there, and
   the manifest only knows what the last scan found, so pruning it would take older days with it.
   The project, the film and the archives are left alone: they sit beside the media rather than in
   it, and an edit is the one thing here that cannot be made again. */
const pruneTo = (folder: string, kept: Set<string>) => {
  if (!fs.existsSync(folder)) return
  for (const entry of fs.readdirSync(folder)) {
    if (kept.has(entry)) continue
    fs.rmSync(path.join(folder, entry), { recursive: true, force: true })
  }
}

const pruneStaleMedia = (dir: string, kept: Set<string>) => {
  for (const media of ['videos', 'photos']) pruneTo(path.join(dir, media), kept)
}

const getDestinationDir = (outputDir: string, destination: string) =>
  path.join(outputDir, 'processed', destination.replace(/[/\\]+/g, '_').trim() || 'destination')

/* a destination's files lie flat in its folder, whatever it is called; a montage has a folder of its own */
const isFlatGroup = (group: ManifestGroup) => !isMontage(group) && !!group.destination

const getGroupProcessedDir = (outputDir: string, group: ManifestGroup) => {
  const dayEpoch = parseDayEpoch(group.day) ?? startOfFiles(group.files)
  const baseName = buildGroupBaseName(group.passenger, group.label, dayEpoch)
  if (isFlatGroup(group)) {
    return { dir: getDestinationDir(outputDir, group.destination!), baseName, dayEpoch, flat: true }
  }
  const parent = isMontage(group)
    ? getDestinationDir(outputDir, MONTAGES_FOLDER)
    : group.destination
      ? getDestinationDir(outputDir, group.destination)
      : path.join(outputDir, 'processed')
  const folder = hasCompletePassenger(group.passenger)
    ? buildPassengerFolder(group.passenger, baseName)
    : baseName
  return { dir: path.join(parent, folder), baseName, dayEpoch, flat: false }
}

/* The proxy that belongs to the copy just written, cut the same way it was. Only where a montage
   can happen — a dropzone folder never becomes a project, so a proxy there would be litter. It is
   a stream copy out of the import proxy, not a second transcode, so it costs almost nothing; and
   when it cannot be made the montage simply opens on the full clips as it always did.

   It is written away from the copy it belongs to, under the output folder's own proxies, because
   a passenger's folder goes to the storage whole and a working file has no business going with
   it. */
const writeCutProxy = async (
  file: ManifestFile,
  dest: string,
  outputDir: string,
  groupId: string
) => {
  if (!isVideoFile(file.path) || !file.proxy || !fs.existsSync(file.proxy)) return null
  const target = path.join(getCutProxyDir(outputDir, groupId), `${path.parse(dest).name}.mp4`)
  const trimmed = isTrimmed(file)
  /* The frame has to be cut out of the proxy as well, and the picture turned the same way. The
     editor opens on these, so a proxy still showing the mount in the corner, or lying on its side,
     would have somebody editing a picture that is not the one about to be rendered. The rectangle
     is fractions of the frame, which is why it applies to a 640-wide copy as readily as to the clip. */
  if (!isWholeFrame(file.frame) || file.rotation) {
    const shape = await shownShape(file.proxy)
    if (!shape) return null
    const filter = pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })
    if (!filter) return null
    return (await recodeVideo(file.proxy, target, filter, file.cropStart, file.cropEnd)).ok
      ? target
      : null
  }
  if (trimmed) {
    if (!(await cropProxy(file.proxy, target, file.cropStart, file.cropEnd))) return null
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    await fs.promises.copyFile(file.proxy, target)
  }
  return target
}

const copyMedia = async (file: ManifestFile, dest: string, time: Date, onPercent?: OnPercent) => {
  const video = isVideoFile(file.path)
  const trimmed = isTrimmed(file)
  /* the picture itself changes — cut, turned or both — so the clip is encoded again */
  const reshaped = video && (!isWholeFrame(file.frame) || Boolean(file.rotation))
  const shape = reshaped ? await shownShape(file.path) : null
  if (reshaped && !shape)
    throw new Error(`Cannot read the size of ${file.filename}: install ffprobe to crop or turn it`)
  /* nothing to do to the picture after all — a landscape fill asked of a clip already landscape */
  const filter = shape && pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })
  if (filter) {
    const made = await recodeVideo(file.path, dest, filter, file.cropStart, file.cropEnd, onPercent)
    if (!made.ok) throw new Error(`ffmpeg could not crop or turn ${file.filename}: ${made.reason}`)
  } else if (video && trimmed) {
    if (!(await trimVideo(file.path, dest, file.cropStart, file.cropEnd, onPercent))) {
      throw new Error(
        `ffmpeg crop failed for ${file.filename} ${file.cropStart}→${file.cropEnd}: install ffmpeg or check range`
      )
    }
  } else {
    await copyWhole(file.path, dest, onPercent)
    if (!video && file.rotation) await turnPhoto(dest, file.rotation)
  }
  await tagOrigin(dest, file.copyOf ?? file.id)
  /* last of all: the time it was shot, which the label would otherwise have moved to now */
  fs.utimesSync(dest, time, time)
}

/* One file written, said as it goes: that it began, how far through it is, and how it ended —
   ended only once everything that belongs to the copy is there, its cut proxy included. */
const writeOne = async (
  file: ManifestFile,
  dest: string,
  time: Date,
  after?: () => Promise<unknown>
) => {
  const live = following('process', file.id)
  try {
    await copyMedia(file, dest, time, live.at)
    await after?.()
    live.done(true)
  } catch (e) {
    live.done(false)
    /* a file cut off by a cancel is half written, and must not pass for a copy */
    if (stoppable().getStore()?.aborted) fs.rmSync(dest, { force: true })
    throw e
  }
}

class ProcessingCancelled extends Error {}

/* checked before each file: a run that was cancelled starts nothing more */
const stopIfCancelled = () => {
  if (stoppable().getStore()?.aborted)
    throw new ProcessingCancelled(
      'Processing was cancelled. What was not finished is left to process again.'
    )
}

const writeGroup = async (
  group: ManifestGroup,
  outputDir: string,
  usedNames: Set<string>,
  record: (source: ManifestFile, destPath: string) => void,
  only?: Set<string>
) => {
  const { dir, baseName, dayEpoch, flat } = getGroupProcessedDir(outputDir, group)
  /* the edit as it stands, copied aside before the copies underneath it are written again */
  keepProject(outputDir, dir, baseName)
  const written: string[] = []
  /* Whatever gets copied before something goes wrong stays where it is. Preparing is the most
     expensive thing SkyDock does, and the folder is not what says a copy is current — the per-file
     record is, and a file that was never recorded already reads as unprepared. So stopping part
     way costs the files it did not reach, and nothing more. */
  for (const file of group.files) {
    stopIfCancelled()
    if (only && !only.has(file.id ?? file.path)) continue
    if (!fs.existsSync(file.path)) continue
    const targetDir = flat ? dir : path.join(dir, isVideoFile(file.path) ? 'videos' : 'photos')
    fs.mkdirSync(targetDir, { recursive: true })
    const ext = path.extname(file.path).slice(1).toLowerCase()
    const stem = flat
      ? `${toFileStem(group.destination!, 'destination')}_${formatGroupDay(file.mtime)}`
      : baseName
    const dest = path.join(targetDir, makeFileName(stem, file.mtime, ext, usedNames))
    await writeOne(file, dest, buildFsTime(flat ? file.mtime : dayEpoch, file.mtime), async () => {
      if (!flat) await writeCutProxy(file, dest, outputDir, group.id)
    })
    record(file, dest)
    written.push(dest)
  }
  await updateMetadata(written)
  if (!flat) {
    const names = written.map((entry) => path.basename(entry))
    /* A passenger's folder can hold more than this jump: their other jumps share it. What goes is a
       copy nobody claims — neither written now, nor one of those other jumps' own. */
    pruneStaleMedia(dir, usedNames)
    /* a cut proxy is of the copy it is named after, so the same names decide both */
    pruneTo(
      getCutProxyDir(outputDir, group.id),
      new Set(names.map((n) => `${path.parse(n).name}.mp4`))
    )
  }
  group.processed = true
  delete group.publish
  console.log(`[Process] ${group.id}: copied ${written.length} file(s) to ${dir}`)
  return written.length
}

const writeLooseFiles = async (
  destination: string,
  files: ManifestFile[],
  outputDir: string,
  usedNames: Set<string>,
  record: (source: ManifestFile, destPath: string) => void
) => {
  const dir = getDestinationDir(outputDir, destination)
  const stem = toFileStem(destination, 'destination')
  const written: string[] = []
  for (const file of files) {
    stopIfCancelled()
    if (!fs.existsSync(file.path)) continue
    fs.mkdirSync(dir, { recursive: true })
    const ext = path.extname(file.path).slice(1).toLowerCase()
    const name = makeFileName(`${stem}_${formatGroupDay(file.mtime)}`, file.mtime, ext, usedNames)
    const dest = path.join(dir, name)
    await writeOne(file, dest, buildFsTime(file.mtime, file.mtime))
    record(file, dest)
    written.push(dest)
  }
  await updateMetadata(written)
  console.log(`[Process] ${destination}: copied ${written.length} loose file(s) to ${dir}`)
  return written.length
}

/* What is being prepared right now. The server outlives the page that asked: a refresh drops the
   request but not the work, so the page that comes back asks here rather than offering to start
   the same thing a second time on top of it. */
type Running = {
  groupIds: string[]
  destinations: string[]
  done: Promise<unknown>
  stop: AbortController
}
let running: Running | null = null

const processingNow = () =>
  running ? { groupIds: running.groupIds, destinations: running.destinations } : null

/* settles when what is running now has finished, however it ended */
const whenProcessed = async () => {
  await running?.done.catch(() => undefined)
}

/* the part of a jump that decides what its copies are — if any of it changed while they were
   being written, what was written is not of this jump any more */
const copiedAs = (group: ManifestGroup) =>
  JSON.stringify(
    group.files.map((f) => [
      f.path,
      f.mtime,
      f.cropStart ?? null,
      f.cropEnd ?? null,
      f.frame ?? null,
      f.rotation ?? 0
    ])
  )

/* One preparation at a time: two at once would fight over the card and the disk, and over the
   folders if they overlap. The second is refused and says so, rather than queued out of sight. */
const processJumps = async (options?: ProcessOptions) => {
  if (running) throw new Error('Already processing — wait for it to finish, then try again.')
  const job: Running = {
    groupIds: options?.groupIds ?? [],
    destinations: options?.destination ? [options.destination] : [],
    done: Promise.resolve(),
    stop: new AbortController()
  }
  const done = stoppable().run(job.stop.signal, () => runProcess(options))
  job.done = done
  running = job
  try {
    return await done
  } catch (e) {
    /* whatever a cancel cut short — a command stopped, a copy cut off — is said as the cancel it is */
    if (job.stop.signal.aborted && !(e instanceof ProcessingCancelled))
      throw new ProcessingCancelled(
        'Processing was cancelled. What was not finished is left to process again.'
      )
    throw e
  } finally {
    if (running === job) running = null
  }
}

/* Stops what is being processed: the file under way is dropped and nothing more is started; the
   copies already finished stay on the disk, and the run records nothing as processed. False when
   nothing was running. */
const cancelProcessing = () => {
  if (!running) return false
  running.stop.abort()
  return true
}

const runProcess = async (options?: ProcessOptions) => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)

  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    console.error('[Process] ERROR: Manifest not found')
    return { copied: 0, processedGroups: 0 }
  }

  const filesInGroups = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.path)))
  const only = options?.fileIds ? new Set(options.fileIds) : undefined
  const looseByDestination = new Map<string, ManifestFile[]>()
  for (const file of manifest.files) {
    if (!file.destination || filesInGroups.has(file.path)) continue
    if (only && !only.has(file.id ?? file.path)) continue
    looseByDestination.set(file.destination, [
      ...(looseByDestination.get(file.destination) ?? []),
      file
    ])
  }

  const groupIds = options?.groupIds ?? []
  const destinations = options?.destination
    ? [options.destination]
    : groupIds.length > 0
      ? []
      : [
          ...new Set([
            ...manifest.groups.flatMap((g) => (g.destination ? [g.destination] : [])),
            ...looseByDestination.keys()
          ])
        ]
  /* a jump freed from this machine has nothing here to make copies of */
  const groups = manifest.groups.filter(
    (g) =>
      g.files.length > 0 &&
      !g.freed &&
      (groupIds.length > 0
        ? groupIds.includes(g.id)
        : !options?.destination || g.destination === options.destination) &&
      (!only || g.files.some((f) => only.has(f.id ?? f.path)))
  )
  /* what a run does to a jump: all of it, or — for a dropzone's, when asked for particular files —
     only those; a montage's copies are one folder that is kept to what the run wrote, so it is
     prepared whole */
  const takenOf = (g: ManifestGroup) => (only && isFlatGroup(g) ? only : undefined)

  const namePools = new Map<string, Set<string>>()
  const poolFor = (dir: string) => {
    const pool = namePools.get(dir) ?? new Set<string>()
    namePools.set(dir, pool)
    return pool
  }
  /* Every name a copy already carries stays taken, unless the file carrying it is being processed
     now — then it takes its own name back, which is how processing again writes over itself. So a
     passenger's other jumps keep their copies, a freed file keeps the name its copy has on the
     storage, and a dropzone's jump processed on its own cannot be given the name a loose file shot
     in the same second already has and sent over the top of it. */
  const inRun = new Set([
    ...groups.flatMap((g) =>
      g.files.flatMap((f) => {
        const taken = takenOf(g)
        return !taken || taken.has(f.id ?? f.path) ? [f.id ?? f.path] : []
      })
    ),
    ...destinations.flatMap((d) => (looseByDestination.get(d) ?? []).map((f) => f.id ?? f.path))
  ])
  /* the folder each copy belongs to is the one the run writes into, not the one it sits in: a
     passenger's copies are under videos and photos, and the names are held for the folder above */
  const hold = (file: ManifestFile, dir: string) => {
    if (file.processed && !inRun.has(file.id ?? file.path))
      poolFor(dir).add(path.basename(file.processed.path))
  }
  for (const group of manifest.groups)
    for (const file of group.files) hold(file, getGroupProcessedDir(outputDir, group).dir)
  for (const file of manifest.files)
    if (file.destination) hold(file, getDestinationDir(outputDir, file.destination))

  /* keyed by the source's identity — a copy shares its original's path, and both may be written in
     one pass — holding the file as it was COPIED — a grouped file carries the group
     ref's crop, which the registry entry does not, and that crop is part of what produced the
     output, so the stamp has to come from this object and not from `manifest.files` */
  const processedPaths = new Map<string, { dest: string; source: ManifestFile }>()
  const record = (source: ManifestFile, destPath: string) => {
    processedPaths.set(source.id ?? source.path, { dest: destPath, source })
  }

  const asAsked = new Map(groups.map((g) => [g.id, copiedAs(g)]))
  let copied = 0
  for (const group of groups)
    copied += await writeGroup(
      group,
      outputDir,
      poolFor(getGroupProcessedDir(outputDir, group).dir),
      record,
      takenOf(group)
    )
  for (const destination of destinations) {
    copied += await writeLooseFiles(
      destination,
      looseByDestination.get(destination) ?? [],
      outputDir,
      poolFor(getDestinationDir(outputDir, destination)),
      record
    )
  }

  /* Stamp each source with where it landed and what it was made from, so the board can tell a
     current copy from one whose source has moved on. A fresh copy is not the copy that went to
     the NAS, so the upload record goes — if the bytes are identical the next dedup pass restores
     it without sending anything.

     Into the manifest as it is now, not as it was when this began: the board went on being used
     while the copies were written, and saving the old one back would undo every edit made
     meanwhile. A jump changed in that time keeps its own state — its copies are of what it was. */
  const current = loadManifest(manifestPath) ?? manifest
  for (const group of current.groups) {
    const asked = asAsked.get(group.id)
    if (asked === undefined || asked !== copiedAs(group)) continue
    group.processed = true
    delete group.publish
  }
  for (const file of current.files) {
    const written = processedPaths.get(file.id ?? file.path)
    if (!written) continue
    const { dest, source } = written
    file.processed = {
      path: dest,
      size: fs.statSync(dest).size,
      at: Math.floor(Date.now() / 1000),
      source: {
        id: source.id,
        size: source.size,
        mtime: source.mtime,
        cropStart: source.cropStart ?? null,
        cropEnd: source.cropEnd ?? null,
        frame: source.frame ?? null,
        rotation: source.rotation ?? null
      }
    }
    delete file.uploaded
  }

  if (groups.length > 0 || processedPaths.size > 0) saveManifest(manifestPath, current)

  console.log(`[Process] Done. Copied ${copied} file(s).`)

  return { copied, processedGroups: groups.length }
}

export {
  cancelProcessing,
  getDestinationDir,
  getGroupProcessedDir,
  isFlatGroup,
  processingNow,
  processJumps,
  whenProcessed,
  writeCutProxy
}
