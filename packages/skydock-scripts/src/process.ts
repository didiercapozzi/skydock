import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
import { startOfFiles } from './clustering'
import { outputKeyOf } from './fileStatus'
import { counted } from './lib/counted'
import { pathExists } from './lib/fs'
import { loadManifestAsync, pairStamp, saveManifest } from './manifest'
import { isWholeFrame, orientationAfter, pictureFilter } from './frameCrop'
import { cropProxy, DRI_DEVICE, proxyEncoder, videoShape } from './proxy'
import type { ProxyEncoder } from './proxy'
import { following, job, publish } from './live'
import { keepEdit } from './projectHistory'
import { lastComplaint, run, runWatched, stoppable } from './tools'
import type { ManifestFile, ManifestGroup } from './types'
import {
  exiftoolPath,
  ffmpegPath,
  getManifestPath,
  getOutputDir,
  hasCommand,
  isVideoFile,
  mapWithLimit,
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
  fileIds?: string[]
}

const exif = async (args: string[]) => {
  const ran = await run(await exiftoolPath(), args)
  if (!ran.ok) throw new Error(lastComplaint(ran.stderr))
  return ran.stdout
}

const shownShape = async (src: string) => {
  const shape = await videoShape(src)
  return shape && (shape.turned ? { width: shape.height, height: shape.width } : shape)
}

const ORIGIN_TAG = 'skydock:from='

const turnPhoto = async (dest: string, rotation: 90 | 180 | 270) => {
  const current = Number.parseInt((await exif(['-n', '-s3', '-Orientation', dest])).trim(), 10)
  const next = orientationAfter(Number.isFinite(current) ? current : 1, rotation)
  await exif(['-n', '-overwrite_original', '-q', `-Orientation=${next}`, dest])
}

const DELIVERY_ARGS: Record<ProxyEncoder, string[]> = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '20', '-b:v', '0'],
  vaapi: ['-c:v', 'h264_vaapi', '-qp', '20'],
  cpu: ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p']
}

const isTrimmed = (file: { cropStart?: number | null; cropEnd?: number | null }) =>
  file.cropStart != null || file.cropEnd != null

const timeArgs = (cropStart?: number | null, cropEnd?: number | null) => [
  ...(cropStart != null ? ['-ss', String(cropStart)] : []),
  ...(cropEnd != null ? ['-t', (cropEnd - (cropStart ?? 0)).toFixed(6)] : [])
]

type OnPercent = (percent: number) => void

const trimSeconds = (cropStart?: number | null, cropEnd?: number | null) =>
  cropEnd != null ? cropEnd - (cropStart ?? 0) : null

const runFfmpeg = async (args: string[], onPercent?: OnPercent, seconds?: number | null) => {
  const ran = await runWatched(await ffmpegPath(), args, onPercent, seconds)
  return ran.ok ? { ok: true as const } : { ok: false as const, reason: lastComplaint(ran.stderr) }
}

const trimVideo = async (
  src: string,
  dest: string,
  cropStart: number | null | undefined,
  cropEnd: number | null | undefined,
  onPercent?: OnPercent
) => {
  if (!(await hasCommand('ffmpeg'))) return false
  const ran = await runFfmpeg(
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

const copyWhole = async (src: string, dest: string, onPercent?: OnPercent) => {
  const total = onPercent ? (await stat(src)).size : 0
  const bytes = counted(
    total > 0 ? (done) => onPercent?.(Math.min(99, Math.floor((done / total) * 100))) : undefined,
    false
  )
  await streams.pipeline(createReadStream(src), bytes.through, createWriteStream(dest), {
    signal: stoppable().getStore()
  })
}

const recodeVideo = async (
  src: string,
  dest: string,
  filter: string,
  cropStart?: number | null,
  cropEnd?: number | null,
  onPercent?: OnPercent
) => {
  if (!(await hasCommand('ffmpeg')))
    return { ok: false as const, reason: 'ffmpeg is not installed' }
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

/* The copy's dates are made those of its name and what it came from is written into it, in one pass: a
   video is rewritten whole each time exiftool writes it, so a second pass is minutes more on a big
   one, and said nowhere, with every bar already full. */
const stampCopy = async (dest: string, from: string | undefined) => {
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
      ...(from ? [`-Comment=${ORIGIN_TAG}${from}`] : []),
      dest
    ])
  } catch (e) {
    throw new Error(
      `EXIF failed for ${path.basename(path.dirname(dest))}: ${messageOf(e)} — install exiftool`
    )
  }
}

