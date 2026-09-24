import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isMediaName } from './constants'
import { CameraGone, DATE_TAGS, dayOfStat, freeName, isNameFor, loadBoard } from './copy'
import type { CopyProgress } from './copy'
import { kioReader } from './kio'
import type { KioFile, KioReader } from './kio'
import { readExifMap } from './lib/exif'
import { findMediaFiles, sameBytes } from './lib/fs'
import type { Manifest, ManifestFile } from './types'
import { getOutputDir } from './utils'

/* A camera read through KDE rather than as a drive (RULES, Copying a camera off).

   It is copied off by the same rules as a card — a folder per day, its own name or its own with a
   number, nothing written back — but there is no path to walk, so it is asked what it holds, one
   folder at a time, and each clip is fetched whole into a holding folder before it is dated and
   filed. The date comes from the copy here, not from the camera: reading it off the camera would be
   a question a clip, over the slowest link there is. */

/* Where a camera turns up in KDE: `mtp:/<device>/<store>`, the store being the one that holds DCIM.
   Everything else KDE can reach is none of SkyDock's business. */
const kioCameras = async (reader: KioReader | null) => {
  if (!reader) return []
  const found: string[] = []
  for (const device of await reader.ls('mtp:/'))
    for (const store of await reader.ls(`mtp:/${device}`))
      if ((await reader.ls(`mtp:/${device}/${store}`)).includes('DCIM'))
        found.push(`mtp:/${device}/${store}`)
  return found
}

const isKioCamera = (camera: string) => camera.startsWith('mtp:/')

/* What a camera read through KDE is called: its own name, the device, rather than its store's —
   `HERO5 Black`, not `GoPro MTP Client Disk Volume`. */
const kioCameraName = (camera: string) => camera.slice('mtp:/'.length).split('/')[0] ?? camera

/* Every video and photo under a folder of the camera, a folder at a time. A name with no extension
   is a folder; one with a media extension is a clip; anything else — the thumbnails and low-res
   copies a GoPro keeps beside each clip — is passed over without being opened. */
const clipsUnder = async (
  reader: KioReader,
  url: string,
  depth = 0
): Promise<{ url: string; name: string }[]> => {
  const found: { url: string; name: string }[] = []
  for (const name of await reader.ls(url)) {
    const child = `${url}/${name}`
    if (isMediaName(name)) found.push({ url: child, name })
    else if (!path.extname(name) && depth < 3)
      found.push(...(await clipsUnder(reader, child, depth + 1)))
  }
  return found
}

/* How many clips are asked about at once. Each question is a program of its own, so a few are
   started together; the camera itself answers one at a time, so more would only queue. */
const ASKED_AT_ONCE = 6

/* What a camera read through KDE was found to hold, clip by clip, as the copy went over it: how big
   and when, and which original here it is, if any. Asking the camera is the slow part — a card of
   sixteen hundred clips is minutes of questions answered one after another — so what the copy
   learnt is kept, and the camera's page is read from it rather than asking everything again. */
type SeenClip = {
  url: string
  name: string
  size: number
  mtime: number | null
  original: string | null
}

/* What is here already, read once for a whole camera rather than once a clip: every original by the
   name it was filed under, with its size and time. A clip filed as `GOPR0001_2.MP4` because another
   camera had the name first is found under `GOPR0001.MP4` too. */
const keyOf = (name: string) => {
  const { name: stem, ext } = path.parse(name)
  return `${stem.replace(/_\d+$/, '')}${ext}`.toLowerCase()
}

const hereAlready = (outputDir: string) => {
  const byKey = new Map<string, { path: string; size: number; mtime: number }[]>()
  const add = (file: string) => {
    const stat = fs.statSync(file)
    const key = keyOf(path.basename(file))
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      { path: file, size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }
    ])
  }
  const originals = path.join(outputDir, 'original_files')
  if (fs.existsSync(originals)) for (const file of findMediaFiles(originals)) add(file)
  const named = (name: string, size: number) =>
    (byKey.get(keyOf(name)) ?? []).filter(
      (here) => here.size === size && isNameFor(path.basename(here.path), name)
    )
  return {
    add,
    /* Same name and same size is the same clip, and the same time as well where the camera says
       one — a copy keeps the time of the clip it was made from. Two different clips of one name and
       one size, to the byte, do not happen on a camera. */
    find: (name: string, said: KioFile) =>
      named(name, said.size).find((here) => said.mtime === null || here.mtime === said.mtime)
        ?.path ?? null,
    named
  }
}

