import * as fs from 'node:fs'
import { mkdir, rename, rm, utimes } from 'node:fs/promises'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
import { two } from './lib/clock'
import { counted } from './lib/counted'
import { gentleWriter } from './lib/gentle'
import { findMediaFilesAsync, pathExists, sameBytes } from './lib/fs'
import { inJob } from './live'
import { loadManifestAsync } from './manifest'
import { shotTimes } from './scan'
import type { Manifest, ManifestFile } from './types'
import { getManifestPath, getOutputDir, isCliModule, mapWithLimit, sizeOf } from './utils'

type CopyOptions = {
  cameraDirs: string[]
  outputDir?: string
}

type CopyItem = { name: string; size: number }
type CopyProgress = {
  done: number
  total: number
  copied: number
  skipped: number
  files?: CopyItem[]
  last?: 'copied' | 'skipped' | 'failed'
  unreadable?: string[]
  part?: number
}

type Copied = { dest: string; id: string; shot: number }

const dayFolder = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

const dayDir = (outputDir: string, shot: number) =>
  path.join(outputDir, 'original_files', dayFolder(shot))

const originalsDay = async (outputDir: string, shot: number) => {
  const dir = dayDir(outputDir, shot)
  await mkdir(dir, { recursive: true })
  return dir
}

const landingFor = async (outputDir: string, name: string, shot: number) => {
  const dir = await originalsDay(outputDir, shot)
  return path.join(dir, await freeName(dir, name))
}