const pruneTo = async (folder: string, kept: Set<string>) => {
  for (const entry of await readdir(folder).catch(() => [] as string[])) {
    if (kept.has(entry)) continue
    await rm(path.join(folder, entry), { recursive: true, force: true })
  }
}

const pruneStaleMedia = async (dir: string, kept: Set<string>) => {
  for (const media of ['videos', 'photos']) await pruneTo(path.join(dir, media), kept)
}

const getDestinationDir = (outputDir: string, destination: string) =>
  path.join(outputDir, 'processed', destination.replace(/[/\\]+/g, '_').trim() || 'destination')

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

/* The small copy a film is edited on, cut from a clip's proxy to what the board did to the clip: trimmed,
   framed and turned, so that it plays the way the clip is in the montage, only lighter. */
const writeCutProxy = async (file: ManifestFile, target: string) => {
  if (!isVideoFile(file.path) || !file.proxy || !(await pathExists(file.proxy))) return null
  if (!isWholeFrame(file.frame) || file.rotation) {
    const shape = await shownShape(file.proxy)
    if (!shape) return null
    const filter = pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })
    if (!filter) return null
    return (await recodeVideo(file.proxy, target, filter, file.cropStart, file.cropEnd)).ok
      ? target
      : null
  }
  if (!isTrimmed(file)) return null
  return (await cropProxy(file.proxy, target, file.cropStart, file.cropEnd)) ? target : null
}

const copyMedia = async (file: ManifestFile, dest: string, time: Date, onPercent?: OnPercent) => {
  const video = isVideoFile(file.path)
  const trimmed = isTrimmed(file)
  const reshaped = video && (!isWholeFrame(file.frame) || Boolean(file.rotation))
  const shape = reshaped ? await shownShape(file.path) : null
  if (reshaped && !shape)
    throw new Error(`Cannot read the size of ${file.filename}: install ffprobe to crop or turn it`)
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
  await utimes(dest, time, time)
  await stampCopy(dest, file.copyOf ?? file.id)
}

let writing: ReturnType<typeof job> | null = null

const writeOne = async (
  file: ManifestFile,
  dest: string,
  time: Date,
  after?: () => Promise<unknown>
) => {
  const live = following('process', file.id)
  const key = outputKeyOf(file)
  writing?.row({ key, at: 'now', part: 0 })
  try {
    await copyMedia(file, dest, time, (percent) => {
      live.at(percent)
      writing?.row({ key, at: 'now', part: percent / 100 })
    })
    await after?.()
    live.done(true)
    writing?.row({ key, at: 'done' })
    writing?.step()
  } catch (e) {
    live.done(false)
    writing?.row({ key, at: 'failed', note: e instanceof Error ? e.message : String(e) })
    if (stoppable().getStore()?.aborted) await rm(dest, { force: true })
    throw e
  }
}

