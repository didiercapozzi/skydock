import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { MEDIA_EXTENSIONS_SET } from './constants'
import { counted } from './lib/counted'
import { landingFor } from './copy'
import { publish } from './live'
import { loadManifest, saveManifest } from './manifest'
import { cameraTimes } from './scan'
import { copyFiles, moveFiles } from './moveFiles'
import { frozenMontages, isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile } from './types'
import { getExtension } from './utils'
import { isMontage } from './filed'
import { passengerOf } from './workspace'

type ImportTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'destination'; name: string }
  | { kind: 'sort' }

type ImportResult =
  | { filename: string; outcome: 'added' }
  | { filename: string; outcome: 'moved'; from: string }
  | { filename: string; outcome: 'copied'; stays: string }
  | { filename: string; outcome: 'there' }
  | { filename: string; outcome: 'kept'; reason: string }

const originalEntry = (dest: string, id: string, mtime: number) => ({
  path: dest,
  size: fs.statSync(dest).size,
  mtime,
  filename: path.basename(dest),
  id
})

const placeOf = (manifest: Manifest, id: string) => {
  const group = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  if (group) {
    if (isNamedMontage(group)) return passengerOf(group)
    return group.destination ?? (isMontage(group) ? 'a montage' : 'Fresh files')
  }
  return manifest.files.find((f) => f.id === id)?.destination ?? 'Fresh files'
}

const placeExisting = (
  manifest: Manifest,
  outputDir: string,
  file: ManifestFile,
  target: ImportTarget
): ImportResult => {
  const id = file.id!
  const inGroup = manifest.groups.find((g) => g.files.some((f) => f.id === id))
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
  if (inGroup && frozenMontages(manifest, outputDir).has(inGroup.id))
    return {
      filename: file.filename,
      outcome: 'kept',
      reason: `${placeOf(manifest, id)}’s montage has an edit, so nothing leaves it — drop it on a jump to put it in that jump as well`
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

const counting = (token: string | undefined, total: number) => {
  let over = false
  const tell = (done: number, phase: 'copying' | 'reading' | 'done') => {
    if (token) publish({ kind: 'import', token, done, total, phase })
  }
  const bytes = counted((done) => tell(done, 'copying'))
  return {
    through: bytes.through,
    id: bytes.id,
    reading: () => tell(total, 'reading'),
    ended: () => {
      if (over) return
      over = true
      tell(total, 'done')
    }
  }
}

const importFile = async ({
  outputDir,
  filename: asked,
  lastModified,
  body,
  target,
  token,
  size
}: {
  outputDir: string
  filename: string
  lastModified: number
  body: Readable
  target: ImportTarget
  token?: string
  size?: number
}): Promise<ImportResult> => {
  const filename = path.basename(asked.replace(/\\/g, '/')).trim()
  if (!filename || filename.startsWith('.') || !MEDIA_EXTENSIONS_SET.has(getExtension(filename)))
    throw new Error(`${asked} is not a video or a photo SkyDock knows.`)
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
  checkTarget()

  const incoming = path.join(outputDir, '.incoming')
  fs.mkdirSync(incoming, { recursive: true })
  const partial = path.join(incoming, `${crypto.randomBytes(8).toString('hex')}-${filename}`)
  const counted = counting(size && size > 0 ? token : undefined, size ?? 0)
  try {
    await pipeline(body, counted.through, fs.createWriteStream(partial))
    counted.reading()
    const when = new Date(
      Number.isFinite(lastModified) && lastModified > 0 ? lastModified : Date.now()
    )
    fs.utimesSync(partial, when, when)

    const id = counted.id()
    const manifest = checkTarget()
    const existing = manifest.files.find((f) => f.id === id)
    if (existing) {
      fs.rmSync(partial, { force: true })
      const result = placeExisting(manifest, outputDir, existing, target)
      if (result.outcome === 'moved' || result.outcome === 'copied')
        saveManifest(manifestPath, manifest)
      return result
    }

    const mtime = cameraTimes([partial]).get(partial) ?? Math.floor(when.getTime() / 1000)
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
      group.processed = undefined
    }
    saveManifest(manifestPath, manifest)
    return { filename: file.filename, outcome: 'added' }
  } finally {
    counted.ended()
    fs.rmSync(partial, { force: true })
    try {
      if (fs.readdirSync(incoming).length === 0) fs.rmdirSync(incoming)
    } catch {}
  }
}

export { importFile, originalEntry }
export type { ImportTarget }
