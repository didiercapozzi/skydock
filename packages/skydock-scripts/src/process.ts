import * as fs from 'node:fs'
import * as path from 'node:path'
import { findMediaFiles, getOutputDir, isCliModule } from './utils'
import { fileMatchesExisting } from './lib/fs'
import { buildExifMap } from './lib/exif'
import { scheduleIdle, writeStatus } from './status'

type ProcessOptions = {
  cameraDirs: string[]
  outputDir?: string
}

const parseDate = (raw: string) => {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

const buildDateMap = (files: string[]) =>
  buildExifMap(files, {
    photoTags: ['-DateTimeOriginal'],
    videoTags: ['-CreateDate'],
    parse: parseDate
  })

const getCaptureDate = (filepath: string, dateMap: Map<string, string>) => {
  const mapped = dateMap.get(filepath)
  if (mapped) return mapped
  const stat = fs.statSync(filepath)
  const date = new Date(stat.mtimeMs)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const processMedia = (options: ProcessOptions) => {
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
export type { ProcessOptions }
