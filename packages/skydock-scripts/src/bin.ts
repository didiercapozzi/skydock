import * as fs from 'node:fs'
import * as path from 'node:path'
import type { BinBatch, BinFile } from './binEntry'
import { isMediaName } from './constants'
import { computeFileId } from './fileId'
import { dayFolder, freeName } from './importFile'
import { moveFile } from './lib/fs'
import { cameraTimes } from './scan'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

/* The bin, seen from the board (RULES, Putting files in the bin). It is only ever looked into and
   brought back from: SkyDock puts things in it and never takes anything out of it by itself — it is
   emptied by hand, from the machine's own folders, or not at all. */

/* when a batch was put aside, off the moment in its name — `unsorted-2026-09-24T12-30-05-123Z` — or
   the folder's own time when its name does not say */
const STAMP = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/
const putAsideAt = (folder: string, dir: string) => {
  const m = STAMP.exec(folder)
  if (m) {
    const [, y, mo, d, h, mi, s, ms] = m.map(Number) as number[]
    return Math.floor(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!) / 1000)
  }
  return Math.floor(fs.statSync(dir).mtimeMs / 1000)
}

/* what it came from, off the start of its name: Fresh files, or a camera — named after it */
const fromOf = (folder: string) =>
  folder.startsWith('unsorted-')
    ? { from: 'fresh' as const }
    : folder.startsWith('camera-')
      ? {
          from: 'camera' as const,
          camera: folder.replace(STAMP, '').replace(/-$/, '').slice('camera-'.length)
        }
      : { from: 'other' as const }

/* every picture and film under a folder of the bin, however deep it was kept */
const filesUnder = (dir: string): BinFile[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(at)
    if (!entry.isFile() || !isMediaName(entry.name)) return []
    const stat = fs.statSync(at)
    return [{ path: at, name: entry.name, size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }]
  })

/* What the bin holds, the latest put aside first. A batch whose files have all been brought back is
   left out: its folder is still there, empty, since nothing in the bin is deleted by SkyDock. */
const listBin = (trashDir = getTrashDir()): BinBatch[] => {
  if (!fs.existsSync(trashDir)) return []
  return fs
    .readdirSync(trashDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = path.join(trashDir, entry.name)
      const files = filesUnder(dir).sort((a, b) => a.name.localeCompare(b.name))
      if (files.length === 0) return []
      return [{ folder: entry.name, ...fromOf(entry.name), at: putAsideAt(entry.name, dir), files }]
    })
    .sort((a, b) => b.at - a.at)
}

/* Files brought back out of the bin, into the originals under the day each was shot, where a scan
   finds them and puts them in Fresh files. Only a file really in the bin can be asked for, and one
   whose footage is on the board already stays where it is: bringing it back would make two of it. */
const bringBackFromBin = async ({
  paths,
  manifest,
  outputDir,
  trashDir = getTrashDir()
}: {
  paths: string[]
  manifest: Manifest
  outputDir: string
  trashDir?: string
}) => {
  const bin = fs.realpathSync(trashDir)
  const inBin = (file: string) => {
    try {
      return fs.realpathSync(file).startsWith(`${bin}${path.sep}`) && fs.statSync(file).isFile()
    } catch {
      return false
    }
  }
  const strangers = paths.filter((file) => !inBin(file))
  if (strangers.length > 0)
    throw new Error(
      `Nothing was brought back: ${strangers.map((f) => path.basename(f)).join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not in the bin.`
    )
  const known = new Set(manifest.files.flatMap((f) => (f.id ? [f.id] : [])))
  const times = cameraTimes(paths)
  const back: string[] = []
  const kept: string[] = []
  for (const file of paths) {
    if (known.has(await computeFileId(file))) {
      kept.push(path.basename(file))
      continue
    }
    const shot = times.get(file) ?? Math.floor(fs.statSync(file).mtimeMs / 1000)
    const day = path.join(outputDir, 'original_files', dayFolder(shot))
    fs.mkdirSync(day, { recursive: true })
    await moveFile(file, path.join(day, freeName(day, path.basename(file))))
    back.push(path.basename(file))
  }
  return { back, kept }
}

export { bringBackFromBin, listBin }
