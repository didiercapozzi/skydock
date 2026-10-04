import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { MEDIA_EXTENSIONS_SET } from './constants'
import { counted } from './lib/counted'
import { gentleWriter } from './lib/gentle'
import { landingFor } from './copy'
import { dropRow } from './dropJobs'
import { copyBegins } from './lib/quiet'
import { loadManifest, saveManifest } from './manifest'
import { shotTimes } from './scan'
import { copyFiles, moveFiles, shotTimesFor } from './moveFiles'
import { frozenMontages, isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile } from './types'
import { getExtension } from './utils'
import { isMontage } from './filed'
import { passengerOf } from './workspace'

/* A file dragged in from the computer — a clip off a phone, a photo someone sent — joins the board the
   way a camera's file does: copied into original_files under the day it was taken, keeping its own
   name, and written into the registry. Nothing more elaborate than a copy: the browser hands over the
   bytes, and this machine writes them where a scan would have found them.

   Where it goes is where it was dropped: into a montage, as a lone file of a dropzone, or loose in the
   sorting area. */

/* which drop a file is of, and which of its rows */
type ImportDrop = { batch: string; key: string }

type ImportTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'destination'; name: string }
  | { kind: 'sort' }

/* Added, moved there from somewhere else on the board, taken into a jump while staying in the one it
   was already in, already exactly there, or kept where it is for a reason — the board says which. */
type ImportResult =
  | { filename: string; outcome: 'added' }
  | { filename: string; outcome: 'moved'; from: string }
  | { filename: string; outcome: 'copied'; stays: string }
  | { filename: string; outcome: 'there' }
  | { filename: string; outcome: 'kept'; reason: string }

/* An original that has just landed, as the registry knows it: where it is, what it weighs, when it
   was shot, and what it contains. The same whether it was dropped in or copied off a camera. */
const originalEntry = (dest: string, id: string, mtime: number) => ({
  path: dest,
  size: fs.statSync(dest).size,
  mtime,
  filename: path.basename(dest),
  id
})

/* where a file is, in the words the board uses for places */
const placeOf = (manifest: Manifest, id: string) => {
  const group = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  if (group) {
    if (isNamedMontage(group)) return passengerOf(group)
    return group.destination ?? (isMontage(group) ? 'a montage' : 'Fresh files')
  }
  return manifest.files.find((f) => f.id === id)?.destination ?? 'Fresh files'
}

/* The same footage, dropped in again — the bytes are matched, whatever the file is called this time.
   What that means depends on where it lands.

   Dropped on a jump while it is already in another one, it joins this jump too and stays in that
   one: the same clip belongs to several jumps often enough to be ordinary — a briefing filmed once
   with every passenger of the day belongs to all of their films — and a jump holds it as its own,
   with its own trim, off the one original on the disk (RULES, Jumps). Which is also why an edit
   somewhere else is no obstacle: nothing about that jump changes.

   Dropped anywhere else — a dropzone, the sorting area — it is a file on its own rather than a
   jump's, so it moves there, as a drag on the board would have moved it. */
const placeExisting = async (
  manifest: Manifest,
  outputDir: string,
  file: ManifestFile,
  target: ImportTarget
): Promise<ImportResult> => {
  const id = file.id!
  const inGroup = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  /* a jump holds this footage whether as the file itself or as a copy of it, and both are the same
     path on the disk */
  const holds = (group: { files: { path: string }[] }) =>
    group.files.some((f) => f.path === file.path)
  const joining =
    target.kind === 'group' ? manifest.groups.find((g) => g.id === target.groupId) : undefined
  const there =
    target.kind === 'group'
      ? joining !== undefined && holds(joining)
      : !inGroup &&
        (target.kind === 'sort' ? !file.destination : file.destination === target.name.trim())
  if (there) return { filename: file.filename, outcome: 'there' }
  if (file.freed)
    return { filename: file.filename, outcome: 'kept', reason: 'it lives on the storage only' }
  if (joining && inGroup) {
    const stays = placeOf(manifest, id)
    copyFiles(manifest, new Set([id]), joining.id)
    return { filename: file.filename, outcome: 'copied', stays }
  }
  /* The sorting area and a place are for a file on its own, so landing there means leaving the jump
     it is in — which an edit forbids. Saying only that leaves somebody stuck: what they were after is
     almost always this footage in another jump, and that is one drop away. */
  if (inGroup && frozenMontages(manifest, outputDir).has(inGroup.id))
    return {
      filename: file.filename,
      outcome: 'kept',
      reason: `${placeOf(manifest, id)}’s montage has an edit, so nothing leaves it — drop it on a jump to put it in that jump as well`
    }
  const from = placeOf(manifest, id)
  const to =
    target.kind === 'group'
      ? { targetGroupId: target.groupId }
      : { destination: target.kind === 'destination' ? target.name.trim() : null }
  moveFiles(manifest, new Set([id]), {
    ...to,
    shot: await shotTimesFor(manifest, new Set([id]), to)
  })
  return { filename: file.filename, outcome: 'moved', from }
}

