import * as fs from 'node:fs'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
import { two } from './lib/clock'
import { counted } from './lib/counted'
import { findMediaFiles, sameBytes } from './lib/fs'
import { loadManifest } from './manifest'
import { shotTimes } from './scan'
import type { Manifest, ManifestFile } from './types'
import { getManifestPath, getOutputDir, isCliModule } from './utils'

/* Copying off a camera, into the originals: every file into a folder named after the day it was
   shot, and never anything written back to the camera (RULES, The workflow). */

type CopyOptions = {
  cameraDirs: string[]
  outputDir?: string
}

/* how far a camera's copy has got, for whoever is watching it */
/* How far a copy off a card has got. The first report names every file on the card, so the board can
   list them before the first is copied; each after that says how the file it finished went. */
type CopyItem = { name: string; size: number }
type CopyProgress = {
  done: number
  total: number
  copied: number
  skipped: number
  files?: CopyItem[]
  last?: 'copied' | 'skipped' | 'failed'
  /* files the card would not give up — a read error, a name the disk refuses — passed over, named */
  unreadable?: string[]
  /* how far through the file being copied now, between 0 and 1, said as its bytes go by */
  part?: number
}

/* what a file copied off is known by, where it landed and when it was shot — for whoever puts it on
   the board */
type Copied = { dest: string; id: string; shot: number }

const sizeOf = (file: string) => {
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

/* the folder an original is filed under: the local calendar day it was shot */
const dayFolder = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/* The day folder an original lands in, made if it is not there yet — the one place every way into
   the originals files a file: copied off a camera, dropped in, brought back from the bin. */
const originalsDay = (outputDir: string, shot: number) => {
  const dir = path.join(outputDir, 'original_files', dayFolder(shot))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/* where a file of that name, shot then, lands among the originals — never over another */
const landingFor = (outputDir: string, name: string, shot: number) => {
  const dir = originalsDay(outputDir, shot)
  return path.join(dir, freeName(dir, name))
}

/* Whether a name in the originals is one this camera file could have been filed under: its own, or
   its own with a number, which is what a second camera's clip of the same name was given. */
const isNameFor = (candidate: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  const numbered = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)${ext.replace('.', '\\.')}$`
  )
  return candidate === name || numbered.test(candidate)
}

/* The names a file can have in its day's folder. */
const namesFor = (dir: string, name: string) => {
  const there = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return [name, ...there.filter((n) => n !== name && isNameFor(n, name))]
}

/* Where this file already is in the folder, under one of its names, or null. Same size and same time
   is the same file — a copy keeps the time of the file it was made from — and only a file that
   matches in size but not in time is read through to be sure. Plugging the same camera in again
   therefore reads almost nothing, where comparing every byte read the whole card again. */
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

/* A file this machine gave back is passed over like one that is here (RULES, The workflow). Freeing
   deletes the original once the storage is proved to hold it and keeps the record, so plugging the
   camera in again must not undo a choice already made.

   Read without touching the card: the day it belongs to, the name it would be filed under, its size.
   Not its time — the time kept for a file is the time it was shot, which may have been put right by
   hand since, while the card still holds the time it was written. */
/* a file this machine gave back, by the name it had and its size — wherever it was */
const givenBack = (files: ManifestFile[], name: string, size: number) =>
  files.some((f) => f.freed && f.size === size && isNameFor(f.filename, name))

const freedAlready = (board: ManifestFile[], src: string, srcStat: fs.Stats, dir: string) =>
  givenBack(
    board.filter((f) => path.resolve(path.dirname(f.path)) === path.resolve(dir)),
    path.basename(src),
    srcStat.size
  )

/* What the board knows, for the rule above. A jumps file that cannot be read stops a scan, on
   purpose; it must not stop a card being copied, since the bytes are what there is to lose. */
const loadBoard = (outputDir: string) => {
  try {
    return loadManifest(getManifestPath(outputDir))
  } catch {
    return null
  }
}

/* Where a file new to this folder goes: under its own name, or — when a different file already has
   that name, as the first clip of two cameras of the same make always does — under its name with the
   next free number. An original is never written over. */
const freeName = (dir: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  if (!fs.existsSync(path.join(dir, name))) return name
  for (let n = 2; ; n++)
    if (!fs.existsSync(path.join(dir, `${stem}_${n}${ext}`))) return `${stem}_${n}${ext}`
}

class CameraGone extends Error {}

/* the copy stopped because it was asked to, between one file and the next */
class CopyStopped extends Error {}

/* One file off a card into its day folder, written under a temporary name and given its own only
   once it is whole — so a card pulled out half way leaves nothing behind that could be taken for an
   original. Its own name, or its own with a number where that is taken by another file.

   Its bytes are counted and hashed as they go by (lib/counted), the same as a file dropped in: a long
   clip is watched filling rather than waited out, and what it will be known by costs no second
   read. */
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

/* One camera, copied without holding the thread. Each file is written under a temporary name and
   only given its own once it is whole, so a card pulled out half way leaves nothing behind that
   could be taken for an original; the copy then stops and says the camera went. */
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
  /* asked to stop: the file in hand is finished, whole, and nothing after it is begun */
  stop?: AbortSignal
  onProgress?: (progress: CopyProgress) => void
  /* each file as it lands, so the board can show it before the whole card is done */
  onCopied?: (copied: Copied) => Promise<void> | void
}) => {
  const files = findMediaFiles(cameraDir)
  const shots = await shotTimes(files)
  /* a file is in the registry and in its jump, and either may carry the mark */
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
    /* One file that will not come across — a read error, a folder or a name the disk refuses — does
       not stop the rest: it is passed over and named. A camera that has gone is another thing: then
       nothing more can come off it. */
    try {
      const destDir = originalsDay(outputDir, shot)
      /* the mark first: it asks nothing of the disk */
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

/* Asked for by name, and only then. A file this machine gave back is not copied off the card again
   by plugging it in — that is what freeing means, and the copy passes it over on purpose. This is
   the way back for one that is wanted here again: the mark is taken no notice of, and a file that
   is already on the disk is left alone rather than copied beside itself (RULES, Freeing space). */
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

/* the day folder each of a camera's files belongs in among the originals */
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
  copyFromCameras,
  dayFoldersOf,
  landingFor,
  freedAlready,
  isNameFor,
  loadBoard
}
export type { Copied, CopyProgress }
