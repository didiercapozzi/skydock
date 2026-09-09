import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  findMediaFiles,
  getManifestPath,
  getOutputDir,
  isCliModule,
  sortFilesByMtime,
  toISOString
} from './utils'
import { buildExifMap } from './lib/exif'
import { scheduleIdle, writeStatus } from './status'
import { loadManifest, saveManifest } from './manifest'
import { computeFileId } from './fileId'
import { reclusterJumps } from './clustering'
import type { Manifest, ManifestFile, ManifestJump } from './types'

type ScanResult = {
  added: number
  removed: number
  moved: number
  unchanged: boolean
  fileCount: number
  jumpCount: number
}

const parseDateTime = (raw: string) => {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : null
}

const buildTimeMap = (files: string[]) =>
  buildExifMap(files, {
    photoTags: ['-DateTimeOriginal', '-CreateDate', '-MediaCreateDate'],
    videoTags: [
      '-CreateDate',
      '-MediaCreateDate',
      '-TrackCreateDate',
      '-DateTimeOriginal',
      '-ModifyDate'
    ],
    parse: parseDateTime
  })

const getCaptureEpoch = (filepath: string, timeMap: Map<string, string>) => {
  const tag = timeMap.get(filepath)
  if (tag) {
    const datePart = tag.split(' ')[0].replace(/:/g, '-')
    const timePart = tag.split(' ')[1]
    try {
      const epoch = Math.floor(new Date(`${datePart}T${timePart}`).getTime() / 1000)
      if (Number.isFinite(epoch)) return epoch
    } catch {}
  }

  try {
    return Math.floor(fs.statSync(filepath).mtimeMs / 1000)
  } catch {
    return 0
  }
}

const HASH_POOL_SIZE = 4

const scanFiles = async (originalDir: string, timeMap: Map<string, string>) => {
  const files = findMediaFiles(originalDir)
  const manifestFiles: ManifestFile[] = new Array(files.length)
  const stats = files.map((filepath) => fs.statSync(filepath))
  let next = 0
  const workers = Array.from(
    { length: Math.min(HASH_POOL_SIZE, Math.max(files.length, 1)) },
    async () => {
      while (next < files.length) {
        const i = next
        next++
        const filepath = files[i]
        const stat = stats[i]
        if (!filepath || !stat) continue
        const id = await computeFileId(filepath)
        manifestFiles[i] = {
          path: filepath,
          size: stat.size,
          mtime: getCaptureEpoch(filepath, timeMap),
          filename: path.basename(filepath),
          id
        }
      }
    }
  )
  await Promise.all(workers)

  return sortFilesByMtime(manifestFiles)
}

const createFreshManifest = (files: ManifestFile[], createdAt: string) => {
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

const mergeManifests = async (existing: Manifest, diskFiles: ManifestFile[]) => {
  const existingByPath = new Map(existing.files.map((f) => [f.path, f]))
  const diskByPath = new Map(diskFiles.map((f) => [f.path, f]))
  const diskPathsById = new Map<string, string[]>()
  for (const f of diskFiles) {
    if (!f.id) continue
    const list = diskPathsById.get(f.id) ?? []
    list.push(f.path)
    diskPathsById.set(f.id, list)
  }
  const existingPathsById = new Map<string, string[]>()
  for (const f of existing.files) {
    if (!f.id) continue
    const list = existingPathsById.get(f.id) ?? []
    list.push(f.path)
    existingPathsById.set(f.id, list)
  }

  const claimedDiskPaths = new Set<string>()
  const keptFiles: ManifestFile[] = []
  let removed = 0
  let moved = 0
  for (const f of existing.files) {
    const disk = diskByPath.get(f.path)
    if (disk) {
      keptFiles.push(disk)
      continue
    }
    const candidates = (f.id && diskPathsById.get(f.id)) || []
    const fresh = candidates.filter((p) => !existingByPath.has(p) && !claimedDiskPaths.has(p))
    const siblings = (f.id && existingPathsById.get(f.id)) || []
    const freshPath = fresh.length === 1 && siblings.length === 1 ? fresh[0] : undefined
    const movedDisk = freshPath ? diskByPath.get(freshPath) : undefined
    if (freshPath && movedDisk) {
      claimedDiskPaths.add(freshPath)
      keptFiles.push(movedDisk)
      moved++
      continue
    }
    removed++
  }
  const addedFiles = diskFiles.filter(
    (f) => !existingByPath.has(f.path) && !claimedDiskPaths.has(f.path)
  )

  if (removed === 0 && addedFiles.length === 0 && moved === 0) {
    return { manifest: existing, added: 0, removed: 0, moved: 0 }
  }

  const updatedFiles = [...keptFiles, ...addedFiles]
  const keptIds = new Set<string>()
  for (const f of updatedFiles) if (f.id) keptIds.add(f.id)
  const keptPaths = new Set(updatedFiles.map((f) => f.path))

  const keptJumps: ManifestJump[] = []
  for (const jump of existing.jumps) {
    const filteredFiles = jump.files.filter((f) =>
      f.id ? keptIds.has(f.id) : keptPaths.has(f.path)
    )
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

  return { manifest: merged, added: addedFiles.length, removed, moved }
}

const scanMedia = async (options?: { outputDir?: string }) => {
  const outputDir = options?.outputDir || getOutputDir()
  const originalDir = path.join(outputDir, 'original_files')
  const manifestPath = getManifestPath(outputDir)

  if (!fs.existsSync(originalDir)) {
    console.log('[Scan] No original_files directory found. Run processMedia first.')
    return { added: 0, removed: 0, moved: 0, unchanged: true, fileCount: 0, jumpCount: 0 }
  }

  writeStatus('scan', 'running', 'Scanning original_files', outputDir)

  const timeMap = buildTimeMap(findMediaFiles(originalDir))
  const diskFiles = await scanFiles(originalDir, timeMap)

  const existing = loadManifest(manifestPath)

  if (!existing) {
    if (diskFiles.length === 0) {
      console.log('[Scan] No files found in original_files.')
      writeStatus('scan', 'done', 'No files found', outputDir)
      scheduleIdle('scan', 5000, outputDir)
      return { added: 0, removed: 0, moved: 0, unchanged: true, fileCount: 0, jumpCount: 0 }
    }

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
    return {
      added: diskFiles.length,
      removed: 0,
      moved: 0,
      unchanged: false,
      fileCount: diskFiles.length,
      jumpCount: manifest.jumps.length
    }
  }

  const { manifest, added, removed, moved } = await mergeManifests(existing, diskFiles)

  if (added === 0 && removed === 0 && moved === 0) {
    console.log(`[Scan] No changes. ${existing.files.length} file(s) in manifest.`)
    writeStatus('scan', 'done', `No changes, ${existing.files.length} files`, outputDir)
    scheduleIdle('scan', 5000, outputDir)
    return {
      added: 0,
      removed: 0,
      moved: 0,
      unchanged: true,
      fileCount: existing.files.length,
      jumpCount: existing.jumps.length
    }
  }

  console.log(
    `[Scan] Merging: +${added} new, -${removed} removed, ~${moved} moved, ${existing.files.length} existing.`
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
  return {
    added,
    removed,
    moved,
    unchanged: false,
    fileCount: manifest.files.length,
    jumpCount: manifest.jumps.length
  }
}

if (isCliModule('scan')) {
  scanMedia().catch(console.error)
}

export { scanMedia }
export type { ScanResult }
