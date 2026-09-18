import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import { isWholeFrame, orientationAfter, pictureFilter } from './frameCrop'
import { cropProxy, DRI_DEVICE, getCutProxyDir, proxyEncoder, videoShape } from './proxy'
import type { ProxyEncoder } from './proxy'
import { following } from './live'
import { lastComplaint, quote, run, runWatched } from './tools'
import type { ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getOutputDir, hasCommand, isVideoFile, parseDayEpoch } from './utils'
import {
  buildFsTime,
  buildGroupBaseName,
  buildPassengerFolder,
  formatGroupDay,
  hasCompletePassenger,
  hasPartialPassenger,
  makeFileName,
  toFileStem
} from './workspace'

type ProcessOptions = {
  manifestPath?: string
  outputDir?: string
  groupIds?: string[]
  destination?: string
}

/* a tool that has to succeed: what it printed, or the reason it did not */
const shell = async (line: string) => {
  const ran = await run(line)
  if (!ran.ok) throw new Error(lastComplaint(ran.stderr))
  return ran.stdout
}

/* The picture as it is watched: a clip carrying a turn in its metadata is shown turned, and the
   filters are handed frames already turned that way, so its sides are measured that way round. */
const shownShape = (src: string) => {
  const shape = videoShape(src)
  return shape && (shape.turned ? { width: shape.height, height: shape.width } : shape)
}

/* A photo is turned by its orientation tag, added to whatever turn it already carries: nothing is
   re-encoded, so nothing is lost, and every viewer draws it the way the tag says. */
