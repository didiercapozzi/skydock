import * as fs from 'node:fs'
import * as path from 'node:path'
import { readExifMap } from './lib/exif'
import { findMediaFiles, sameBytes } from './lib/fs'
import { getOutputDir, isCliModule } from './utils'

/* Copying off a camera, into the originals: every file into a folder named after the day it was
   shot, and never anything written back to the camera (RULES, The workflow). */

type CopyOptions = {
  cameraDirs: string[]
  outputDir?: string
}

/* how far a camera's copy has got, for whoever is watching it */
type CopyProgress = { done: number; total: number; copied: number; skipped: number }

const parseDate = (raw: string) => {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

const DATE_TAGS = { photoTags: ['-DateTimeOriginal'], videoTags: ['-CreateDate'], parse: parseDate }

const dayOfStat = (stat: fs.Stats) => {
  const date = new Date(stat.mtimeMs)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/* The names a file can have in its day's folder: its own, or its own with a number, which is what a
   second camera's clip of the same name was given. */
const namesFor = (dir: string, name: string) => {
  const { name: stem, ext } = path.parse(name)
  const numbered = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)${ext.replace('.', '\\.')}$`
  )
  const there = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return [name, ...there.filter((n) => numbered.test(n))]
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
    if (sameBytes(src, existing)) return existing
  }
  return null
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

/* One camera, copied without holding the thread. Each file is written under a temporary name and
   only given its own once it is whole, so a card pulled out half way leaves nothing behind that
   could be taken for an original; the copy then stops and says the camera went. */
const copyCamera = async ({
  cameraDir,
  outputDir = getOutputDir(),
  onProgress
}: {
  cameraDir: string
  outputDir?: string
  onProgress?: (progress: CopyProgress) => void
}) => {
  const originalDir = path.join(outputDir, 'original_files')
  const files = findMediaFiles(cameraDir)
  const days = await readExifMap(files, DATE_TAGS)
  const progress: CopyProgress = { done: 0, total: files.length, copied: 0, skipped: 0 }
  onProgress?.({ ...progress })

  for (const src of files) {
    let srcStat: fs.Stats
    try {
      srcStat = fs.statSync(src)
    } catch {
      throw new CameraGone('The camera was disconnected during the copy.')
    }
    const destDir = path.join(originalDir, days.get(src) ?? dayOfStat(srcStat))
    fs.mkdirSync(destDir, { recursive: true })
    if (await alreadyThere(src, srcStat, destDir)) progress.skipped++
    else {
      const dest = path.join(destDir, freeName(destDir, path.basename(src)))
      const partial = `${dest}.part`
      try {
        await fs.promises.copyFile(src, partial)
        fs.utimesSync(partial, srcStat.atime, srcStat.mtime)
        fs.renameSync(partial, dest)
      } catch (e) {
        fs.rmSync(partial, { force: true })
        if (!fs.existsSync(src))
          throw new CameraGone('The camera was disconnected during the copy.')
        throw e
      }
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
  const days = await readExifMap(files, DATE_TAGS)
  return new Map(
    files.map((file) => [
      file,
      path.join(outputDir, 'original_files', days.get(file) ?? dayOfStat(fs.statSync(file)))
    ])
  )
}

export { CameraGone, alreadyThere, copyCamera, copyFromCameras, dayFoldersOf }
export type { CopyOptions, CopyProgress }
