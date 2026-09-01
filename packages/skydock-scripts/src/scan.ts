import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { MEDIA_EXTENSIONS } from './constants'
import { getOutputDir, getManifestPath, sortFilesByMtime, toISOString } from './utils'
import { writeStatus, scheduleIdle } from './status'
import { loadManifest, saveManifest } from './manifest'
import { reclusterJumps } from './clustering'
import type { Manifest, ManifestFile, ManifestJump } from './types'

type ScanResult = {
  added: number
  removed: number
  unchanged: boolean
  fileCount: number
  jumpCount: number
}

const findMediaFiles = (dir: string): string[] => {
  const results: string[] = []
  const extensions = MEDIA_EXTENSIONS.map((e) => e.toLowerCase())

  const search = (currentDir: string): void => {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          search(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (extensions.includes(ext)) results.push(fullPath)
        }
      }
    } catch {}
  }

  search(dir)
  return results
}

const buildTimeMap = (files: string[]): Map<string, string> => {
  const timeMap = new Map<string, string>()

  const hasExiftool = (() => {
    try {
      execSync('command -v exiftool', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  if (!hasExiftool || files.length === 0) return timeMap

  const jpgExts = new Set(['jpg', 'jpeg', 'dng'])
  const mp4Exts = new Set(['mp4', 'mov'])

  const jpgFiles = files.filter((f) => jpgExts.has(path.extname(f).slice(1).toLowerCase()))
  const mp4Files = files.filter((f) => mp4Exts.has(path.extname(f).slice(1).toLowerCase()))

  if (jpgFiles.length > 0) {
    try {
      const csv = execSync(
        `exiftool -s3 -DateTimeOriginal -CreateDate -MediaCreateDate -csv ${jpgFiles.map((f) => `"${f}"`).join(' ')}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
      for (const line of csv.split('\n')) {
        const parts = line.split(',')
        if (parts.length < 2 || parts[0] === 'SourceFile') continue
        const srcfile = parts[0].replace(/^"|"$/g, '')
        for (let i = 1; i < parts.length; i++) {
          const dateval = parts[i].replace(/^"|"$/g, '').trim()
          if (!dateval) continue
          const match = dateval.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
          if (match) {
            timeMap.set(
              srcfile,
              `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`
            )
            break
          }
        }
      }
    } catch {}
  }

  if (mp4Files.length > 0) {
    try {
      const csv = execSync(
        `exiftool -s3 -CreateDate -MediaCreateDate -TrackCreateDate -DateTimeOriginal -ModifyDate -csv ${mp4Files.map((f) => `"${f}"`).join(' ')}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
      for (const line of csv.split('\n')) {
        const parts = line.split(',')
        if (parts.length < 2 || parts[0] === 'SourceFile') continue
        const srcfile = parts[0].replace(/^"|"$/g, '')
        for (let i = 1; i < parts.length; i++) {
          const dateval = parts[i].replace(/^"|"$/g, '').trim()
          if (!dateval) continue
          const match = dateval.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
          if (match) {
            timeMap.set(
              srcfile,
              `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`
            )
            break
          }
        }
      }
    } catch {}
  }

  return timeMap
}

const getCaptureEpoch = (filepath: string, timeMap: Map<string, string>): number => {
  const tag = timeMap.get(filepath)
  if (tag) {
    const datePart = tag.split(' ')[0].replace(/:/g, '-')
    const timePart = tag.split(' ')[1]
    try {
      return Math.floor(new Date(`${datePart}T${timePart}`).getTime() / 1000)
    } catch {}
  }

  try {
    return Math.floor(fs.statSync(filepath).mtimeMs / 1000)
  } catch {
    return 0
  }
}

const scanFiles = (originalDir: string, timeMap: Map<string, string>): ManifestFile[] => {
  const files = findMediaFiles(originalDir)
  const manifestFiles: ManifestFile[] = []

  for (const filepath of files) {
    const stat = fs.statSync(filepath)
    manifestFiles.push({
      path: filepath,
      size: stat.size,
      mtime: getCaptureEpoch(filepath, timeMap),
      filename: path.basename(filepath)
    })
  }

  return sortFilesByMtime(manifestFiles)
}

const createFreshManifest = (files: ManifestFile[], createdAt: string): Manifest => {
  const manifest: Manifest = {
    version: 1,
    status: 'proposed',
    date: new Date().toISOString().split('T')[0],
    startDatetime: createdAt,
    createdAt,
    theory: [],
    files,
    jumps: []
  }

  reclusterJumps(manifest)
  return manifest
}

const mergeManifests = (
  existing: Manifest,
  diskFiles: ManifestFile[]
): { manifest: Manifest; added: number; removed: number } => {
  const existingPaths = new Set(existing.files.map((f) => f.path))
  const diskPaths = new Set(diskFiles.map((f) => f.path))

  const removedPaths = existing.files.filter((f) => !diskPaths.has(f.path)).map((f) => f.path)
  const addedFiles = diskFiles.filter((f) => !existingPaths.has(f.path))
  const removedSet = new Set(removedPaths)

  if (removedPaths.length === 0 && addedFiles.length === 0) {
    return { manifest: existing, added: 0, removed: 0 }
  }

  const updatedFiles = [...existing.files.filter((f) => !removedSet.has(f.path)), ...addedFiles]

  const keptJumps: ManifestJump[] = []
  for (const jump of existing.jumps) {
    const filteredFiles = jump.files.filter((f) => !removedSet.has(f.path))
    if (filteredFiles.length > 0) {
      keptJumps.push({ ...jump, files: filteredFiles })
    }
  }

  const merged: Manifest = {
    ...existing,
    files: updatedFiles,
    jumps: keptJumps
  }

  reclusterJumps(merged)

  return { manifest: merged, added: addedFiles.length, removed: removedPaths.length }
}

const scanMedia = (options?: { outputDir?: string }): ScanResult => {
  const outputDir = options?.outputDir || getOutputDir()
  const originalDir = path.join(outputDir, 'original_files')
  const manifestPath = getManifestPath(outputDir)

  if (!fs.existsSync(originalDir)) {
    console.log('[Scan] No original_files directory found. Run processMedia first.')
    return { added: 0, removed: 0, unchanged: true, fileCount: 0, jumpCount: 0 }
  }

  writeStatus('scan', 'running', 'Scanning original_files', outputDir)

  const timeMap = buildTimeMap(findMediaFiles(originalDir))
  const diskFiles = scanFiles(originalDir, timeMap)

  if (diskFiles.length === 0) {
    console.log('[Scan] No files found in original_files.')
    writeStatus('scan', 'done', 'No files found', outputDir)
    scheduleIdle('scan', 5000, outputDir)
    return { added: 0, removed: 0, unchanged: true, fileCount: 0, jumpCount: 0 }
  }

  const existing = loadManifest(manifestPath)

  if (!existing) {
    console.log(`[Scan] Creating new manifest with ${diskFiles.length} file(s).`)
    const createdAt = toISOString()
    const manifest = createFreshManifest(diskFiles, createdAt)
    saveManifest(manifestPath, manifest)

    console.log(`[Scan] Found ${diskFiles.length} file(s) in ${manifest.jumps.length} jump(s).`)
    console.log(`[Scan] Manifest: ${manifestPath}`)
    writeStatus(
      'scan',
      'done',
      `Found ${diskFiles.length} files in ${manifest.jumps.length} jumps`,
      outputDir
    )
    scheduleIdle('scan', 5000, outputDir)
    spawnProxies(outputDir)
    return {
      added: diskFiles.length,
      removed: 0,
      unchanged: false,
      fileCount: diskFiles.length,
      jumpCount: manifest.jumps.length
    }
  }

  const { manifest, added, removed } = mergeManifests(existing, diskFiles)

  if (added === 0 && removed === 0) {
    console.log(`[Scan] No changes. ${existing.files.length} file(s) in manifest.`)
    writeStatus('scan', 'done', `No changes, ${existing.files.length} files`, outputDir)
    scheduleIdle('scan', 5000, outputDir)
    return {
      added: 0,
      removed: 0,
      unchanged: true,
      fileCount: existing.files.length,
      jumpCount: existing.jumps.length
    }
  }

  console.log(
    `[Scan] Merging: +${added} new, -${removed} removed, ${existing.files.length} existing.`
  )
  saveManifest(manifestPath, manifest)

  console.log(
    `[Scan] Manifest: ${manifest.files.length} file(s) in ${manifest.jumps.length} jump(s).`
  )
  console.log(`[Scan] Manifest: ${manifestPath}`)
  writeStatus(
    'scan',
    'done',
    `Merged ${manifest.files.length} files in ${manifest.jumps.length} jumps`,
    outputDir
  )
  scheduleIdle('scan', 5000, outputDir)
  spawnProxies(outputDir)
  return {
    added,
    removed,
    unchanged: false,
    fileCount: manifest.files.length,
    jumpCount: manifest.jumps.length
  }
}

const spawnProxies = (outputDir: string): void => {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname)
  const proxyScript = path.join(scriptDir, 'proxies.ts')
  if (!fs.existsSync(proxyScript)) return

  try {
    const { spawn } = require('node:child_process')
    const child = spawn('npx', ['tsx', proxyScript], {
      env: { ...process.env, SKYDOCK_OUTPUT_DIR: outputDir },
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    console.log('[Scan] Proxy generation queued in background')
  } catch {}
}

const isCli =
  process.argv[1] && (process.argv[1].endsWith('scan.ts') || process.argv[1].endsWith('scan.js'))

if (isCli) {
  scanMedia()
}

export { scanMedia }
export type { ScanResult }
