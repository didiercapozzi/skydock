import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { MEDIA_EXTENSIONS } from './constants'
import { getOutputDir } from './utils'
import { writeStatus, scheduleIdle } from './status'

type ProcessOptions = {
  cameraDirs: string[]
  outputDir?: string
}

export type { ProcessOptions }

const findMediaFiles = (dir: string, maxDepth = 4): string[] => {
  const results: string[] = []
  const extensions = MEDIA_EXTENSIONS.map((e) => e.toLowerCase())

  const search = (currentDir: string, depth: number): void => {
    if (depth > maxDepth) return
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          search(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (extensions.includes(ext)) results.push(fullPath)
        }
      }
    } catch {}
  }

  search(dir, 0)
  return results
}

const buildDateMap = (files: string[]): Map<string, string> => {
  const dateMap = new Map<string, string>()

  const hasExiftool = (() => {
    try {
      execSync('command -v exiftool', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  if (!hasExiftool || files.length === 0) return dateMap

  const jpgExts = new Set(['jpg', 'jpeg', 'dng'])
  const mp4Exts = new Set(['mp4', 'mov'])

  const jpgFiles = files.filter((f) => jpgExts.has(path.extname(f).slice(1).toLowerCase()))
  const mp4Files = files.filter((f) => mp4Exts.has(path.extname(f).slice(1).toLowerCase()))

  if (jpgFiles.length > 0) {
    try {
      const csv = execSync(`exiftool -s3 -DateTimeOriginal -csv ${jpgFiles.map((f) => `"${f}"`).join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      })
      for (const line of csv.split('\n')) {
        const [srcfile, dateval] = line.split(',')
        if (!srcfile || srcfile === 'SourceFile' || !dateval) continue
        const cleaned = dateval.replace(/^"|"$/g, '').trim()
        const match = cleaned.match(/^(\d{4}):(\d{2}):(\d{2})/)
        if (match) dateMap.set(srcfile.replace(/^"|"$/g, ''), `${match[1]}-${match[2]}-${match[3]}`)
      }
    } catch {}
  }

  if (mp4Files.length > 0) {
    try {
      const csv = execSync(`exiftool -s3 -CreateDate -csv ${mp4Files.map((f) => `"${f}"`).join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      })
      for (const line of csv.split('\n')) {
        const [srcfile, dateval] = line.split(',')
        if (!srcfile || srcfile === 'SourceFile' || !dateval) continue
        const cleaned = dateval.replace(/^"|"$/g, '').trim()
        const match = cleaned.match(/^(\d{4}):(\d{2}):(\d{2})/)
        if (match) dateMap.set(srcfile.replace(/^"|"$/g, ''), `${match[1]}-${match[2]}-${match[3]}`)
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
    execSync(`cmp -s "${src}" "${existing}"`, { stdio: 'ignore' })
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

const isCli = process.argv[1] && (
  process.argv[1].endsWith('process.ts') ||
  process.argv[1].endsWith('process.js')
)

if (isCli) {
  const args = process.argv.slice(2)
  const cameraDirs = args.filter((a) => !a.startsWith('-') && fs.existsSync(a))

  if (cameraDirs.length === 0) {
    console.error('Usage: skydock-process <camera_dir> [camera_dir ...]')
    process.exit(1)
  }

  processMedia({ cameraDirs })
}

export { processMedia }