/* How far through one file's bytes we are, said as they go by rather than asked for afterwards, counted
   and hashed on the way (lib/counted). Without a drop to say it to, nobody is watching, and a copy nobody
   is watching costs nothing to run. */
const counting = (drop: ImportDrop | undefined, total: number) => {
  const tell = (part: number, phase?: string) => {
    if (drop && total > 0)
      dropRow(drop.batch, {
        key: drop.key,
        at: 'now',
        part: Math.min(1, part),
        ...(phase ? { phase } : {})
      })
  }
  const bytes = counted((done) => tell(done / total))
  return {
    through: bytes.through,
    /* said before the first byte is read: a file on a slow or far disk can take a while to give one, and
       the board then shows the copy as begun rather than nothing at all */
    begun: () => tell(0),
    id: bytes.id,
    /* The copy is over and the reading of it has begun: still something happening, and the board is
       told which, so a full bar is never a bar with nothing behind it. */
    reading: () => tell(1, 'reading')
  }
}

const importFile = async ({
  outputDir,
  filename: asked,
  lastModified,
  body,
  target,
  drop,
  size
}: {
  outputDir: string
  filename: string
  /* the file's own date as the computer knows it, in ms — what it falls back on without EXIF */
  lastModified: number
  body: Readable
  target: ImportTarget
  /* which drop this file is of, and which of its rows it is, chosen before anything was sent: a file has
     no id here until its bytes have landed and been read */
  drop?: ImportDrop
  /* how big it is, as the page or the machine already knew — nothing is said without it */
  size?: number
}): Promise<ImportResult> => {
  /* only a name, never a path, and only what SkyDock can show and deliver */
  const filename = path.basename(asked.replace(/\\/g, '/')).trim()
  if (!filename || filename.startsWith('.') || !MEDIA_EXTENSIONS_SET.has(getExtension(filename)))
    throw new Error(`${asked} is not a video or a photo SkyDock knows.`)
  /* a lone file belongs to a place, and a place has a name */
  if (target.kind === 'destination' && !target.name.trim())
    throw new Error('Drop it on a dropzone, a montage or the sorting area.')

  const manifestPath = path.join(outputDir, 'manifest.json')
  const checkTarget = () => {
    const manifest = loadManifest(manifestPath)
    if (!manifest) throw new Error('No manifest found. Run a scan first.')
    if (target.kind === 'group') {
      const group = manifest.groups.find((g) => g.id === target.groupId)
      if (!group) throw new Error('That jump is no longer there.')
      if (frozenMontages(manifest, outputDir).has(group.id))
        throw new Error(
          'This montage has an edit, or lives on the storage only — nothing can join it.'
        )
    }
    return manifest
  }
  /* refused before a byte is written, when it can be told already */
  checkTarget()

  /* received beside the originals, then moved into place once it is whole */
  const incoming = path.join(outputDir, '.incoming')
  fs.mkdirSync(incoming, { recursive: true })
  const partial = path.join(incoming, `${crypto.randomBytes(8).toString('hex')}-${filename}`)
  const counted = counting(drop, size ?? 0)
  const copyEnds = copyBegins()
  try {
    counted.begun()
    await pipeline(body, counted.through, gentleWriter(partial))
    counted.reading()
    const when = new Date(
      Number.isFinite(lastModified) && lastModified > 0 ? lastModified : Date.now()
    )
    fs.utimesSync(partial, when, when)

    const id = counted.id()
    /* the manifest as it is now — receiving a clip takes a while */
    const manifest = checkTarget()
    const existing = manifest.files.find((f) => f.id === id)
    if (existing) {
      fs.rmSync(partial, { force: true })
      const result = await placeExisting(manifest, outputDir, existing, target)
      if (result.outcome === 'moved' || result.outcome === 'copied')
        saveManifest(manifestPath, manifest)
      return result
    }

    const mtime = (await shotTimes([partial])).get(partial) ?? Math.floor(when.getTime() / 1000)
    const dest = landingFor(outputDir, filename, mtime)
    fs.renameSync(partial, dest)

    const file: ManifestFile = {
      ...originalEntry(dest, id, mtime),
      ...(target.kind === 'destination' ? { destination: target.name.trim() } : {})
    }
    manifest.files.push(file)
    if (target.kind === 'group') {
      const group = manifest.groups.find((g) => g.id === target.groupId)!
      group.files = [...group.files, { ...file, destination: undefined }].sort(
        (a, b) => a.mtime - b.mtime
      )
      /* something new in it has not been processed */
      group.processed = undefined
    }
    saveManifest(manifestPath, manifest)
    return { filename: file.filename, outcome: 'added' }
  } finally {
    copyEnds()
    fs.rmSync(partial, { force: true })
    /* the holding folder is only there while a file is arriving; one another arrival is using, or
       has already removed, is left alone */
    try {
      if (fs.readdirSync(incoming).length === 0) fs.rmdirSync(incoming)
    } catch {}
  }
}

export { importFile, originalEntry }
export type { ImportDrop, ImportTarget }
