import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { loadManifest, saveManifest } from './manifest'
import { scheduleIdle, writeStatus } from './status'
import { getManifestPath, getOutputDir, hasCommand, isCliModule, isVideoFile } from './utils'
import { parseDayEpoch } from './utils'
import { buildFsTime, buildGroupBaseName, makeFileName } from './workspace'

type ExecuteOptions = {
  manifestPath?: string
  groupIds?: string[]
  outputDir?: string
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

const updateMetadata = (dir: string) => {
  const files = fs.readdirSync(dir)
  if (files.length === 0) return
  const paths = files.map((f) => `"${path.join(dir, f).replace(/(["$`\\])/g, '\\$1')}"`).join(' ')
  try {
    childProcess.execSync(
      `exiftool -P -overwrite_original -m -q '-CreateDate<FileModifyDate' '-MediaCreateDate<FileModifyDate' '-TrackCreateDate<FileModifyDate' '-MediaModifyDate<FileModifyDate' '-TrackModifyDate<FileModifyDate' '-ModifyDate<FileModifyDate' '-DateTimeOriginal<FileModifyDate' '-CreationDate<FileModifyDate' ${paths}`,
      { stdio: 'ignore' }
    )
  } catch (e) {
    throw new Error(
      `EXIF failed for ${path.basename(dir)}: ${e instanceof Error ? e.message : String(e)} — FileModifyDate is correct but CreateDate stayed 2026:08:28 vs expected 2024:08:23; install exiftool`
    )
  }
}

const moveToTrash = (dir: string, outputDir: string) => {
  if (!fs.existsSync(dir)) return
  const trashDir = path.join(outputDir, '.trash')
  fs.mkdirSync(trashDir, { recursive: true })
  fs.renameSync(dir, path.join(trashDir, `${path.basename(dir)}_${Date.now()}`))
}

const getProcessedMapPath = (outputDir: string) => path.join(outputDir, '.status', 'processed.json')

const readProcessedMap = (outputDir?: string) => {
  try {
    const raw = JSON.parse(
      fs.readFileSync(getProcessedMapPath(outputDir ?? getOutputDir()), 'utf-8')
    )
    const parsed = z.record(z.string(), z.string()).safeParse(raw)
    if (parsed.success) return parsed.data
    return {}
  } catch {
    return {}
  }
}

