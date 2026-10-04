import * as fs from 'node:fs'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
import { two } from './lib/clock'
import { counted } from './lib/counted'
import { findMediaFiles, sameBytes } from './lib/fs'
import { loadManifest } from './manifest'
import { shotTimes } from './scan'
import type { Manifest, ManifestFile } from './types'
import { getManifestPath, getOutputDir, isCliModule, sizeOf } from './utils'

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

const originalsDay = (outputDir: string, shot: number) => {
  const dir = path.join(outputDir, 'original_files', dayFolder(shot))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const landingFor = (outputDir: string, name: string, shot: number) => {
  const dir = originalsDay(outputDir, shot)
  return path.join(dir, freeName(dir, name))
}

const isNameFor = (candidate: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  const numbered = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)${ext.replace('.', '\\.')}$`
  )
  return candidate === name || numbered.test(candidate)
}

const namesFor = (dir: string, name: string) => {
  const there = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return [name, ...there.filter((n) => n !== name && isNameFor(n, name))]
}

const alreadyThere = async (src: string, srcStat: fs.Stats, dir: string) => {
  for (const name of namesFor(dir, path.basename(src))) {
    const existing = path.join(dir, name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(existing)
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

const freedAlready = (board: ManifestFile[], src: string, srcStat: fs.Stats, dir: string) =>
  givenBack(
    board.filter((f) => path.resolve(path.dirname(f.path)) === path.resolve(dir)),
    path.basename(src),
    srcStat.size
  )

const loadBoard = (outputDir: string) => {
  try {
    return loadManifest(getManifestPath(outputDir))
  } catch {
    return null
  }
}

const freeName = (dir: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  if (!fs.existsSync(path.join(dir, name))) return name
  for (let n = 2; ; n++)
    if (!fs.existsSync(path.join(dir, `${stem}_${n}${ext}`))) return `${stem}_${n}${ext}`
}

class CameraGone extends Error {}

class CopyStopped extends Error {}

const copyOne = async (
  src: string,
  srcStat: fs.Stats,
  destDir: string,
  onPart?: (part: number) => void
) => {
  const dest = path.join(destDir, freeName(destDir, path.basename(src)))
  const partial = `${dest}.part`
  const bytes = counted((done) => onPart?.(srcStat.size > 0 ? Math.min(1, done / srcStat.size) : 0))
  try {
    await streams.pipeline(fs.createReadStream(src), bytes.through, fs.createWriteStream(partial))
    fs.utimesSync(partial, srcStat.atime, srcStat.mtime)
    fs.renameSync(partial, dest)
  } catch (e) {
    fs.rmSync(partial, { force: true })
    if (!fs.existsSync(src)) throw new CameraGone('The camera was disconnected during the copy.')
    throw e
  }
  return { dest, id: bytes.id() }
}

const copyCamera = async ({
  cameraDir,
  outputDir = getOutputDir(),
  manifest = loadBoard(outputDir),
  onProgress,
  onCopied,
  stop
}: {
  cameraDir: string
  outputDir?: string
  manifest?: Manifest | null
  stop?: AbortSignal
  onProgress?: (progress: CopyProgress) => void
  onCopied?: (copied: Copied) => Promise<void> | void
}) => {
  const files = findMediaFiles(cameraDir)
  const shots = await shotTimes(files)
  const board = manifest
    ? [...manifest.files, ...manifest.groups.flatMap((g) => g.files)]
    : ([] as ManifestFile[])
  const progress: CopyProgress = { done: 0, total: files.length, copied: 0, skipped: 0 }
  onProgress?.({
    ...progress,
    files: files.map((file) => ({ name: path.basename(file), size: sizeOf(file) }))
  })

  for (const src of files) {
    if (stop?.aborted) throw new CopyStopped('Stopped when asked.')
    let srcStat: fs.Stats
    try {
      srcStat = fs.statSync(src)
    } catch {
      throw new CameraGone('The camera was disconnected during the copy.')
    }
    const shot = shots.get(src) ?? Math.floor(srcStat.mtimeMs / 1000)
    let last: 'copied' | 'skipped' | 'failed' = 'skipped'
    try {
      const destDir = originalsDay(outputDir, shot)
      const there =
        freedAlready(board, src, srcStat, destDir) || (await alreadyThere(src, srcStat, destDir))
      if (there) progress.skipped++
      else {
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
  const shots = await shotTimes(paths)
  const progress: CopyProgress = { done: 0, total: paths.length, copied: 0, skipped: 0 }
  onProgress?.({ ...progress })
  for (const src of paths) {
    let srcStat: fs.Stats
    try {
      srcStat = fs.statSync(src)
    } catch {
      throw new CameraGone('The camera was disconnected during the copy.')
    }
    const destDir = originalsDay(outputDir, shots.get(src) ?? Math.floor(srcStat.mtimeMs / 1000))
    if (await alreadyThere(src, srcStat, destDir)) progress.skipped++
    else {
      await copyOne(src, srcStat, destDir)
      progress.copied++
    }
    progress.done++
    onProgress?.({ ...progress })
  }
  return progress
}

const copyFromCameras = async (options: CopyOptions) => {
  let copied = 0
  let skipped = 0
  for (const cameraDir of options.cameraDirs) {
    if (!fs.existsSync(cameraDir)) continue
    const result = await copyCamera({ cameraDir, outputDir: options.outputDir })
    copied += result.copied
    skipped += result.skipped
  }
  console.log(`[Done] Copied: ${copied}, Skipped (existing): ${skipped}`)
  return { copied, skipped }
}

if (isCliModule('copy')) {
  const cameraDirs = process.argv.slice(2).filter((a) => !a.startsWith('-') && fs.existsSync(a))
  if (cameraDirs.length === 0) {
    console.error('Usage: skydock-copy <camera_dir> [camera_dir ...]')
    process.exit(1)
  }
  void copyFromCameras({ cameraDirs })
}

const dayFoldersOf = async (files: string[], outputDir: string) => {
  const shots = await shotTimes(files)
  return new Map(
    files.map((file) => [
      file,
      path.join(outputDir, 'original_files', dayFolder(shots.get(file) ?? 0))
    ])
  )
}

export {
  givenBack,
  CameraGone,
  CopyStopped,
  alreadyThere,
  copyBack,
  copyCamera,
  dayFoldersOf,
  landingFor,
  freedAlready,
  isNameFor,
  loadBoard
}
export type { Copied, CopyProgress }