const isNameFor = (candidate: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  const numbered = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)${ext.replace('.', '\\.')}$`
  )
  return candidate === name || numbered.test(candidate)
}

const namesIn = (dir: string) => fs.promises.readdir(dir).catch(() => [] as string[])

const withoutNumber = (name: string) => {
  const { name: stem, ext } = path.parse(name)
  return `${stem.replace(/_\d+$/, '')}${ext}`
}

const copiesIndex = async (outputDir: string) => {
  const root = path.join(outputDir, 'original_files')
  const days = (await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
  const names = new Map<string, string[]>()
  const holding = new Map<string, Set<string>>()
  await mapWithLimit(days, 8, async (dir) => {
    const list = await namesIn(dir)
    names.set(dir, list)
    for (const name of list)
      for (const key of new Set([name, withoutNumber(name)])) {
        const dirs = holding.get(key) ?? new Set<string>()
        dirs.add(dir)
        holding.set(key, dirs)
      }
  })
  return {
    dirsFor: (name: string) => [...(holding.get(name) ?? [])],
    namesIn: async (dir: string) => names.get(dir) ?? []
  }
}

type CopiesIndex = Awaited<ReturnType<typeof copiesIndex>>

const alreadyAnywhere = async (src: string, srcStat: fs.Stats, index: CopiesIndex) => {
  for (const dir of index.dirsFor(path.basename(src))) {
    const there = await alreadyThere(src, srcStat, dir, index.namesIn)
    if (there) return there
  }
  return null
}

const alreadyThere = async (
  src: string,
  srcStat: fs.Stats,
  dir: string,
  listed: (dir: string) => Promise<string[]> = namesIn
) => {
  const base = path.basename(src)
  const there = await listed(dir)
  for (const name of [base, ...there.filter((n) => n !== base && isNameFor(n, base))]) {
    const existing = path.join(dir, name)
    let stat: fs.Stats
    try {
      stat = await fs.promises.stat(existing)
    } catch {
      continue
    }
    if (stat.size !== srcStat.size) continue
    if (Math.floor(stat.mtimeMs / 1000) === Math.floor(srcStat.mtimeMs / 1000)) return existing
    if (await sameBytes(src, existing)) return existing
  }
  return null
}

const givenBack = (files: ManifestFile[], name: string, size: number) =>
  files.some((f) => f.freed && f.size === size && isNameFor(f.filename, name))

const folderIndex = (board: ManifestFile[]) => {
  const found = new Map<string, ManifestFile[]>()
  return (dir: string) => {
    const key = path.resolve(dir)
    const held = found.get(key) ?? board.filter((f) => path.resolve(path.dirname(f.path)) === key)
    found.set(key, held)
    return held
  }
}

const freedAlready = (
  inFolder: (dir: string) => ManifestFile[],
  src: string,
  srcStat: fs.Stats,
  dir: string
) => givenBack(inFolder(dir), path.basename(src), srcStat.size)

const freedOnItsDay = async (
  inFolder: (dir: string) => ManifestFile[],
  board: ManifestFile[],
  src: string,
  srcStat: fs.Stats,
  outputDir: string
) => {
  if (!givenBack(board, path.basename(src), srcStat.size)) return false
  const shot = (await shotTimes([src])).get(src) ?? Math.floor(srcStat.mtimeMs / 1000)
  return freedAlready(inFolder, src, srcStat, dayDir(outputDir, shot))
}

const loadBoard = async (outputDir: string) => {
  try {
    return await loadManifestAsync(getManifestPath(outputDir))
  } catch {
    return null
  }
}

const freeName = async (dir: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  if (!(await pathExists(path.join(dir, name)))) return name
  for (let n = 2; ; n++)
    if (!(await pathExists(path.join(dir, `${stem}_${n}${ext}`)))) return `${stem}_${n}${ext}`
}

class CameraGone extends Error {}

class CopyStopped extends Error {}

const copyOne = async (
  src: string,
  srcStat: fs.Stats,
  destDir: string,
  onPart?: (part: number) => void
) => {
  const dest = path.join(destDir, await freeName(destDir, path.basename(src)))
  const partial = `${dest}.part`
  const bytes = counted((done) => onPart?.(srcStat.size > 0 ? Math.min(1, done / srcStat.size) : 0))
  try {
    await streams.pipeline(
      fs.createReadStream(src, { highWaterMark: 16 * 1024 ** 2 }),
      bytes.through,
      gentleWriter(partial)
    )
    await utimes(partial, srcStat.atime, srcStat.mtime)
    await rename(partial, dest)
  } catch (e) {
    await rm(partial, { force: true })
    if (!(await pathExists(src)))
      throw new CameraGone('The camera was disconnected during the copy.')
    throw e
  }
  return { dest, id: bytes.id() }
}

const copyCamera = async ({
  cameraDir,
  outputDir = getOutputDir(),
  manifest,
  onProgress,
  onCopied,
  stop,
  only
}: {
  cameraDir: string
  only?: ReadonlySet<string>
  outputDir?: string
  manifest?: Manifest | null
  stop?: AbortSignal
  onProgress?: (progress: CopyProgress) => void
  onCopied?: (copied: Copied) => Promise<void> | void
}) => {
  const files = (await findMediaFilesAsync(cameraDir)).filter((file) => !only || only.has(file))
  const known = manifest === undefined ? await loadBoard(outputDir) : manifest
  const board = known
    ? [...known.files, ...known.groups.flatMap((g) => g.files)]
    : ([] as ManifestFile[])
  const inFolder = folderIndex(board)
  const index = await copiesIndex(outputDir)
  const hereAlready = async (src: string, srcStat: fs.Stats) =>
    (await freedOnItsDay(inFolder, board, src, srcStat, outputDir)) ||
    (await alreadyAnywhere(src, srcStat, index))
  const pending: string[] = []
  for (const src of files) {
    const srcStat = await fs.promises.stat(src).catch(() => null)
    if (!srcStat || !(await hereAlready(src, srcStat))) pending.push(src)
  }
  const shots = await shotTimes(pending)
  const progress: CopyProgress = { done: 0, total: files.length, copied: 0, skipped: 0 }
  onProgress?.({
    ...progress,
    files: await mapWithLimit(files, 16, async (file) => ({
      name: path.basename(file),
      size: await sizeOf(file)
    }))
  })

  for (const src of files) {
    if (stop?.aborted) throw new CopyStopped('Stopped when asked.')
    let srcStat: fs.Stats
    try {
      srcStat = await fs.promises.stat(src)
    } catch {
      throw new CameraGone('The camera was disconnected during the copy.')
    }
    const shot = shots.get(src) ?? Math.floor(srcStat.mtimeMs / 1000)
    let last: 'copied' | 'skipped' | 'failed' = 'skipped'
    try {
      if (await hereAlready(src, srcStat)) progress.skipped++
      else {
        const destDir = await originalsDay(outputDir, shot)
        const copied = await copyOne(src, srcStat, destDir, (part) =>
          onProgress?.({ ...progress, part })
        )
        progress.copied++
        last = 'copied'
        await onCopied?.({ ...copied, shot })
      }
    } catch (e) {
      if (e instanceof CameraGone || e instanceof CopyStopped) throw e
      progress.unreadable = [...(progress.unreadable ?? []), path.basename(src)]
      last = 'failed'
    }
    progress.done++
    onProgress?.({ ...progress, last })
  }
  return progress
}

const copyBack = async ({
  paths,
  outputDir = getOutputDir(),
  onProgress
}: {
  paths: string[]
  outputDir?: string
  onProgress?: (progress: CopyProgress) => void
}) => {
  return inJob({ type: 'copy-back', label: '', total: paths.length }, async (copying) => {
    const shots = await shotTimes(paths)
    const progress: CopyProgress = { done: 0, total: paths.length, copied: 0, skipped: 0 }
    onProgress?.({ ...progress })
    for (const src of paths) {
      copying.working(path.basename(src))
      let srcStat: fs.Stats
      try {
        srcStat = await fs.promises.stat(src)
      } catch {
        throw new CameraGone('The camera was disconnected during the copy.')
      }
      const destDir = await originalsDay(
        outputDir,
        shots.get(src) ?? Math.floor(srcStat.mtimeMs / 1000)
      )
      if (await alreadyThere(src, srcStat, destDir)) progress.skipped++
      else {
        await copyOne(src, srcStat, destDir)
        progress.copied++
      }
      progress.done++
      copying.step()
      onProgress?.({ ...progress })
    }
    return progress
  })
}

const copyFromCameras = async (options: CopyOptions) => {
  let copied = 0
  let skipped = 0
  for (const cameraDir of options.cameraDirs) {
    if (!(await pathExists(cameraDir))) continue
    const result = await copyCamera({ cameraDir, outputDir: options.outputDir })
    copied += result.copied
    skipped += result.skipped
  }
  console.log(`[Done] Copied: ${copied}, Skipped (existing): ${skipped}`)
  return { copied, skipped }
}

const cliMain = async () => {
  const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const cameraDirs = (
    await mapWithLimit(asked, 16, async (a) => ((await pathExists(a)) ? a : ''))
  ).filter(Boolean)
  if (cameraDirs.length === 0) {
    console.error('Usage: skydock-copy <camera_dir> [camera_dir ...]')
    process.exit(1)
  }
  await copyFromCameras({ cameraDirs })
}

if (isCliModule('copy')) void cliMain()

export {
  givenBack,
  CameraGone,
  CopyStopped,
  alreadyThere,
  alreadyAnywhere,
  copiesIndex,
  copyBack,
  copyCamera,
  landingFor,
  folderIndex,
  freedAlready,
  freedOnItsDay,
  isNameFor,
  withoutNumber,
  loadBoard,
  namesIn
}
export type { Copied, CopyProgress }
