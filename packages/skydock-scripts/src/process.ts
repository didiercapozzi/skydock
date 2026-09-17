import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import { cropFilter, isWholeFrame } from './frameCrop'
import { cropProxy, getCutProxyDir, proxyEncoder, videoShape } from './proxy'
import type { ProxyEncoder } from './proxy'
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

const quote = (value: string) => `"${value.replace(/(["$`\\])/g, '\\$1')}"`

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

/* The ends only: copied, never re-encoded. */
const trimVideo = (src: string, dest: string, cropStart: number, cropEnd: number) => {
  if (!hasCommand('ffmpeg')) return false
  try {
    childProcess.execSync(
      `ffmpeg -y ${timeArgs(cropStart, cropEnd)} -i ${quote(src)} -c copy -avoid_negative_ts make_zero ${quote(dest)} 2>/dev/null`,
      { stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

/* The frame, and the ends with it if both were set. Decoding on the card where there is one, the
   same as the proxies, because unpacking 4K HEVC is what takes the time either way. */
const recodeVideo = (
  src: string,
  dest: string,
  filter: string,
  cropStart?: number | null,
  cropEnd?: number | null
) => {
  if (!hasCommand('ffmpeg')) return false
  const pick = proxyEncoder()
  /* the filter cuts in software: `crop` and `scale` have hardware twins, but naming the rectangle
     in pixels of the source frame is the same arithmetic either way and this keeps one code path */
  const decode = pick === 'nvenc' ? '-hwaccel cuda' : pick === 'vaapi' ? '-hwaccel vaapi' : ''
  try {
    childProcess.execSync(
      `ffmpeg -y ${decode} ${timeArgs(cropStart, cropEnd)} -i ${quote(src)} -vf ${filter} ${DELIVERY_ARGS[pick].join(' ')} -c:a copy ${quote(dest)}`,
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    return true
  } catch {
    return false
  }
}

const updateMetadata = (files: string[]) => {
  if (files.length === 0) return
  const paths = files.map((f) => `"${f.replace(/(["$`\\])/g, '\\$1')}"`).join(' ')
  try {
    childProcess.execSync(
      `exiftool -P -overwrite_original -m -q '-CreateDate<FileModifyDate' '-MediaCreateDate<FileModifyDate' '-TrackCreateDate<FileModifyDate' '-MediaModifyDate<FileModifyDate' '-TrackModifyDate<FileModifyDate' '-ModifyDate<FileModifyDate' '-DateTimeOriginal<FileModifyDate' '-CreationDate<FileModifyDate' ${paths}`,
      { stdio: 'ignore' }
    )
  } catch (e) {
    throw new Error(
      `EXIF failed for ${path.basename(path.dirname(files[0]))}: ${e instanceof Error ? e.message : String(e)} — install exiftool`
    )
  }
}

const moveToTrash = (target: string, outputDir: string) => {
  if (!fs.existsSync(target)) return
  const trashDir = path.join(outputDir, '.trash')
  fs.mkdirSync(trashDir, { recursive: true })
  fs.renameSync(target, path.join(trashDir, `${path.basename(target)}_${Date.now()}`))
}

/* Re-processing rebuilds a group's folder, and an edit someone made is the one thing in there
   that cannot be made again. When the folder holds a project, only the media it is about to
   rewrite is binned, and the project, the film and the archives are left where they are. */
const binGroupMedia = (dir: string, outputDir: string) => {
  if (!fs.existsSync(dir)) return false
  const hasProject = fs.readdirSync(dir).some((entry) => entry.endsWith('.kdenlive'))
  if (!hasProject) {
    moveToTrash(dir, outputDir)
    return false
  }
  for (const media of ['videos', 'photos']) moveToTrash(path.join(dir, media), outputDir)
  return true
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
const writeCutProxy = (file: ManifestFile, dest: string, outputDir: string, groupId: string) => {
  if (!isVideoFile(file.path) || !file.proxy || !fs.existsSync(file.proxy)) return null
  const target = path.join(getCutProxyDir(outputDir, groupId), `${path.parse(dest).name}.mp4`)
  const trimmed = file.cropStart != null && file.cropEnd != null
  /* The frame has to be cut out of the proxy as well. The editor opens on these, so a proxy still
     showing the mount in the corner would have somebody editing a picture that is not the one
     about to be rendered. The rectangle is fractions of the frame, which is why it applies to a
     640-wide copy as readily as to the clip. */
  if (!isWholeFrame(file.frame)) {
    const shape = videoShape(file.proxy)
    if (!shape) return null
    const filter = cropFilter(file.frame!, shape.width, shape.height)
    return recodeVideo(file.proxy, target, filter, file.cropStart, file.cropEnd) ? target : null
  }
  if (trimmed) {
    if (!cropProxy(file.proxy, target, file.cropStart!, file.cropEnd!)) return null
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file.proxy, target)
  }
  return target
}

const copyMedia = (file: ManifestFile, dest: string, time: Date) => {
  const video = isVideoFile(file.path)
  const trimmed = file.cropStart != null && file.cropEnd != null
  const framed = video && !isWholeFrame(file.frame)
  if (framed) {
    const shape = videoShape(file.path)
    if (!shape)
      throw new Error(`Cannot read the size of ${file.filename}: install ffprobe to crop its frame`)
    const filter = cropFilter(file.frame!, shape.width, shape.height)
    if (!recodeVideo(file.path, dest, filter, file.cropStart, file.cropEnd))
      throw new Error(`ffmpeg could not crop the frame of ${file.filename}: install ffmpeg`)
  } else if (video && trimmed) {
    if (!trimVideo(file.path, dest, file.cropStart!, file.cropEnd!)) {
      throw new Error(
        `ffmpeg crop failed for ${file.filename} ${file.cropStart}→${file.cropEnd}: install ffmpeg or check range`
      )
    }
  } else {
    fs.copyFileSync(file.path, dest)
  }
  fs.utimesSync(dest, time, time)
}

const writeGroup = (
  group: ManifestGroup,
  outputDir: string,
  usedNames: Set<string>,
  record: (source: ManifestFile, destPath: string) => void
) => {
  const { dir, baseName, dayEpoch, flat } = getGroupProcessedDir(outputDir, group)
  const written: string[] = []
  try {
    for (const file of group.files) {
      if (!fs.existsSync(file.path)) continue
      const targetDir = flat ? dir : path.join(dir, isVideoFile(file.path) ? 'videos' : 'photos')
      fs.mkdirSync(targetDir, { recursive: true })
      const ext = path.extname(file.path).slice(1).toLowerCase()
      const stem = flat
        ? `${toFileStem(group.destination!, 'destination')}_${formatGroupDay(file.mtime)}`
        : baseName
      const dest = path.join(targetDir, makeFileName(stem, file.mtime, ext, usedNames))
      copyMedia(file, dest, buildFsTime(flat ? file.mtime : dayEpoch, file.mtime))
      if (!flat) writeCutProxy(file, dest, outputDir, group.id)
      record(file, dest)
      written.push(dest)
    }
    updateMetadata(written)
  } catch (e) {
    if (!flat) binGroupMedia(dir, outputDir)
    throw e
  }
  group.processed = true
  delete group.publish
  console.log(`[Process] ${group.id}: copied ${written.length} file(s) to ${dir}`)
  return written.length
}

const writeLooseFiles = (
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
    copyMedia(file, dest, buildFsTime(file.mtime, file.mtime))
    record(file, dest)
    written.push(dest)
  }
  updateMetadata(written)
  console.log(`[Process] ${destination}: copied ${written.length} loose file(s) to ${dir}`)
  return written.length
}

const processJumps = (options?: ProcessOptions) => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)

  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    console.error('[Process] ERROR: Manifest not found')
    return { copied: 0, processedGroups: 0, keptProjects: [] as string[] }
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

  /* only ever bin a folder one group owns. A destination folder is shared by every day
     ever shot there, while the manifest only holds what the last scan found — rebuilding it
     would bin older days. A stale copy is removed one file at a time instead. */
  const keptProjects: string[] = []
  for (const group of groups) {
    const { dir, flat } = getGroupProcessedDir(outputDir, group)
    if (!flat && binGroupMedia(dir, outputDir)) keptProjects.push(group.id)
    /* the cut proxies are of the copies about to be rewritten, so they go with them */
    if (!flat) moveToTrash(getCutProxyDir(outputDir, group.id), outputDir)
  }

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

  let copied = 0
  for (const group of groups)
    copied += writeGroup(
      group,
      outputDir,
      poolFor(getGroupProcessedDir(outputDir, group).dir),
      record
    )
  for (const destination of destinations) {
    copied += writeLooseFiles(
      destination,
      looseByDestination.get(destination) ?? [],
      outputDir,
      record
    )
  }

  /* Stamp each source with where it landed and what it was made from, so the board can tell a
     current copy from one whose source has moved on. A fresh copy is not the copy that went to
     the NAS, so the upload record goes — if the bytes are identical the next dedup pass restores
     it without sending anything. */
  for (const file of manifest.files) {
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
        frame: source.frame ?? null
      }
    }
    delete file.uploaded
  }

  if (groups.length > 0 || processedPaths.size > 0) saveManifest(manifestPath, manifest)

  console.log(`[Process] Done. Copied ${copied} file(s).`)

  return { copied, processedGroups: groups.length, keptProjects }
}

export { binGroupMedia, getDestinationDir, getGroupProcessedDir, isFlatGroup, processJumps }
export type { ProcessOptions }
