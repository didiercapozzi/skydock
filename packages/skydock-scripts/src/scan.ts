import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  findMediaFiles,
  getManifestPath,
  getOutputDir,
  isCliModule,
  sortFilesByMtime
} from './utils'
import { buildExifMap, readExifMap } from './lib/exif'
import { loadManifest, MANIFEST_VERSION, saveManifest } from './manifest'
import { computeFileId } from './fileId'
import { writeJsonAtomic } from './lib/fs'
import { z } from 'zod'
import { groupNewFiles, reclusterGroups } from './clustering'
import { buildMissingProxies } from './proxy'
import type { ScanResult } from './boardAnswer'
import type { Manifest, ManifestFile, ManifestGroup } from './types'

const parseDateTime = (raw: string) => {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : null
}

/* The one reading of when a file was shot, whichever way it arrives — scanned, dropped in, copied off
   a camera, brought back from the bin — so it is filed under the same day however it came. */
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

const buildTimeMap = (files: string[]) => buildExifMap(files, TIME_TAGS)

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

/* The time each camera gave its files, read again from the originals — what a file's time was
   before anybody corrected it. */
const cameraTimes = (paths: string[]) => {
  const timeMap = buildTimeMap(paths)
  return new Map(paths.map((filepath) => [filepath, getCaptureEpoch(filepath, timeMap)]))
}

/* the same, without holding the server while exiftool reads a whole card */
const shotTimes = async (paths: string[]) => {
  const timeMap = await readExifMap(paths, TIME_TAGS)
  return new Map(paths.map((filepath) => [filepath, getCaptureEpoch(filepath, timeMap)]))
}

const HASH_POOL_SIZE = 4

/* What each original was found to be last time, by where it sits, with the size and the moment it
   was last written then. A file that has not changed since keeps the identity it was given, so a
   Rescan reads the new files through and not the whole library again; a file written since — even
   at the same size — is read in full. Beside the board in the work folder, and only a shortcut: if
   it is gone or unreadable, everything is read as before. */
const knownIdsSchema = z.record(
  z.string(),
  z.object({ size: z.number(), at: z.number(), id: z.string() })
)
type KnownIds = z.infer<typeof knownIdsSchema>

const NOTHING_KNOWN: KnownIds = {}

const knownIdsPath = (originalDir: string) => path.join(path.dirname(originalDir), '.ids.json')

const readKnownIds = (originalDir: string) => {
  try {
    return knownIdsSchema.parse(JSON.parse(fs.readFileSync(knownIdsPath(originalDir), 'utf8')))
  } catch {
    return NOTHING_KNOWN
  }
}

const scanFiles = async (originalDir: string, timeMap: Map<string, string>) => {
  const known = readKnownIds(originalDir)
  const seen: KnownIds = {}
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
        const before = known[filepath]
        const id =
          before && before.size === stat.size && before.at === stat.mtimeMs
            ? before.id
            : await computeFileId(filepath)
        seen[filepath] = { size: stat.size, at: stat.mtimeMs, id }
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
  try {
    writeJsonAtomic(knownIdsPath(originalDir), seen)
  } catch {
    /* only a shortcut: the next scan reads everything instead */
  }

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
  /* what was freed and is on the disk again, which is the one thing that undoes a freeing */
  const returnedIds = new Set<string>()
  const keptFiles: ManifestFile[] = []
  let removed = 0
  let moved = 0
  /* Keep what the registry knows and let the disk win on what the disk measures. The bare disk
     entry knows nothing of where a file is filed or what was made from it, so taking it alone would
     un-sort every loose file whenever one file came or went. A file whose contents are the same keeps
     the time it was given, corrected or not; one whose contents changed is another file, with the
     time its camera gave it, and invalidates what was made from it through its new size and time. */
  /* Being freed is the file not being here, never a mark it carries: one that is on the disk again,
     however it came back, is read like any other file (RULES, File status). */
  const here = ({ freed: _freed, ...rest }: ManifestFile) => rest
  const kept = (f: ManifestFile, disk: ManifestFile) => ({
    ...here(f),
    ...disk,
    ...(disk.id === f.id ? { mtime: f.mtime } : {})
  })
  for (const f of existing.files) {
    /* a copy is looked at once its original has been, below */
    if (f.copyOf) continue
    const disk = diskByPath.get(f.path)
    if (disk) {
      if (f.freed && f.id) returnedIds.add(f.id)
      keptFiles.push(kept(f, disk))
      continue
    }
    /* Freed on purpose once the storage held it: not being on disk is the point, not a loss. It is
       back only when somebody asked for it back, and then it may be back under a name with a number
       — its own was taken while it was away — so it is looked for by what it contains rather than by
       where it sat (RULES, Freeing space). */
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
    /* On the disk after all, only not when the disk was looked at: a file that landed while this
       scan was reading — off a camera being copied, put on the board as it landed — is kept as the
       registry has it, not taken for gone. */
    if (fs.existsSync(f.path)) {
      keptFiles.push(f)
      continue
    }
    removed++
  }
  /* A copy is an entry of its own for a file that is on the disk once: it goes where its original
     went — still there, moved, or gone — and keeps its own identity and its own time, which the
     contents of the file could only give back as the original's. */
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

  /* a file asked back is a change like any other: it is here again, and the registry has to say so
     rather than keeping the mark that says it is on the storage alone */
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
      /* a jump lives on the storage only for as long as nothing of it is here: a file asked back
         makes it a jump again, with the mark gone (RULES, Freeing space) */
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

  /* A work folder that has just been chosen has nothing in it at all. The originals folder is made
     here rather than waited for, so that a folder SkyDock has been pointed at looks like one it is
     working in, and so the scan below has somewhere to look. */
  fs.mkdirSync(originalDir, { recursive: true })

  const timeMap = buildTimeMap(findMediaFiles(originalDir))
  const diskFiles = await scanFiles(originalDir, timeMap)

  const existing = loadManifest(manifestPath)

  if (!existing) {
    const createdAt = new Date().toISOString()
    const manifest = createFreshManifest(diskFiles, createdAt)
    /* Written even when the folder was empty. A scan that found nothing is still a scan, and the
       registry is what the rest of SkyDock asks before it acts — without one, a file dropped on the
       board is refused and told to run the scan that has just run. */
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

  /* a file asked back from the storage is here again, which the registry has to be told even when
     nothing else about the disk changed (RULES, Freeing space) */
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
  /* from a terminal the proxies are built in front of you rather than behind the answer, because
     there is no board here to show them arriving later */
  scanMedia()
    .then(() => buildMissingProxies())
    .catch(console.error)
}

export { cameraTimes, shotTimes, scanMedia }
export type { ScanResult }