const turnPhoto = async (dest: string, rotation: 90 | 180 | 270) => {
  const current = Number.parseInt(
    (await shell(`exiftool -n -s3 -Orientation ${quote(dest)}`)).trim(),
    10
  )
  const next = orientationAfter(Number.isFinite(current) ? current : 1, rotation)
  await shell(`exiftool -n -overwrite_original -q -Orientation=${next} ${quote(dest)}`)
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

const timeArgs = (cropStart?: number | null, cropEnd?: number | null) =>
  cropStart != null && cropEnd != null
    ? `-ss ${cropStart} -t ${(cropEnd - cropStart).toFixed(6)}`
    : ''

type OnPercent = (percent: number) => void

/* how long what is being written runs for, when that is the trim rather than the clip */
const trimSeconds = (cropStart?: number | null, cropEnd?: number | null) =>
  cropStart != null && cropEnd != null ? cropEnd - cropStart : null

/* The ends only: copied, never re-encoded. */
const trimVideo = async (
  src: string,
  dest: string,
  cropStart: number,
  cropEnd: number,
  onPercent?: OnPercent
) => {
  if (!hasCommand('ffmpeg')) return false
  const ran = await runWatched(
    `ffmpeg -y ${timeArgs(cropStart, cropEnd)} -i ${quote(src)} -c copy -avoid_negative_ts make_zero ${quote(dest)} 2>/dev/null`,
    onPercent,
    trimSeconds(cropStart, cropEnd)
  )
  return ran.ok
}

/* ffmpeg's own words when it fails — the one line that says why, not the stage that gave up after */
const runFfmpeg = async (line: string, onPercent?: OnPercent, seconds?: number | null) => {
  const ran = await runWatched(line, onPercent, seconds)
  return ran.ok ? { ok: true as const } : { ok: false as const, reason: lastComplaint(ran.stderr) }
}

/* A whole file copied as it is. The copy is left to the system, which is the fast way and says
   nothing while it works — so how far it has got is read off the size of what it has written. */
const copyWhole = async (src: string, dest: string, onPercent?: OnPercent) => {
  const total = onPercent ? fs.statSync(src).size : 0
  const watch =
    onPercent && total > 0
      ? setInterval(() => {
          fs.stat(dest, (error, stats) => {
            if (!error) onPercent(Math.min(99, Math.floor((stats.size / total) * 100)))
          })
        }, 500)
      : null
  try {
    await fs.promises.copyFile(src, dest)
  } finally {
    if (watch) clearInterval(watch)
  }
}

/* The picture changed — cut, turned, or both — and the ends with it if they were set. Decoding on the
   card where there is one, the same as the proxies, because unpacking 4K HEVC is what takes the time
   either way.

   The filter works in ordinary memory: `crop` and `scale` have hardware twins, but naming the
   rectangle in pixels of the source frame is the same arithmetic either way and this keeps one code
   path. An Intel or AMD card's encoder only takes frames that are on the card, so there they are
   handed back up before encoding — without that, every clip that needed its picture changed failed
   there, turned or cropped, with nothing more to say than that it had. */
const recodeVideo = async (
  src: string,
  dest: string,
  filter: string,
  cropStart?: number | null,
  cropEnd?: number | null,
  onPercent?: OnPercent
) => {
  if (!hasCommand('ffmpeg')) return { ok: false as const, reason: 'ffmpeg is not installed' }
  const run = (pick: ProxyEncoder) => {
    const decode =
      pick === 'nvenc'
        ? '-hwaccel cuda'
        : pick === 'vaapi'
          ? `-vaapi_device ${DRI_DEVICE()} -hwaccel vaapi`
          : ''
    const chain = pick === 'vaapi' ? `${filter},format=nv12,hwupload` : filter
    return runFfmpeg(
      `ffmpeg -y ${decode} ${timeArgs(cropStart, cropEnd)} -i ${quote(src)} -vf ${chain} ${DELIVERY_ARGS[pick].join(' ')} -c:a copy ${quote(dest)}`,
      onPercent,
      trimSeconds(cropStart, cropEnd)
    )
  }
  /* A graphics card is the fast way, not the only one. Whatever the card, its driver or the clip's
     format, a clip it cannot do is done again on the processor — slower, and certain wherever
     ffmpeg is — so no machine is ever left unable to deliver a turned or cropped clip. */
  const pick = proxyEncoder()
  const first = await run(pick)
  if (first.ok || pick === 'cpu') return first
  const again = await run('cpu')
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
  const paths = files.map(quote).join(' ')
  try {
    await shell(
      `exiftool -P -overwrite_original -m -q '-CreateDate<FileModifyDate' '-MediaCreateDate<FileModifyDate' '-TrackCreateDate<FileModifyDate' '-MediaModifyDate<FileModifyDate' '-TrackModifyDate<FileModifyDate' '-ModifyDate<FileModifyDate' '-DateTimeOriginal<FileModifyDate' '-CreationDate<FileModifyDate' ${paths}`
    )
  } catch (e) {
    throw new Error(
      `EXIF failed for ${path.basename(path.dirname(files[0]))}: ${e instanceof Error ? e.message : String(e)} — install exiftool`
    )
  }
}

/* Preparing again writes over what is there. Nothing is moved aside first: a copy is made from an
   original that has not moved, so the thing being replaced is a copy of the same file, and keeping
   the old one only left a folder of near-duplicates nobody was going to look through.

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

const isFlatGroup = (group: ManifestGroup) =>
  !hasCompletePassenger(group.passenger) && !!group.destination

const getGroupProcessedDir = (outputDir: string, group: ManifestGroup) => {
  const dayEpoch = parseDayEpoch(group.day) ?? Math.min(...group.files.map((f) => f.mtime))
  const baseName = buildGroupBaseName(group.passenger, group.label, dayEpoch)
  if (isFlatGroup(group)) {
    return { dir: getDestinationDir(outputDir, group.destination!), baseName, dayEpoch, flat: true }
  }
  const parent = group.destination
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
  const trimmed = file.cropStart != null && file.cropEnd != null
  /* The frame has to be cut out of the proxy as well, and the picture turned the same way. The
     editor opens on these, so a proxy still showing the mount in the corner, or lying on its side,
     would have somebody editing a picture that is not the one about to be rendered. The rectangle
     is fractions of the frame, which is why it applies to a 640-wide copy as readily as to the clip. */
  if (!isWholeFrame(file.frame) || file.rotation) {
    const shape = shownShape(file.proxy)
    if (!shape) return null
    const filter = pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })
    if (!filter) return null
    return (await recodeVideo(file.proxy, target, filter, file.cropStart, file.cropEnd)).ok
      ? target
      : null
  }
  if (trimmed) {
    if (!cropProxy(file.proxy, target, file.cropStart!, file.cropEnd!)) return null
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    await fs.promises.copyFile(file.proxy, target)
  }
  return target
}

