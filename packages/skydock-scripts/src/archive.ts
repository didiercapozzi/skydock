import * as fs from 'node:fs'
import { ZipArchive } from 'archiver'

type ArchiveEntry = { file: string; name: string }

type ArchiveProgress = { entries: number; totalEntries: number; bytes: number; totalBytes: number }

/* Video is already compressed, so squeezing it again spends minutes of CPU to save nothing; photos
   give a little back for very little. */
const VIDEO_LEVEL = 0

const PHOTO_LEVEL = 1

const sizeOf = (file: string) => {
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

/* An archive is skipped when it is already newer than everything in it, so delivering a second time
   after a re-render does not spend ten minutes rebuilding gigabytes that did not change. */
const isArchiveFresh = (zipPath: string, entries: ArchiveEntry[]) => {
  if (!fs.existsSync(zipPath) || entries.length === 0) return false
  const built = fs.statSync(zipPath).mtimeMs
  return entries.every((entry) => {
    try {
      return fs.statSync(entry.file).mtimeMs <= built
    } catch {
      return false
    }
  })
}

const writeArchive = async (
  zipPath: string,
  entries: ArchiveEntry[],
  options?: { level?: number; onProgress?: (progress: ArchiveProgress) => void }
) => {
  if (entries.length === 0) return null
  if (isArchiveFresh(zipPath, entries)) return zipPath
  const totalBytes = entries.reduce((sum, entry) => sum + sizeOf(entry.file), 0)
  const output = fs.createWriteStream(zipPath)
  /* a tandem's rushes pass 4 GB, and a zip that silently truncates past that is the worst way
     for this to fail — it looks like a delivered backup and is not one */
  const archive = new ZipArchive({
    zlib: { level: options?.level ?? PHOTO_LEVEL },
    forceZip64: true
  })
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('progress', (progress) =>
      options?.onProgress?.({
        entries: progress.entries.processed,
        totalEntries: entries.length,
        bytes: progress.fs.processedBytes,
        totalBytes
      })
    )
    archive.pipe(output)
    for (const entry of entries) archive.file(entry.file, { name: entry.name })
    archive.finalize()
  })
  return zipPath
}

export { isArchiveFresh, PHOTO_LEVEL, VIDEO_LEVEL, writeArchive }
export type { ArchiveEntry, ArchiveProgress }
