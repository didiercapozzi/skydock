import * as fs from 'node:fs'
import * as path from 'node:path'
import type { BinBatch, BinFile } from './binEntry'
import { isMediaName } from './constants'
import { computeFileId } from './fileId'
import { landingFor } from './copy'
import { moveFile, mtimeOf } from './lib/fs'
import { cameraTimes } from './scan'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

const STAMP = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/
const putAsideAt = (folder: string, dir: string) => {
  const m = STAMP.exec(folder)
  if (m) {
    const [, y, mo, d, h, mi, s, ms] = m.map(Number) as number[]
    return Math.floor(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!) / 1000)
  }
  return mtimeOf(dir)
}

const namedIn = (folder: string, prefix: string) =>
  folder.replace(STAMP, '').replace(/-$/, '').slice(prefix.length)
const fromOf = (folder: string) =>
  folder.startsWith('unsorted-')
    ? { from: 'fresh' as const }
    : folder.startsWith('montage-')
      ? { from: 'montage' as const, montage: namedIn(folder, 'montage-') }
      : folder.startsWith('dropzone-')
        ? { from: 'dropzone' as const, dropzone: namedIn(folder, 'dropzone-') }
        : folder.startsWith('camera-')
          ? {
              from: 'camera' as const,
              camera: namedIn(folder, 'camera-')
            }
          : { from: 'other' as const }

const filesUnder = (dir: string): BinFile[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(at)
    if (!entry.isFile() || !isMediaName(entry.name)) return []
    const stat = fs.statSync(at)
    return [{ path: at, name: entry.name, size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }]
  })

const listBin = (trashDir = getTrashDir()): BinBatch[] => {
  if (!fs.existsSync(trashDir)) return []
  return fs
    .readdirSync(trashDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = path.join(trashDir, entry.name)
      const files = filesUnder(dir).sort(
        (a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name)
      )
      if (files.length === 0) return []
      return [{ folder: entry.name, ...fromOf(entry.name), at: putAsideAt(entry.name, dir), files }]
    })
    .sort((a, b) => b.at - a.at)
}

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
    const shot = times.get(file) ?? mtimeOf(file)
    await moveFile(file, landingFor(outputDir, path.basename(file), shot))
    back.push(path.basename(file))
  }
  return { back, kept }
}

export { bringBackFromBin, listBin }
