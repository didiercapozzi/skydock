import { readdir, realpath, stat } from 'node:fs/promises'
import * as path from 'node:path'
import type { BinBatch, BinFile } from './binEntry'
import { isMediaName } from './constants'
import { computeFileId } from './fileId'
import { landingFor } from './copy'
import { moveFile, mtimeSeconds } from './lib/fs'
import { inJob } from './live'
import { shotTimes } from './scan'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

const mtimeOf = async (file: string) => mtimeSeconds(await stat(file))

const STAMP = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/
const putAsideAt = async (folder: string, dir: string) => {
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

const filesUnder = async (dir: string): Promise<BinFile[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = await Promise.all(
    entries.map(async (entry): Promise<BinFile[]> => {
      const at = path.join(dir, entry.name)
      if (entry.isDirectory()) return filesUnder(at)
      if (!entry.isFile() || !isMediaName(entry.name)) return []
      const { size, mtimeMs } = await stat(at)
      return [{ path: at, name: entry.name, size, mtime: Math.floor(mtimeMs / 1000) }]
    })
  )
  return found.flat()
}

const listBin = async (trashDir = getTrashDir()): Promise<BinBatch[]> => {
  const entries = await readdir(trashDir, { withFileTypes: true }).catch(() => [])
  const batches = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<BinBatch[]> => {
        const dir = path.join(trashDir, entry.name)
        const files = (await filesUnder(dir)).sort(
          (a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name)
        )
        if (files.length === 0) return []
        return [
          {
            folder: entry.name,
            ...fromOf(entry.name),
            at: await putAsideAt(entry.name, dir),
            files
          }
        ]
      })
  )
  return batches.flat().sort((a, b) => b.at - a.at)
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
  const bin = await realpath(trashDir)
  const inBin = async (file: string) => {
    try {
      return (await realpath(file)).startsWith(`${bin}${path.sep}`) && (await stat(file)).isFile()
    } catch {
      return false
    }
  }
  const inside = await Promise.all(paths.map(inBin))
  const strangers = paths.filter((_, at) => !inside[at])
  if (strangers.length > 0)
    throw new Error(
      `Nothing was brought back: ${strangers.map((f) => path.basename(f)).join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not in the bin.`
    )
  const known = new Set(manifest.files.flatMap((f) => (f.id ? [f.id] : [])))
  return inJob({ type: 'bin', label: '', total: paths.length }, async (bringing) => {
    const times = await shotTimes(paths)
    const back: string[] = []
    const kept: string[] = []
    for (const file of paths) {
      bringing.working(path.basename(file))
      if (known.has(await computeFileId(file))) kept.push(path.basename(file))
      else {
        const shot = times.get(file) ?? (await mtimeOf(file))
        await moveFile(file, landingFor(outputDir, path.basename(file), shot))
        back.push(path.basename(file))
      }
      bringing.step()
    }
    return { back, kept }
  })
}

export { bringBackFromBin, listBin }
