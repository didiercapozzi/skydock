import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import { scheduleIdle, writeStatus } from './status'
import type { ManifestFile, ManifestGroup } from './types'
import {
  getManifestPath,
  getOutputDir,
  hasCommand,
  isCliModule,
  isVideoFile,
  parseDayEpoch
} from './utils'
import {
  buildFsTime,
  buildGroupBaseName,
  formatGroupDay,
  makeFileName,
  toFileStem
} from './workspace'

type ExecuteOptions = {
  manifestPath?: string
  outputDir?: string
  groupIds?: string[]
  destination?: string
}

type ExecuteResult = {
  copied: number
  processedGroups: number
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

const getDestinationDir = (outputDir: string, destination: string) =>
  path.join(outputDir, 'processed', destination.replace(/[/\\]+/g, '_').trim() || 'destination')

const getGroupProcessedDir = (outputDir: string, group: ManifestGroup) => {
  const dayEpoch = parseDayEpoch(group.day) ?? Math.min(...group.files.map((f) => f.mtime))
  const baseName = buildGroupBaseName(group.passenger, group.label, dayEpoch)
  const parent = group.destination
    ? getDestinationDir(outputDir, group.destination)
    : path.join(outputDir, 'processed')
  return { dir: path.join(parent, baseName), baseName, dayEpoch }
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

const writeGroup = (group: ManifestGroup, outputDir: string) => {
  const { dir, baseName, dayEpoch } = getGroupProcessedDir(outputDir, group)
  const usedNames = new Set<string>()
  const written: string[] = []
  try {
    for (const file of group.files) {
      if (!fs.existsSync(file.path)) continue
      const typeDir = path.join(dir, isVideoFile(file.path) ? 'videos' : 'photos')
      fs.mkdirSync(typeDir, { recursive: true })
      const ext = path.extname(file.path).slice(1).toLowerCase()
      const dest = path.join(typeDir, makeFileName(baseName, file.mtime, ext, usedNames))
      copyMedia(file, dest, buildFsTime(dayEpoch, file.mtime))
      written.push(dest)
    }
    updateMetadata(written)
  } catch (e) {
    moveToTrash(dir, outputDir)
    throw e
  }
  group.processed = true
  delete group.publish
  console.log(`[Execute] ${group.id}: copied ${written.length} file(s) to ${dir}`)
  return written.length
}

const writeLooseFiles = (destination: string, files: ManifestFile[], outputDir: string) => {
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
    written.push(dest)
  }
  updateMetadata(written)
  console.log(`[Execute] ${destination}: copied ${written.length} loose file(s) to ${dir}`)
  return written.length
}

const executeMedia = (options?: ExecuteOptions) => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)

  writeStatus('execute', 'running', 'Processing', outputDir)

  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    console.error('[Execute] ERROR: Manifest not found')
    writeStatus('execute', 'error', 'Manifest not found', outputDir)
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

  for (const destination of destinations)
    moveToTrash(getDestinationDir(outputDir, destination), outputDir)
  for (const group of groups) moveToTrash(getGroupProcessedDir(outputDir, group).dir, outputDir)

  let copied = 0
  for (const group of groups) copied += writeGroup(group, outputDir)
  for (const destination of destinations) {
    copied += writeLooseFiles(destination, looseByDestination.get(destination) ?? [], outputDir)
  }

  if (groups.length > 0) saveManifest(manifestPath, manifest)

  console.log(`[Execute] Done. Copied ${copied} file(s).`)
  writeStatus('execute', 'done', `Copied ${copied} files`, outputDir)
  scheduleIdle('execute', 5000, outputDir)

  return { copied, processedGroups: groups.length }
}

if (isCliModule('execute')) {
  const args = process.argv.slice(2)
  const manifestPath = args[0] && fs.existsSync(args[0]) ? args[0] : undefined
  const groupIds = manifestPath ? args.slice(1) : args.filter((a) => !a.startsWith('-'))
  executeMedia({ manifestPath, groupIds: groupIds.length > 0 ? groupIds : undefined })
}

export { executeMedia, getGroupProcessedDir }
export type { ExecuteOptions, ExecuteResult }
