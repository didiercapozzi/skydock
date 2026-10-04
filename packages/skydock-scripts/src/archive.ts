import * as fs from 'node:fs'
import { ZipArchive } from 'archiver'
import { sizeOf } from './utils'
import { stopIfUploadCancelled, stopSignal, UploadCancelled } from './uploading'

type ArchiveEntry = { file: string; name: string }

type ArchiveProgress = { entries: number; totalEntries: number; bytes: number; totalBytes: number }

const VIDEO_LEVEL = 0

const PHOTO_LEVEL = 1

const contentsOf = (zipPath: string) => `${zipPath}.contents`

const namesOf = (entries: ArchiveEntry[]) => JSON.stringify(entries.map((entry) => entry.name))

const sameContents = (zipPath: string, entries: ArchiveEntry[]) => {
  try {
    return fs.readFileSync(contentsOf(zipPath), 'utf-8') === namesOf(entries)
  } catch {
    return false
  }
}

const isArchiveFresh = (zipPath: string, entries: ArchiveEntry[]) => {
  if (!fs.existsSync(zipPath) || entries.length === 0) return false
  if (!sameContents(zipPath, entries)) return false
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
  stopIfUploadCancelled()
  const totalBytes = entries.reduce((sum, entry) => sum + sizeOf(entry.file), 0)
  const part = `${zipPath}.part`
  const output = fs.createWriteStream(part)
  const archive = new ZipArchive({
    zlib: { level: options?.level ?? PHOTO_LEVEL },
    forceZip64: true
  })
  const signal = stopSignal()
  try {
    await new Promise<void>((resolve, reject) => {
      const cutOff = () => {
        archive.abort()
        output.destroy()
        reject(new UploadCancelled())
      }
      signal?.addEventListener('abort', cutOff, { once: true })
      output.on('close', () => {
        signal?.removeEventListener('abort', cutOff)
        resolve()
      })
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
  } catch (e) {
    fs.rmSync(part, { force: true })
    throw e
  }
  fs.rmSync(contentsOf(zipPath), { force: true })
  fs.renameSync(part, zipPath)
  fs.writeFileSync(contentsOf(zipPath), namesOf(entries))
  return zipPath
}

export { isArchiveFresh, PHOTO_LEVEL, sameContents, VIDEO_LEVEL, writeArchive }
export type { ArchiveEntry, ArchiveProgress }