/* A clip this machine gave back is passed over like one that is here, as on a card — known by its
   name and its size, since which day it belongs to is only known once it has been fetched. */
const givenBack = (files: ManifestFile[], name: string, size: number) =>
  files.some((f) => f.freed && f.size === size && isNameFor(f.filename, name))

/* One camera read through KDE, copied off. Asked before each clip how big it is and when it was
   written, so a clip already here costs a question and not a copy: plugging the camera in again
   reads almost nothing. A clip the camera cannot say that of is fetched and compared here instead. */
const copyOverKio = async ({
  camera,
  reader,
  outputDir = getOutputDir(),
  manifest = loadBoard(outputDir),
  onProgress,
  onClip
}: {
  camera: string
  reader: KioReader
  outputDir?: string
  manifest?: Manifest | null
  onProgress?: (progress: CopyProgress) => void
  /* each clip as it is settled: here already, given back, or fetched just now */
  onClip?: (clip: SeenClip) => void
}) => {
  const clips = await clipsUnder(reader, `${camera}/DCIM`)
  const here = hereAlready(outputDir)
  const board = manifest ? [...manifest.files, ...manifest.groups.flatMap((g) => g.files)] : []
  const progress: CopyProgress = { done: 0, total: clips.length, copied: 0, skipped: 0 }
  onProgress?.({ ...progress })

  const incoming = path.join(outputDir, '.incoming')
  fs.mkdirSync(incoming, { recursive: true })
  try {
    for (let at = 0; at < clips.length; at += ASKED_AT_ONCE) {
      const batch = clips.slice(at, at + ASKED_AT_ONCE)
      const told = await Promise.all(batch.map((clip) => reader.stat(clip.url)))
      for (const [i, clip] of batch.entries()) {
        const said = told[i] ?? null
        const found = said ? here.find(clip.name, said) : null
        if (said && (found || givenBack(board, clip.name, said.size))) {
          progress.skipped++
          onClip?.({ ...clip, size: said.size, mtime: said.mtime, original: found })
        } else {
          const fetched = await fetchInto(reader, clip, said, incoming, outputDir, here)
          if (fetched.copied) progress.copied++
          else progress.skipped++
          onClip?.({
            ...clip,
            size: fetched.size,
            mtime: said?.mtime ?? null,
            original: fetched.at
          })
        }
        progress.done++
        onProgress?.({ ...progress })
      }
    }
  } finally {
    try {
      if (fs.readdirSync(incoming).length === 0) fs.rmdirSync(incoming)
    } catch {}
  }
  return progress
}

/* One clip fetched whole into the holding folder, then dated from its own bytes and filed under its
   day. A clip that turns out to be here already after all is let go of. A fetch that fails, or that
   brings back less than the camera said there was, leaves nothing behind and stops the copy: the
   camera has gone, or stopped answering, and what came before it is whole. */
const fetchInto = async (
  reader: KioReader,
  clip: { url: string; name: string },
  said: KioFile | null,
  incoming: string,
  outputDir: string,
  here: ReturnType<typeof hereAlready>
) => {
  const partial = path.join(incoming, `${crypto.randomBytes(6).toString('hex')}-${clip.name}`)
  const landed = await reader.copy(clip.url, partial)
  const size = landed && fs.existsSync(partial) ? fs.statSync(partial).size : -1
  if (!landed || size < 0 || (said && size !== said.size)) {
    fs.rmSync(partial, { force: true })
    throw new CameraGone('The camera stopped answering during the copy.')
  }
  if (said?.mtime) fs.utimesSync(partial, said.mtime, said.mtime)
  const twin = here.named(clip.name, size).find((one) => sameBytes(partial, one.path))
  if (twin) {
    fs.rmSync(partial, { force: true })
    return { copied: false, at: twin.path, size }
  }
  const day =
    (await readExifMap([partial], DATE_TAGS)).get(partial) ?? dayOfStat(fs.statSync(partial))
  const dir = path.join(outputDir, 'original_files', day)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, freeName(dir, clip.name))
  fs.renameSync(partial, dest)
  here.add(dest)
  return { copied: true, at: dest, size }
}

/* the cameras KDE can reach right now, through whatever reader this machine has */
const camerasThroughKde = async () => kioCameras(await kioReader())

export {
  camerasThroughKde,
  clipsUnder,
  copyOverKio,
  givenBack,
  hereAlready,
  isKioCamera,
  kioCameraName,
  kioCameras
}
export type { SeenClip }