class ProcessingCancelled extends Error {}

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
  await keepEdit(outputDir, dir, baseName)
  const written: string[] = []
  for (const file of group.files) {
    stopIfCancelled()
    if (only && !only.has(outputKeyOf(file))) continue
    if (!(await pathExists(file.path))) continue
    const targetDir = flat ? dir : path.join(dir, isVideoFile(file.path) ? 'videos' : 'photos')
    await mkdir(targetDir, { recursive: true })
    const ext = path.extname(file.path).slice(1).toLowerCase()
    const stem = flat
      ? `${toFileStem(group.destination!, 'destination')}_${formatGroupDay(file.mtime)}`
      : baseName
    const dest = path.join(targetDir, makeFileName(stem, file.mtime, ext, usedNames))
    await writeOne(file, dest, buildFsTime(flat ? file.mtime : dayEpoch, file.mtime))
    record(file, dest)
    written.push(dest)
  }
  if (!flat && !only) await pruneStaleMedia(dir, usedNames)
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
    if (!(await pathExists(file.path))) continue
    await mkdir(dir, { recursive: true })
    const ext = path.extname(file.path).slice(1).toLowerCase()
    const name = makeFileName(`${stem}_${formatGroupDay(file.mtime)}`, file.mtime, ext, usedNames)
    const dest = path.join(dir, name)
    await writeOne(file, dest, buildFsTime(file.mtime, file.mtime))
    record(file, dest)
    written.push(dest)
  }
  console.log(`[Process] ${destination}: copied ${written.length} loose file(s) to ${dir}`)
  return written.length
}

type Running = {
  asked: string
  groupIds: string[]
  destinations: string[]
  done: Promise<Awaited<ReturnType<typeof runProcess>>>
  stop: AbortController
  live: ReturnType<typeof job>
}

let queue: Running[] = []

const scopeOf = ({ groupIds, destinations }: Running) => ({ groupIds, destinations })

const processingNow = () => (queue[0] ? scopeOf(queue[0]) : null)

const processingAll = () => queue.map(scopeOf)

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

const cancelled = () =>
  new ProcessingCancelled(
    'Processing was cancelled. What was not finished is left to process again.'
  )

/* Processing is a task of its own: the request that started it is long answered when it ends, and the
   board does not hear of the manifest this server wrote itself — so it is told, whatever the end. */
const tellBoard = async (options?: ProcessOptions) => {
  const manifestPath =
    options?.manifestPath || getManifestPath(options?.outputDir || getOutputDir())
  publish({ kind: 'board', stamp: await pairStamp(manifestPath).catch(() => 'gone') })
}

const processJumps = async (options?: ProcessOptions) => {
  const asked = JSON.stringify([
    options?.manifestPath,
    options?.groupIds,
    options?.destination,
    options?.fileIds
  ])
  const waiting = queue.slice(1).find((one) => one.asked === asked)
  if (waiting) return waiting.done
  const groupIds = options?.groupIds ?? []
  const destinations = options?.destination ? [options.destination] : []
  const before = queue.at(-1)?.done.catch(() => undefined)
  const entry: Running = {
    asked,
    groupIds,
    destinations,
    done: Promise.resolve({ copied: 0, processedGroups: 0 }),
    stop: new AbortController(),
    live: job({ type: 'process', label: '', total: 0, scope: { groupIds, destinations } })
  }
  if (before) entry.live.phase('waiting')
  const done = (async () => {
    await before
    if (entry.stop.signal.aborted) throw cancelled()
    if (before) entry.live.phase('processing')
    return stoppable().run(entry.stop.signal, () => runProcess(entry, options))
  })()
  entry.done = done
  queue = [...queue, entry]
  try {
    const result = await done
    entry.live.finish()
    return result
  } catch (e) {
    const stopped = entry.stop.signal.aborted
    if (stopped) entry.live.finish({ outcome: { state: 'stopped', copied: 0, skipped: 0 } })
    else entry.live.fail(messageOf(e))
    if (stopped && !(e instanceof ProcessingCancelled)) throw cancelled()
    throw e
  } finally {
    queue = queue.filter((one) => one !== entry)
    await tellBoard(options)
  }
}

const cancelProcessing = (id?: string) => {
  const going = queue.filter((one) => id === undefined || one.live.id === id)
  for (const one of going) one.stop.abort()
  return going.length > 0
}

