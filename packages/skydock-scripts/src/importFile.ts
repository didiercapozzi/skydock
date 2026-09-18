import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { MEDIA_EXTENSIONS_SET } from './constants'
import { computeFileId } from './fileId'
import { loadManifest, saveManifest } from './manifest'
import { cameraTimes } from './scan'
import { moveFiles } from './moveFiles'
import { frozenTandems, isTandem } from './tandem'
import type { Manifest, ManifestFile } from './types'
import { getExtension } from './utils'

/* A file dragged in from the computer — a clip off a phone, a photo someone sent — joins the board the
   way a camera's file does: copied into original_files under the day it was taken, keeping its own
   name, and written into the registry. Nothing more elaborate than a copy: the browser hands over the
   bytes, and this machine writes them where a scan would have found them.

   Where it goes is where it was dropped: into a tandem, as a lone file of a dropzone, or loose in the
   sorting area. */

type ImportTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'destination'; name: string }
  | { kind: 'sort' }

/* Added, moved there from somewhere else on the board, already exactly there, or kept where it is
   for a reason — the board says which. */
type ImportResult =
  | { filename: string; outcome: 'added' }
  | { filename: string; outcome: 'moved'; from: string }
  | { filename: string; outcome: 'there' }
  | { filename: string; outcome: 'kept'; reason: string }

const pad = (n: number) => String(n).padStart(2, '0')

/* the folder a scan files it under: the local calendar day it was taken */
const dayFolder = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* its own name, unless that name is already taken in that day by different bytes */
const freeName = (dir: string, filename: string) => {
  const ext = path.extname(filename)
  const stem = path.basename(filename, ext)
  let candidate = filename
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n++) candidate = `${stem}_${n}${ext}`
  return candidate
}

/* where a file is, in the words the board uses for places */
const placeOf = (manifest: Manifest, id: string) => {
  const group = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  if (group) {
    if (isTandem(group) && group.passenger)
      return `${group.passenger.firstname} ${group.passenger.lastname}`.trim()
    return group.destination ?? 'Unsorted jumps'
  }
  return manifest.files.find((f) => f.id === id)?.destination ?? 'Unsorted jumps'
}

/* A file already on the board, dropped in again: it is moved to where it was dropped this time, as
   if it had been dragged there on the board — a file is in one place at a time, and a second drop
   means "here", not "twice". */
const moveExisting = (
  manifest: Manifest,
  outputDir: string,
  file: ManifestFile,
  target: ImportTarget
): ImportResult => {
  const id = file.id!
  const inGroup = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  const there =
    target.kind === 'group'
      ? inGroup?.id === target.groupId
      : !inGroup &&
        (target.kind === 'sort' ? !file.destination : file.destination === target.name.trim())
  if (there) return { filename: file.filename, outcome: 'there' }
  if (file.freed)
    return { filename: file.filename, outcome: 'kept', reason: 'it lives on the storage only' }
  if (inGroup && frozenTandems(manifest, outputDir).has(inGroup.id))
    return {
      filename: file.filename,
      outcome: 'kept',
      reason: `it is in ${placeOf(manifest, id)}’s tandem, which has an edit`
    }
  const from = placeOf(manifest, id)
  moveFiles(
    manifest,
    new Set([id]),
    target.kind === 'group'
      ? { targetGroupId: target.groupId }
      : { destination: target.kind === 'destination' ? target.name.trim() : null }
  )
  return { filename: file.filename, outcome: 'moved', from }
}

const importFile = async ({
  outputDir,
  filename: asked,
  lastModified,
  body,
  target
}: {
  outputDir: string
  filename: string
  /* the file's own date as the computer knows it, in ms — what it falls back on without EXIF */
  lastModified: number
  body: Readable
  target: ImportTarget
}): Promise<ImportResult> => {
  /* only a name, never a path, and only what SkyDock can show and deliver */
  const filename = path.basename(asked.replace(/\\/g, '/')).trim()
  if (!filename || filename.startsWith('.') || !MEDIA_EXTENSIONS_SET.has(getExtension(filename)))
    throw new Error(`${asked} is not a video or a photo SkyDock knows.`)
  /* a lone file belongs to a place; Tandems is not one — a tandem file belongs to a passenger */
  if (target.kind === 'destination' && (!target.name.trim() || target.name.trim() === 'Tandems'))
    throw new Error('Drop it on a dropzone, a passenger or the sorting area.')

  const manifestPath = path.join(outputDir, 'manifest.json')
  const checkTarget = () => {
    const manifest = loadManifest(manifestPath)
    if (!manifest) throw new Error('No manifest found. Run a scan first.')
    if (target.kind === 'group') {
      const group = manifest.groups.find((g) => g.id === target.groupId)
      if (!group) throw new Error('That jump is no longer there.')
      if (frozenTandems(manifest, outputDir).has(group.id))
        throw new Error(
          'This tandem has an edit, or lives on the storage only — nothing can join it.'
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
  try {
    await pipeline(body, fs.createWriteStream(partial))
    const when = new Date(
      Number.isFinite(lastModified) && lastModified > 0 ? lastModified : Date.now()
    )
    fs.utimesSync(partial, when, when)

    const id = await computeFileId(partial)
    /* the manifest as it is now — receiving a clip takes a while */
    const manifest = checkTarget()
    const existing = manifest.files.find((f) => f.id === id)
    if (existing) {
      fs.rmSync(partial, { force: true })
      const result = moveExisting(manifest, outputDir, existing, target)
      if (result.outcome === 'moved') saveManifest(manifestPath, manifest)
      return result
    }

    const mtime = cameraTimes([partial]).get(partial) ?? Math.floor(when.getTime() / 1000)
    const dir = path.join(outputDir, 'original_files', dayFolder(mtime))
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, freeName(dir, filename))
    fs.renameSync(partial, dest)

    const file: ManifestFile = {
      path: dest,
      size: fs.statSync(dest).size,
      mtime,
      filename: path.basename(dest),
      id,
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
    fs.rmSync(partial, { force: true })
    /* the holding folder is only there while a file is arriving; one another arrival is using, or
       has already removed, is left alone */
    try {
      if (fs.readdirSync(incoming).length === 0) fs.rmdirSync(incoming)
    } catch {}
  }
}

export { importFile }
export type { ImportResult, ImportTarget }
