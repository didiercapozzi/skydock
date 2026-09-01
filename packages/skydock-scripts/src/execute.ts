import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { getOutputDir, getManifestPath, sanitizeLabel, formatTimestamp, isVideoFile, isPhotoFile } from './utils'
import { writeStatus, scheduleIdle } from './status'
import { loadManifest, saveManifest } from './manifest'
import type { Manifest, ManifestJump } from './types'

type ExecuteOptions = {
  manifestPath?: string
  jumpIds?: string[]
  outputDir?: string
}

type ExecuteResult = {
  copied: number
  processedJumps: number
}

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const cropVideo = (src: string, dest: string, cropStart: number, cropEnd: number): boolean => {
  if (!hasCommand('ffmpeg')) return false
  const duration = (cropEnd - cropStart).toFixed(6)
  try {
    execSync(
      `ffmpeg -y -ss ${cropStart} -i "${src}" -t ${duration} -c copy -avoid_negative_ts make_zero "${dest}" 2>/dev/null`,
      { stdio: 'ignore' }
    )
    return true
  } catch {
    return false
  }
}

const updateMetadata = (dir: string): void => {
  if (!hasCommand('exiftool')) return
  const files = fs.readdirSync(dir)
  if (files.length === 0) return

  const paths = files.map((f) => `"${path.join(dir, f)}"`).join(' ')
  try {
    execSync(
      `exiftool -P -overwrite_original -m -q -CreateDate<FileModifyDate -MediaCreateDate<FileModifyDate -TrackCreateDate<FileModifyDate -MediaModifyDate<FileModifyDate -TrackModifyDate<FileModifyDate -ModifyDate<FileModifyDate -DateTimeOriginal<FileModifyDate -CreationDate<FileModifyDate ${paths}`,
      { stdio: 'ignore' }
    )
  } catch {}
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

  let jumpIds = options?.jumpIds
  if (!jumpIds || jumpIds.length === 0) {
    jumpIds = manifest.jumps
      .filter((j) => j.confirmed && !j.processed)
      .map((j) => j.id)
  }

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
    if (!jump) continue

    const safeLabel = sanitizeLabel(jump.label)
    const jumpDir = path.join(processedDir, safeLabel)
    const videosDir = path.join(jumpDir, 'videos')
    const photosDir = path.join(jumpDir, 'photos')

    if (jump.files.length === 0) {
      console.log(`[Execute] ${jumpId}: no files, skipping`)
      continue
    }

    fs.mkdirSync(videosDir, { recursive: true })
    fs.mkdirSync(photosDir, { recursive: true })

    let videoIdx = 0
    let photoIdx = 0

    for (const file of jump.files) {
      if (!fs.existsSync(file.path)) continue

      const ext = path.extname(file.path).slice(1).toLowerCase()
      const timestamp = formatTimestamp(file.mtime)
      const newName = `${safeLabel}_${timestamp}.${ext}`

      let dest: string
      if (isVideoFile(file.path)) {
        videoIdx++
        dest = path.join(videosDir, newName)
      } else if (isPhotoFile(file.path)) {
        photoIdx++
        dest = path.join(photosDir, newName)
      } else {
        photoIdx++
        dest = path.join(photosDir, newName)
      }

      const needsCrop = isVideoFile(file.path) &&
        file.cropStart !== null && file.cropStart !== undefined &&
        file.cropEnd !== null && file.cropEnd !== undefined

      if (needsCrop && file.cropStart !== null && file.cropStart !== undefined && file.cropEnd !== null && file.cropEnd !== undefined) {
        const success = cropVideo(file.path, dest, file.cropStart, file.cropEnd)
        if (!success) {
          fs.copyFileSync(file.path, dest)
        }
      } else {
        fs.copyFileSync(file.path, dest)
      }

      const srcStat = fs.statSync(file.path)
      fs.utimesSync(dest, srcStat.atime, srcStat.mtime)
      totalCopied++
    }

    updateMetadata(videosDir)
    updateMetadata(photosDir)

    console.log(`[Execute] ${jumpId}: copied ${jump.files.length} file(s) (${videoIdx} videos, ${photoIdx} photos) to ${jumpDir}`)
    processedCount++
  }

  console.log(`[Execute] Done. Copied ${totalCopied} file(s).`)
  writeStatus('execute', 'done', `Copied ${totalCopied} files`, outputDir)
  scheduleIdle('execute', 5000, outputDir)

  return { copied: totalCopied, processedJumps: processedCount }
}

const isCli = process.argv[1] && (
  process.argv[1].endsWith('execute.ts') ||
  process.argv[1].endsWith('execute.js')
)

if (isCli) {
  const args = process.argv.slice(2)
  const manifestPath = args[0] && fs.existsSync(args[0]) ? args[0] : undefined
  const jumpIds = manifestPath ? args.slice(1) : args.filter((a) => !a.startsWith('-'))

  executeMedia({
    manifestPath,
    jumpIds: jumpIds.length > 0 ? jumpIds : undefined
  })
}

export { executeMedia }
export type { ExecuteOptions, ExecuteResult }