const runProcess = async (entry: Running, options?: ProcessOptions) => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)

  const manifest = await loadManifestAsync(manifestPath)
  if (!manifest) {
    console.error('[Process] ERROR: Manifest not found')
    return { copied: 0, processedGroups: 0 }
  }

  const filesInGroups = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.path)))
  const only = options?.fileIds ? new Set(options.fileIds) : undefined
  const looseByDestination = new Map<string, ManifestFile[]>()
  for (const file of manifest.files) {
    if (!file.destination || filesInGroups.has(file.path)) continue
    if (only && !only.has(outputKeyOf(file))) continue
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
      !g.freed &&
      (groupIds.length > 0
        ? groupIds.includes(g.id)
        : !options?.destination || g.destination === options.destination) &&
      (!only || g.files.some((f) => only.has(outputKeyOf(f))))
  )
  /* a montage hands over the files the board changed only: given those, nothing else of it is touched */
  const takenOf = (g: ManifestGroup) =>
    only && (isFlatGroup(g) || isMontage(g)) ? only : undefined

  const namePools = new Map<string, Set<string>>()
  const poolFor = (dir: string) => {
    const pool = namePools.get(dir) ?? new Set<string>()
    namePools.set(dir, pool)
    return pool
  }
  const inRun = new Set([
    ...groups.flatMap((g) =>
      g.files.flatMap((f) => {
        const taken = takenOf(g)
        return !taken || taken.has(outputKeyOf(f)) ? [outputKeyOf(f)] : []
      })
    ),
    ...destinations.flatMap((d) => (looseByDestination.get(d) ?? []).map(outputKeyOf))
  ])
  const hold = (file: ManifestFile, dir: string) => {
    if (file.processed && !inRun.has(outputKeyOf(file)))
      poolFor(dir).add(path.basename(file.processed.path))
  }
  for (const group of manifest.groups)
    for (const file of group.files) hold(file, getGroupProcessedDir(outputDir, group).dir)
  for (const file of manifest.files)
    if (file.destination) hold(file, getDestinationDir(outputDir, file.destination))

  const processedPaths = new Map<string, { dest: string; source: ManifestFile }>()
  const record = (source: ManifestFile, destPath: string) => {
    processedPaths.set(outputKeyOf(source), { dest: destPath, source })
  }

  const asAsked = new Map(groups.map((g) => [g.id, copiedAs(g)]))
  let copied = 0
  const onDisk = async (files: ManifestFile[]) => {
    const here = await mapWithLimit(files, 16, (f) => pathExists(f.path))
    return files.filter((_, i) => here[i])
  }
  const toWrite = await onDisk([
    ...groups.flatMap((g) => g.files.filter((f) => !takenOf(g) || takenOf(g)?.has(outputKeyOf(f)))),
    ...destinations.flatMap((d) => looseByDestination.get(d) ?? [])
  ])
  if (groupIds.length > 0 || options?.destination) {
    entry.groupIds = [...new Set([...entry.groupIds, ...groups.map((g) => g.id)])]
    entry.destinations = [...new Set([...entry.destinations, ...destinations])]
    entry.live.widen({ groupIds: entry.groupIds, destinations: entry.destinations })
  }
  const preparing = entry.live
  preparing.expect(toWrite.length)
  preparing.rows(toWrite.map((f) => ({ key: outputKeyOf(f), name: f.filename, size: f.size })))
  writing = preparing
  try {
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

    const current = (await loadManifestAsync(manifestPath)) ?? manifest
    for (const group of current.groups) {
      const asked = asAsked.get(group.id)
      if (asked === undefined || asked !== copiedAs(group)) continue
      group.processed = true
      delete group.publish
    }
    for (const file of current.files) {
      const written = processedPaths.get(outputKeyOf(file))
      if (!written) continue
      const { dest, source } = written
      file.processed = {
        path: dest,
        size: (await stat(dest)).size,
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

    if (groups.length > 0 || processedPaths.size > 0) await saveManifest(manifestPath, current)

    console.log(`[Process] Done. Copied ${copied} file(s).`)

    return { copied, processedGroups: groups.length }
  } finally {
    writing = null
  }
}

export {
  cancelProcessing,
  getDestinationDir,
  getGroupProcessedDir,
  isFlatGroup,
  processingAll,
  processingNow,
  isTrimmed,
  processJumps,
  recodeVideo,
  shownShape,
  turnPhoto,
  writeCutProxy
}