const copyMedia = async (file: ManifestFile, dest: string, time: Date, onPercent?: OnPercent) => {
  const video = isVideoFile(file.path)
  const trimmed = file.cropStart != null && file.cropEnd != null
  /* the picture itself changes — cut, turned or both — so the clip is encoded again */
  const reshaped = video && (!isWholeFrame(file.frame) || Boolean(file.rotation))
  if (reshaped) {
    const shape = shownShape(file.path)
    if (!shape)
      throw new Error(
        `Cannot read the size of ${file.filename}: install ffprobe to crop or turn it`
      )
    const filter = pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })!
    const made = await recodeVideo(file.path, dest, filter, file.cropStart, file.cropEnd, onPercent)
    if (!made.ok) throw new Error(`ffmpeg could not crop or turn ${file.filename}: ${made.reason}`)
  } else if (video && trimmed) {
    if (!(await trimVideo(file.path, dest, file.cropStart!, file.cropEnd!, onPercent))) {
      throw new Error(
        `ffmpeg crop failed for ${file.filename} ${file.cropStart}→${file.cropEnd}: install ffmpeg or check range`
      )
    }
  } else {
    await copyWhole(file.path, dest, onPercent)
    if (!video && file.rotation) await turnPhoto(dest, file.rotation)
  }
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
    throw e
  }
}

const writeGroup = async (
  group: ManifestGroup,
  outputDir: string,
  usedNames: Set<string>,
  record: (source: ManifestFile, destPath: string) => void
) => {
  const { dir, baseName, dayEpoch, flat } = getGroupProcessedDir(outputDir, group)
  const written: string[] = []
  /* Whatever gets copied before something goes wrong stays where it is. Preparing is the most
     expensive thing SkyDock does, and the folder is not what says a copy is current — the per-file
     record is, and a file that was never recorded already reads as unprepared. So stopping part
     way costs the files it did not reach, and nothing more. */
  for (const file of group.files) {
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
    pruneStaleMedia(dir, new Set(names))
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
  record: (source: ManifestFile, destPath: string) => void
) => {
  const dir = getDestinationDir(outputDir, destination)
  const stem = toFileStem(destination, 'destination')
  const usedNames = new Set<string>()
  const written: string[] = []
  for (const file of files) {
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
type Running = { groupIds: string[]; destinations: string[]; done: Promise<unknown> }
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
    done: Promise.resolve()
  }
  const done = runProcess(options)
  job.done = done
  running = job
  try {
    return await done
  } finally {
    if (running === job) running = null
  }
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
  const looseByDestination = new Map<string, ManifestFile[]>()
  for (const file of manifest.files) {
    if (!file.destination || filesInGroups.has(file.path)) continue
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
  const groups = manifest.groups.filter(
    (g) =>
      g.files.length > 0 &&
      (groupIds.length > 0
        ? groupIds.includes(g.id)
        : !options?.destination || g.destination === options.destination)
  )

  /* A passenger's name half entered is not a passenger and not a place either: the rule that
     decides the folder sees no complete name, reads the jump as a place, and delivers it flat with
     every file named after the destination. What makes a jump a tandem is that somebody is in it,
     so a name that has been started and not finished is the thing to refuse — whatever the
     destination happens to be called. */
  const halfNamed = groups.filter((g) => hasPartialPassenger(g.passenger))
  if (halfNamed.length > 0)
    throw new Error(
      `Give ${halfNamed.length === 1 ? 'this passenger' : `these ${halfNamed.length} passengers`} a first and last name before processing — the name is the folder they get.`
    )

  const namePools = new Map<string, Set<string>>()
  const poolFor = (dir: string) => {
    const pool = namePools.get(dir) ?? new Set<string>()
    namePools.set(dir, pool)
    return pool
  }

  /* keyed by source path, holding the file as it was COPIED — a grouped file carries the group
     ref's crop, which the registry entry does not, and that crop is part of what produced the
     output, so the stamp has to come from this object and not from `manifest.files` */
  const processedPaths = new Map<string, { dest: string; source: ManifestFile }>()
  const record = (source: ManifestFile, destPath: string) => {
    processedPaths.set(source.path, { dest: destPath, source })
  }

  const asAsked = new Map(groups.map((g) => [g.id, copiedAs(g)]))
  let copied = 0
  for (const group of groups)
    copied += await writeGroup(
      group,
      outputDir,
      poolFor(getGroupProcessedDir(outputDir, group).dir),
      record
    )
  for (const destination of destinations) {
    copied += await writeLooseFiles(
      destination,
      looseByDestination.get(destination) ?? [],
      outputDir,
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
    const written = processedPaths.get(file.path)
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
  getDestinationDir,
  getGroupProcessedDir,
  isFlatGroup,
  processingNow,
  processJumps,
  pruneStaleMedia,
  whenProcessed
}
export type { ProcessOptions }
