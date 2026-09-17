import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import { cropProxy } from './proxy'
import type { ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getOutputDir, hasCommand, isVideoFile, parseDayEpoch } from './utils'
import {
  buildFsTime,
  buildGroupBaseName,
  buildPassengerFolder,
  formatGroupDay,
  hasCompletePassenger,
  makeFileName,
  toFileStem
} from './workspace'

type ProcessOptions = {
  manifestPath?: string
  outputDir?: string
  groupIds?: string[]
  destination?: string
}

const cropVideo = (src: string, dest: string, cropStart: number, cropEnd: number) => {
  if (!hasCommand('ffmpeg')) return false
  const duration = (cropEnd - cropStart).toFixed(6)
  try {
    childProcess.execSync(
      `ffmpeg -y -ss ${cropStart} -i "${src}" -t ${duration} -c copy -avoid_negative_ts make_zero "${dest}" 2>/dev/null`,
      { stdio: 'ignore' }
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
  for (const media of ['videos', 'photos', 'proxy']) moveToTrash(path.join(dir, media), outputDir)
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
   when it cannot be made the montage simply opens on the full clips as it always did. */
const writeProxyBeside = (file: ManifestFile, dest: string, groupDir: string) => {
  if (!isVideoFile(file.path) || !file.proxy || !fs.existsSync(file.proxy)) return null
  const target = path.join(groupDir, 'proxy', `${path.parse(dest).name}.mp4`)
  const cropped = file.cropStart != null && file.cropEnd != null
  if (cropped) {
    if (!cropProxy(file.proxy, target, file.cropStart!, file.cropEnd!)) return null
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(file.proxy, target)
  }
  return target
}

const copyMedia = (file: ManifestFile, dest: string, time: Date) => {
  if (isVideoFile(file.path) && file.cropStart != null && file.cropEnd != null) {
    if (!cropVideo(file.path, dest, file.cropStart, file.cropEnd)) {
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
      if (!flat) writeProxyBeside(file, dest, dir)
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

  /* only ever bin a folder one group owns. A destination folder is shared by every day
     ever shot there, while the manifest only holds what the last scan found — rebuilding it
     would bin older days. A stale copy is removed one file at a time instead. */
  const keptProjects: string[] = []
  for (const group of groups) {
    const { dir, flat } = getGroupProcessedDir(outputDir, group)
    if (!flat && binGroupMedia(dir, outputDir)) keptProjects.push(group.id)
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
        cropEnd: source.cropEnd ?? null
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
