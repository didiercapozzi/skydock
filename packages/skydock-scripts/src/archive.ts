import { createWriteStream } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { ZipArchive } from 'archiver'
import { z } from 'zod'
import { jsonText } from './lib/json'
import { statOrNull } from './lib/fs'
import { mapWithLimit } from './utils'
import { stopIfUploadCancelled, stopSignal, UploadCancelled } from './uploading'

type ArchiveEntry = { file: string; name: string }

type ArchiveProgress = { entries: number; totalEntries: number; bytes: number; totalBytes: number }

const VIDEO_LEVEL = 0

const PHOTO_LEVEL = 1

const contentsOf = (zipPath: string) => `${zipPath}.contents`

const namesOf = (entries: ArchiveEntry[]) => JSON.stringify(entries.map((entry) => entry.name))

const readContents = (zipPath: string) =>
  readFile(contentsOf(zipPath), 'utf-8').then(
    (text) => {
      const names = jsonText.pipe(z.array(z.string())).safeParse(text)
      return names.success ? names.data : null
    },
    () => null
  )

const sameContents = async (zipPath: string, entries: ArchiveEntry[]) =>
  JSON.stringify(await readContents(zipPath)) === namesOf(entries)

const statsOf = (entries: ArchiveEntry[]) =>
  mapWithLimit(entries, 16, (entry) => statOrNull(entry.file))

const isArchiveFresh = async (zipPath: string, entries: ArchiveEntry[]) => {
  if (entries.length === 0) return false
  const zip = await statOrNull(zipPath)
  if (!zip || !(await sameContents(zipPath, entries))) return false
  const stats = await statsOf(entries)
  return stats.every((stat) => stat !== null && stat.mtimeMs <= zip.mtimeMs)
}

const writeArchive = async (
  zipPath: string,
  entries: ArchiveEntry[],
  options?: { level?: number; onProgress?: (progress: ArchiveProgress) => void }
) => {
  if (entries.length === 0) return null
  if (await isArchiveFresh(zipPath, entries)) return zipPath
  stopIfUploadCancelled()
  const totalBytes = (await statsOf(entries)).reduce((sum, stat) => sum + (stat?.size ?? 0), 0)
  const part = `${zipPath}.part`
  const output = createWriteStream(part)
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
    await rm(part, { force: true })
    throw e
  }
  await rm(contentsOf(zipPath), { force: true })
  await rename(part, zipPath)
  await writeFile(contentsOf(zipPath), namesOf(entries))
  return zipPath
}

export { isArchiveFresh, PHOTO_LEVEL, readContents, sameContents, VIDEO_LEVEL, writeArchive }
export type { ArchiveEntry, ArchiveProgress }
