import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from './manifest'
import { scheduleIdle, writeStatus } from './status'
import { getManifestPath, getOutputDir, hasCommand, isCliModule, isVideoFile } from './utils'
import { parseDayEpoch } from './utils'
import { buildFsTime, buildJumpBaseName, makeFileName } from './workspace'

type ExecuteOptions = {
  manifestPath?: string
  jumpIds?: string[]
  outputDir?: string
}

type ExecuteResult = {
  copied: number
  processedJumps: number
}

const cropVideo = (src: string, dest: string, cropStart: number, cropEnd: number): boolean => {
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

const updateMetadata = (dir: string): void => {
  const files = fs.readdirSync(dir)
  if (files.length === 0) return
  const paths = files.map((f) => `"${path.join(dir, f)}"`).join(' ')
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

const moveToTrash = (dir: string, outputDir: string): void => {
  if (!fs.existsSync(dir)) return
  const trashDir = path.join(outputDir, '.trash')
  fs.mkdirSync(trashDir, { recursive: true })
  fs.renameSync(dir, path.join(trashDir, `${path.basename(dir)}_${Date.now()}`))
}

const getProcessedMapPath = (outputDir: string): string =>
  path.join(outputDir, '.status', 'processed.json')

const readProcessedMap = (outputDir: string): Record<string, string> => {
  try {
    return JSON.parse(fs.readFileSync(getProcessedMapPath(outputDir), 'utf-8')) as Record<
      string,
      string
    >
  } catch {
    return {}
  }
}

const writeProcessedMap = (outputDir: string, map: Record<string, string>): void => {
  const p = getProcessedMapPath(outputDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2))
  fs.renameSync(tmp, p)
}

const getMediaType = (filePath: string): 'video' | 'photo' =>
  isVideoFile(filePath) ? 'video' : 'photo'

const processJump = (
  jump: NonNullable<ReturnType<typeof loadManifest>>['jumps'][number],
  processedDir: string,
  outputDir: string
): number => {
  const dayEpoch = parseDayEpoch(jump.day) ?? Math.min(...jump.files.map((f) => f.mtime))
  const baseName = buildJumpBaseName(jump.passenger, jump.label, dayEpoch)
  const jumpDir = path.join(processedDir, baseName)

  const processedMap = readProcessedMap(outputDir)
  const oldBase = processedMap[jump.id]
  if (oldBase && oldBase !== baseName) {
    const oldDir = path.join(processedDir, oldBase)
    moveToTrash(oldDir, outputDir)
  }
  moveToTrash(jumpDir, outputDir)

  const byType = {
    video: jump.files.filter((f) => getMediaType(f.path) === 'video'),
    photo: jump.files.filter((f) => getMediaType(f.path) === 'photo')
  }

  for (const type of ['video', 'photo'] as const) {
    if (byType[type].length > 0) fs.mkdirSync(path.join(jumpDir, `${type}s`), { recursive: true })
  }

  const usedNames = new Set<string>()
  let copied = 0

  for (const file of jump.files) {
    if (!fs.existsSync(file.path)) continue

    const ext = path.extname(file.path).slice(1).toLowerCase()
    const type = getMediaType(file.path)
    const dest = path.join(jumpDir, `${type}s`, makeFileName(baseName, file.mtime, ext, usedNames))

    const needsCrop = type === 'video' && file.cropStart != null && file.cropEnd != null
    if (needsCrop) {
      const ok = cropVideo(file.path, dest, file.cropStart!, file.cropEnd!)
      if (!ok) {
        moveToTrash(jumpDir, outputDir)
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
        updateMetadata(path.join(jumpDir, `${type}s`))
      } catch (e) {
        moveToTrash(jumpDir, outputDir)
        throw e
      }
    }
  }

  jump.processed = true
  delete jump.publish
  processedMap[jump.id] = baseName
  writeProcessedMap(outputDir, processedMap)

  console.log(`[Execute] ${jump.id}: copied ${jump.files.length} file(s) to ${jumpDir}`)
  return copied
}

const executeMedia = (options?: ExecuteOptions): ExecuteResult => {
  const outputDir = options?.outputDir || getOutputDir()
  const manifestPath = options?.manifestPath || getManifestPath(outputDir)
  const processedDir = path.join(outputDir, 'processed')

  fs.mkdirSync(processedDir, { recursive: true })
  writeStatus('execute', 'running', 'Processing jumps', outputDir)

  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    console.error('[Execute] ERROR: Manifest not found')
    writeStatus('execute', 'error', 'Manifest not found', outputDir)
    return { copied: 0, processedJumps: 0 }
  }

  const jumpIds = options?.jumpIds?.length
    ? options.jumpIds
    : manifest.jumps.filter((j) => j.confirmed && !j.processed).map((j) => j.id)

  if (jumpIds.length === 0) {
    console.log('[Execute] No confirmed unprocessed jumps found.')
    writeStatus('execute', 'done', 'No jumps to process', outputDir)
    scheduleIdle('execute', 5000, outputDir)
    return { copied: 0, processedJumps: 0 }
  }

  console.log(`[Execute] Processing ${jumpIds.length} jump(s)`)
  let totalCopied = 0
  let processedCount = 0

  for (const jumpId of jumpIds) {
    const jump = manifest.jumps.find((j) => j.id === jumpId)
    if (!jump || jump.files.length === 0) continue

    totalCopied += processJump(jump, processedDir, outputDir)
    processedCount++
  }

  if (processedCount > 0) saveManifest(manifestPath, manifest)

  console.log(`[Execute] Done. Copied ${totalCopied} file(s).`)
  writeStatus('execute', 'done', `Copied ${totalCopied} files`, outputDir)
  scheduleIdle('execute', 5000, outputDir)

  return { copied: totalCopied, processedJumps: processedCount }
}

if (isCliModule('execute')) {
  const args = process.argv.slice(2)
  const manifestPath = args[0] && fs.existsSync(args[0]) ? args[0] : undefined
  const jumpIds = manifestPath ? args.slice(1) : args.filter((a) => !a.startsWith('-'))
  executeMedia({ manifestPath, jumpIds: jumpIds.length > 0 ? jumpIds : undefined })
}

export { executeMedia }
export type { ExecuteOptions, ExecuteResult }
