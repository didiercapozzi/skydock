import * as fs from 'node:fs'
import * as path from 'node:path'
import { getManifestPath, getOutputDir, isCliModule, sortFilesByMtime } from './utils'
import { readExifMap } from './lib/exif'
import { job } from './live'
import { MANIFEST_VERSION, readRecordAsync, RECORD_UNREADABLE, saveManifest } from './manifest'
import { computeFileId } from './fileId'
import { findMediaFilesAsync, mtimeOf, writeJsonAtomic } from './lib/fs'
import { z } from 'zod'
import { groupNewFiles, reclusterGroups } from './clustering'
import { catchUp } from './catchUp'
import type { ScanResult } from './boardAnswer'
import type { Manifest, ManifestFile, ManifestGroup } from './types'

const parseDateTime = (raw: string) => {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : null
}

const TIME_TAGS = {
  photoTags: ['-DateTimeOriginal', '-CreateDate', '-MediaCreateDate'],
  videoTags: [
    '-CreateDate',
    '-MediaCreateDate',
    '-TrackCreateDate',
    '-DateTimeOriginal',
    '-ModifyDate'
  ],
  parse: parseDateTime
}

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
    return mtimeOf(filepath)
  } catch {
    return 0
  }
}

const diskTimes = (paths: string[]) =>
  new Map(paths.map((filepath) => [filepath, getCaptureEpoch(filepath, new Map())]))

const shotsKnown = new Map<string, { size: number; at: number; shot: number }>()
const SHOTS_KEPT = 20_000

const shotTimes = async (paths: string[]) => {
  const stamps = await Promise.all(
    paths.map((filepath) =>
      fs.promises.stat(filepath).then(
        (stat) => ({ size: stat.size, at: stat.mtimeMs }),
        () => null
      )
    )
  )
  const found = new Map<string, number>()
  const unread: number[] = []
  paths.forEach((filepath, i) => {
    const kept = shotsKnown.get(filepath)
    const stamp = stamps[i]
    if (kept && stamp && kept.size === stamp.size && kept.at === stamp.at)
      found.set(filepath, kept.shot)
    else unread.push(i)
  })
  if (unread.length > 0) {
    const timeMap = await readExifMap(
      unread.map((i) => paths[i]!),
      TIME_TAGS
    )
    if (shotsKnown.size > SHOTS_KEPT) shotsKnown.clear()
    for (const i of unread) {
      const filepath = paths[i]!
      const shot = getCaptureEpoch(filepath, timeMap)
      found.set(filepath, shot)
      const stamp = stamps[i]
      if (stamp && timeMap.has(filepath)) shotsKnown.set(filepath, { ...stamp, shot })
    }
  }
  return new Map(paths.map((filepath) => [filepath, found.get(filepath)!]))
}

const HASH_POOL_SIZE = 4

const knownIdsSchema = z.record(
  z.string(),
  z.object({ size: z.number(), at: z.number(), id: z.string(), shot: z.number().optional() })
)
type KnownIds = z.infer<typeof knownIdsSchema>

const NOTHING_KNOWN: KnownIds = {}

const knownIdsPath = (originalDir: string) => path.join(path.dirname(originalDir), '.ids.json')

const readKnownIds = async (originalDir: string) => {
  try {
    return knownIdsSchema.parse(
      JSON.parse(await fs.promises.readFile(knownIdsPath(originalDir), 'utf8'))
    )
  } catch {
    return NOTHING_KNOWN
  }
}

const scanFiles = async (originalDir: string) => {
  const known = await readKnownIds(originalDir)
  const seen: KnownIds = {}
  const files = await findMediaFilesAsync(originalDir)
  const manifestFiles: ManifestFile[] = new Array(files.length)
  const stats = await Promise.all(files.map((filepath) => fs.promises.stat(filepath)))
  const unchanged = (i: number) => {
    const before = known[files[i] ?? '']
    const stat = stats[i]
    return before && stat && before.size === stat.size && before.at === stat.mtimeMs ? before : null
  }
  const timeMap = await readExifMap(
    files.filter((_, i) => unchanged(i)?.shot === undefined),
    TIME_TAGS
  )
  const toRead = files.filter((_, i) => !unchanged(i)).length
  const reading =
    toRead > 0
      ? job({ type: 'scan', label: path.basename(path.dirname(originalDir)), total: toRead })
      : null
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
        const before = unchanged(i)
        if (!before) reading?.working(path.basename(filepath))
        const id = before ? before.id : await computeFileId(filepath)
        if (!before) reading?.step()
        const shot = before?.shot ?? getCaptureEpoch(filepath, timeMap)
        seen[filepath] = { size: stat.size, at: stat.mtimeMs, id, shot }
        manifestFiles[i] = {
          path: filepath,
          size: stat.size,
          mtime: shot,
          filename: path.basename(filepath),
          id
        }
      }
    }
  )
  try {
    await Promise.all(workers)
  } catch (e) {
    reading?.fail(e instanceof Error ? e.message : String(e))
    throw e
  }
  reading?.finish()
  try {
    writeJsonAtomic(knownIdsPath(originalDir), seen)
  } catch {}

  return sortFilesByMtime(manifestFiles)
}