const writeProcessedMap = (outputDir: string, map: Record<string, string>) => {
  const p = getProcessedMapPath(outputDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  writeJsonAtomic(p, map)
}

const getMediaType = (filePath: string) => (isVideoFile(filePath) ? 'video' : 'photo')

const processGroup = (
  group: NonNullable<ReturnType<typeof loadManifest>>['groups'][number],
  processedDir: string,
  outputDir: string,
  claimedDirs: Set<string>,
  processedMap: Record<string, string>
) => {
  const dayEpoch = parseDayEpoch(group.day) ?? Math.min(...group.files.map((f) => f.mtime))
  const baseName = buildGroupBaseName(group.passenger, group.label, dayEpoch)
  const oldBase = processedMap[group.id]

  // Always use baseName - if a group is reprocessed, overwrite the existing directory
  const dirName = baseName
  claimedDirs.add(dirName)
  const groupDir = path.join(processedDir, dirName)

  // Clean up old directory if name changed
  if (oldBase && oldBase !== baseName) {
    const oldDir = path.join(processedDir, oldBase)
    moveToTrash(oldDir, outputDir)
  }

  // Remove existing directory to start fresh
  moveToTrash(groupDir, outputDir)

  const byType = {
    video: group.files.filter((f) => getMediaType(f.path) === 'video'),
    photo: group.files.filter((f) => getMediaType(f.path) === 'photo')
  }

  for (const type of ['video', 'photo'] as const) {
    if (byType[type].length > 0) fs.mkdirSync(path.join(groupDir, `${type}s`), { recursive: true })
  }

  const usedNames = new Set<string>()
  let copied = 0

  for (const file of group.files) {
    if (!fs.existsSync(file.path)) continue

    const ext = path.extname(file.path).slice(1).toLowerCase()
    const type = getMediaType(file.path)
    const dest = path.join(groupDir, `${type}s`, makeFileName(baseName, file.mtime, ext, usedNames))

    const needsCrop = type === 'video' && file.cropStart != null && file.cropEnd != null
    if (needsCrop) {
      const ok = cropVideo(file.path, dest, file.cropStart!, file.cropEnd!)
      if (!ok) {
        moveToTrash(groupDir, outputDir)
        throw new Error(
          `ffmpeg crop failed for ${file.filename} ${file.cropStart}→${file.cropEnd}: install ffmpeg or check range`
        )
      }
    } else {
      fs.copyFileSync(file.path, dest)
    }

    fs.utimesSync(dest, buildFsTime(dayEpoch, file.mtime), buildFsTime(dayEpoch, file.mtime))
    copied++
  }

  for (const type of ['video', 'photo'] as const) {
    if (byType[type].length > 0) {
      try {
        updateMetadata(path.join(groupDir, `${type}s`))
      } catch (e) {
        moveToTrash(groupDir, outputDir)
        throw e
      }
    }
  }

  group.processed = true
  delete group.publish
  processedMap[group.id] = path.basename(groupDir)
  writeProcessedMap(outputDir, processedMap)

  console.log(`[Execute] ${group.id}: copied ${group.files.length} file(s) to ${groupDir}`)
  return copied
}

const processFile = (
  file: { path: string; mtime: number; filename: string; destination?: string },
  destinationName: string,
  processedDir: string,
  outputDir: string,
  claimedDirs: Set<string>
) => {
  if (!file.destination) return 0
  if (!fs.existsSync(file.path)) return 0

  let dirName = destinationName
  let counter = 1
  while (claimedDirs.has(dirName)) {
    dirName = `${destinationName}_${counter}`
    counter++
  }
  claimedDirs.add(dirName)

  const destDir = path.join(processedDir, dirName)
  fs.mkdirSync(destDir, { recursive: true })

  const ext = path.extname(file.path).slice(1).toLowerCase()
  const type = isVideoFile(file.path) ? 'video' : 'photo'
  const usedNames = new Set<string>()
  let destName: string
  if (type === 'video') {
    destName = makeFileName(destinationName, file.mtime, ext, usedNames)
  } else {
    destName = `${destinationName}-${file.filename}`
    if (usedNames.has(destName)) {
      let c = 1
      while (
        usedNames.has(`${destinationName}-${path.basename(file.filename, `.${ext}`)}-${c}.${ext}`)
      )
        c++
      destName = `${destinationName}-${path.basename(file.filename, `.${ext}`)}-${c}.${ext}`
    }
    usedNames.add(destName)
  }

  const dest = path.join(destDir, destName)
  fs.copyFileSync(file.path, dest)
  fs.utimesSync(dest, buildFsTime(file.mtime, file.mtime), buildFsTime(file.mtime, file.mtime))

  try {
    updateMetadata(destDir)
  } catch {
    // non-fatal for single file
  }

  console.log(`[Execute] lone file ${file.filename}: copied to ${dest}`)
  return 1
}

const executeMedia = (options?: ExecuteOptions) => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)
  const processedDir = path.join(outputDir, 'processed')

  fs.mkdirSync(processedDir, { recursive: true })
  writeStatus('execute', 'running', 'Processing groups', outputDir)

  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    console.error('[Execute] ERROR: Manifest not found')
    writeStatus('execute', 'error', 'Manifest not found', outputDir)
    return { copied: 0, processedGroups: 0 }
  }

  const groupIds = options?.groupIds?.length
    ? options.groupIds
    : manifest.groups.filter((g) => g.confirmed && !g.processed).map((g) => g.id)

  if (groupIds.length === 0) {
    console.log('[Execute] No confirmed unprocessed groups found.')
    writeStatus('execute', 'done', 'No groups to process', outputDir)
    scheduleIdle('execute', 5000, outputDir)
    return { copied: 0, processedGroups: 0 }
  }

  console.log(`[Execute] Processing ${groupIds.length} group(s)`)
  let totalCopied = 0
  let processedCount = 0
  const claimedDirs = new Set(
    fs
      .readdirSync(processedDir)
      .filter((d) => fs.statSync(path.join(processedDir, d)).isDirectory())
  )
  const processedMap = readProcessedMap(outputDir)

  for (const groupId of groupIds) {
    const group = manifest.groups.find((g) => g.id === groupId)
    if (!group || group.files.length === 0) continue

    totalCopied += processGroup(group, processedDir, outputDir, claimedDirs, processedMap)
    processedCount++
  }

  if (processedCount > 0) saveManifest(manifestPath, manifest)

  console.log(`[Execute] Done. Copied ${totalCopied} file(s).`)
  writeStatus('execute', 'done', `Copied ${totalCopied} files`, outputDir)
  scheduleIdle('execute', 5000, outputDir)

  return { copied: totalCopied, processedGroups: processedCount }
}

if (isCliModule('execute')) {
  const args = process.argv.slice(2)
  const manifestPath = args[0] && fs.existsSync(args[0]) ? args[0] : undefined
  const groupIds = manifestPath ? args.slice(1) : args.filter((a) => !a.startsWith('-'))
  executeMedia({ manifestPath, groupIds: groupIds.length > 0 ? groupIds : undefined })
}

export { executeMedia, processFile }
export type { ExecuteOptions, ExecuteResult }
