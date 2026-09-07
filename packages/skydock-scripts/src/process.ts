import * as fs from 'node:fs'
import * as path from 'node:path'
import * as childProcess from 'node:child_process'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from './constants'
import {
  getOutputDir,
  checkExiftool,
  findMediaFiles,
  getExtension,
  isCliModule,
  parseExiftoolCsv
} from './utils'
import { writeStatus, scheduleIdle } from './status'

type ProcessOptions = {
  cameraDirs: string[]
  outputDir?: string
}

export type { ProcessOptions }

const buildDateMap = (files: string[]): Map<string, string> => {
  const dateMap = new Map<string, string>()

  const hasExiftool = checkExiftool()

  if (!hasExiftool || files.length === 0) return dateMap

  const jpgFiles = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const mp4Files = files.filter((f) => VIDEO_EXTENSIONS_SET.has(getExtension(f)))

  if (jpgFiles.length > 0) {
    try {
      const csv = childProcess.execSync(
        `exiftool -s3 -DateTimeOriginal -csv ${jpgFiles.map((f) => `"${f}"`).join(' ')}`,
        {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      )
      for (const [file, raw] of parseExiftoolCsv(csv)) {
        const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})/)
        if (match) dateMap.set(file, `${match[1]}-${match[2]}-${match[3]}`)
      }
    } catch {}
  }

  if (mp4Files.length > 0) {
    try {
      const csv = childProcess.execSync(
        `exiftool -s3 -CreateDate -csv ${mp4Files.map((f) => `"${f}"`).join(' ')}`,
        {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        }
      )
      for (const [file, raw] of parseExiftoolCsv(csv)) {
        const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})/)
        if (match) dateMap.set(file, `${match[1]}-${match[2]}-${match[3]}`)
      }
    } catch {}
  }

  return dateMap
}

const getCaptureDate = (filepath: string, dateMap: Map<string, string>): string => {
  const mapped = dateMap.get(filepath)
  if (mapped) return mapped

  const stat = fs.statSync(filepath)
  const date = new Date(stat.mtimeMs)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const fileMatchesExisting = (src: string, destDir: string): boolean => {
  const filename = path.basename(src)
  const existing = path.join(destDir, filename)
  if (!fs.existsSync(existing)) return false
  try {
    childProcess.execSync(`cmp -s "${src}" "${existing}"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const processMedia = (options: ProcessOptions): { copied: number; skipped: number } => {
  const outputDir = options.outputDir || getOutputDir()
  const originalDir = path.join(outputDir, 'original_files')

  fs.mkdirSync(originalDir, { recursive: true })

  writeStatus('process', 'running', 'Copying from cameras', outputDir)

  let totalCopied = 0
  let totalSkipped = 0

  const allFiles: string[] = []
  for (const camDir of options.cameraDirs) {
    if (!fs.existsSync(camDir)) continue
    allFiles.push(...findMediaFiles(camDir))
  }

  const dateMap = buildDateMap(allFiles)

  for (const filepath of allFiles) {
    const targetDate = getCaptureDate(filepath, dateMap)
    const destDir = path.join(originalDir, targetDate)
    fs.mkdirSync(destDir, { recursive: true })

    if (fileMatchesExisting(filepath, destDir)) {
      totalSkipped++
      continue
    }

    const destPath = path.join(destDir, path.basename(filepath))
    fs.copyFileSync(filepath, destPath)
    const srcStat = fs.statSync(filepath)
    fs.utimesSync(destPath, srcStat.atime, srcStat.mtime)
    totalCopied++
  }

  const msg = `Copied: ${totalCopied}, Skipped (existing): ${totalSkipped}`
  console.log(`[Done] ${msg}`)
  writeStatus('process', 'done', msg, outputDir)
  scheduleIdle('process', 5000, outputDir)

  return { copied: totalCopied, skipped: totalSkipped }
}

if (isCliModule('process')) {
  const args = process.argv.slice(2)
  const cameraDirs = args.filter((a) => !a.startsWith('-') && fs.existsSync(a))

  if (cameraDirs.length === 0) {
    console.error('Usage: skydock-process <camera_dir> [camera_dir ...]')
    process.exit(1)
  }

  processMedia({ cameraDirs })
}

export { processMedia }