const createFreshManifest = (files: ManifestFile[], createdAt: string) => {
  const manifest: Manifest = { version: MANIFEST_VERSION, createdAt, files, groups: [] }

  reclusterGroups(manifest)
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
  const returnedIds = new Set<string>()
  const keptFiles: ManifestFile[] = []
  let removed = 0
  let moved = 0
  const here = ({ freed: _freed, ...rest }: ManifestFile) => rest
  const kept = (f: ManifestFile, disk: ManifestFile) => ({
    ...here(f),
    ...disk,
    ...(disk.id === f.id ? { mtime: f.mtime } : {})
  })
  for (const f of existing.files) {
    if (f.copyOf) continue
    const disk = diskByPath.get(f.path)
    if (disk) {
      if (f.freed && f.id) returnedIds.add(f.id)
      keptFiles.push(kept(f, disk))
      continue
    }
    if (f.freed) {
      const back = ((f.id && diskPathsById.get(f.id)) || []).filter(
        (p) => !existingByPath.has(p) && !claimedDiskPaths.has(p)
      )
      const returned = back.length === 1 ? diskByPath.get(back[0]!) : undefined
      if (!returned) {
        keptFiles.push(f)
        continue
      }
      claimedDiskPaths.add(returned.path)
      if (f.id) returnedIds.add(f.id)
      keptFiles.push(kept(f, returned))
      continue
    }
    const candidates = (f.id && diskPathsById.get(f.id)) || []
    const fresh = candidates.filter((p) => !existingByPath.has(p) && !claimedDiskPaths.has(p))
    const siblings = (f.id && existingPathsById.get(f.id)) || []
    const freshPath = fresh.length === 1 && siblings.length === 1 ? fresh[0] : undefined
    const movedDisk = freshPath ? diskByPath.get(freshPath) : undefined
    if (freshPath && movedDisk) {
      claimedDiskPaths.add(freshPath)
      keptFiles.push(kept(f, movedDisk))
      moved++
      continue
    }
    if (fs.existsSync(f.path)) {
      keptFiles.push(f)
      continue
    }
    removed++
  }
  for (const copy of existing.files) {
    if (!copy.copyOf) continue
    const original = keptFiles.find((k) => !k.copyOf && k.id === copy.copyOf)
    if (original)
      keptFiles.push({
        ...(diskByPath.has(original.path) ? here(copy) : copy),
        path: original.path,
        filename: original.filename,
        size: original.size
      })
    else removed++
  }
  const addedFiles = diskFiles.filter(
    (f) => !existingByPath.has(f.path) && !claimedDiskPaths.has(f.path)
  )

  if (removed === 0 && addedFiles.length === 0 && moved === 0 && returnedIds.size === 0) {
    return { manifest: existing, added: 0, removed: 0, moved: 0 }
  }

  const updatedFiles = [...keptFiles, ...addedFiles]
  const keptIds = new Set<string>()
  for (const f of updatedFiles) if (f.id) keptIds.add(f.id)
  const keptPaths = new Set(updatedFiles.map((f) => f.path))

  const keptGroups: ManifestGroup[] = []
  for (const group of existing.groups) {
    const filteredFiles = group.files.filter((f) =>
      f.id ? keptIds.has(f.id) : keptPaths.has(f.path)
    )
    if (filteredFiles.length > 0) {
      const returned = group.freed && filteredFiles.some((f) => f.id && returnedIds.has(f.id))
      const { freed: _gone, ...rest } = group
      keptGroups.push(
        returned ? { ...rest, files: filteredFiles } : { ...group, files: filteredFiles }
      )
    }
  }

  const merged: Manifest = {
    ...existing,
    files: updatedFiles,
    groups: keptGroups
  }

  groupNewFiles(merged, addedFiles)

  return { manifest: merged, added: addedFiles.length, removed, moved, returned: returnedIds.size }
}

const scanMedia = async (options?: { outputDir?: string }) => {
  const outputDir = options?.outputDir || getOutputDir()
  const originalDir = path.join(outputDir, 'original_files')
  const manifestPath = getManifestPath(outputDir)

  fs.mkdirSync(originalDir, { recursive: true })

  const diskFiles = await scanFiles(originalDir)

  const { manifest: existing, unreadable } = await readRecordAsync(manifestPath)
  if (unreadable) throw new Error(RECORD_UNREADABLE)

  if (!existing) {
    const createdAt = new Date().toISOString()
    const manifest = createFreshManifest(diskFiles, createdAt)
    saveManifest(manifestPath, manifest)

    if (diskFiles.length === 0) {
      console.log('[Scan] Nothing in original_files yet. Copy a camera off, then scan again.')
      return { added: 0, removed: 0, moved: 0, unchanged: true, fileCount: 0, groupCount: 0 }
    }

    console.log(`[Scan] Found ${diskFiles.length} file(s) in ${manifest.groups.length} group(s).`)
    console.log(`[Scan] Manifest: ${manifestPath}`)
    return {
      added: diskFiles.length,
      removed: 0,
      moved: 0,
      unchanged: false,
      fileCount: diskFiles.length,
      groupCount: manifest.groups.length
    }
  }

  const { manifest, added, removed, moved, returned } = await mergeManifests(existing, diskFiles)

  if (added === 0 && removed === 0 && moved === 0 && returned === 0) {
    console.log(`[Scan] No changes. ${existing.files.length} file(s) in manifest.`)
    return {
      added: 0,
      removed: 0,
      moved: 0,
      unchanged: true,
      fileCount: existing.files.length,
      groupCount: existing.groups.length
    }
  }

  console.log(
    `[Scan] Merging: +${added} new, -${removed} removed, ~${moved} moved, ${returned} back, ${existing.files.length} existing.`
  )
  saveManifest(manifestPath, manifest)

  console.log(
    `[Scan] Manifest: ${manifest.files.length} file(s) in ${manifest.groups.length} group(s).`
  )
  console.log(`[Scan] Manifest: ${manifestPath}`)
  return {
    added,
    removed,
    moved,
    unchanged: false,
    fileCount: manifest.files.length,
    groupCount: manifest.groups.length
  }
}

if (isCliModule('scan')) {
  scanMedia()
    .then(() => catchUp())
    .catch(console.error)
}

export { diskTimes, shotTimes, scanMedia }
export type { ScanResult }
