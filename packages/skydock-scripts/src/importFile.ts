import { mkdir, rename, rm, stat, utimes } from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { MEDIA_EXTENSIONS_SET } from './constants'
import { counted } from './lib/counted'
import { incomingPartial, removeIfEmpty } from './lib/fs'
import { restored } from './bringBack'
import { originalEntry } from './fileId'
import { gentleWriter } from './lib/gentle'
import { landingFor } from './copy'
import { dropRow } from './dropJobs'
import { copyBegins } from './lib/quiet'
import { loadManifestAsync, saveManifest } from './manifest'
import { shotTimes } from './scan'
import { copyFiles, moveFiles, shotTimesFor } from './moveFiles'
import { frozenMontages, isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile } from './types'
import { getExtension } from './utils'
import { isMontage } from './filed'
import { passengerOf } from './workspace'

type ImportDrop = { batch: string; key: string }

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

const placeOf = (manifest: Manifest, id: string) => {
  const group = manifest.groups.find((g) => g.files.some((f) => f.id === id))
  if (group) {
    if (isNamedMontage(group)) return passengerOf(group)
    return group.destination ?? (isMontage(group) ? 'a montage' : 'Fresh files')
  }
  return manifest.files.find((f) => f.id === id)?.destination ?? 'Fresh files'
}

const placeExisting = async (
  manifest: Manifest,
  outputDir: string,
  file: ManifestFile,
  target: ImportTarget
): Promise<ImportResult> => {
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
  if (inGroup && (await frozenMontages(manifest, outputDir)).has(inGroup.id))
    return {
      filename: file.filename,
      outcome: 'kept',
      reason: `${placeOf(manifest, id)}’s montage lives on the storage only, so nothing leaves it — drop it on a jump to put it in that jump as well`
    }
  const from = placeOf(manifest, id)
  const to =
    target.kind === 'group'
      ? { targetGroupId: target.groupId }
      : { destination: target.kind === 'destination' ? target.name.trim() : null }
  await moveFiles(manifest, new Set([id]), {
    ...to,
    shot: await shotTimesFor(manifest, new Set([id]), to)
  })
  return { filename: file.filename, outcome: 'moved', from }
}

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
    begun: () => tell(0),
    id: bytes.id,
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
  lastModified: number
  body: Readable
  target: ImportTarget
  drop?: ImportDrop
  size?: number
}): Promise<ImportResult> => {
  const filename = path.basename(asked.replace(/\\/g, '/')).trim()
  if (!filename || filename.startsWith('.') || !MEDIA_EXTENSIONS_SET.has(getExtension(filename)))
    throw new Error(`${asked} is not a video or a photo SkyDock knows.`)
  if (target.kind === 'destination' && !target.name.trim())
    throw new Error('Drop it on a dropzone, a montage or the sorting area.')

  const manifestPath = path.join(outputDir, 'manifest.json')
  const checkTarget = async () => {
    const manifest = await loadManifestAsync(manifestPath)
    if (!manifest) throw new Error('No manifest found. Run a scan first.')
    if (target.kind === 'group') {
      const group = manifest.groups.find((g) => g.id === target.groupId)
      if (!group) throw new Error('That jump is no longer there.')
      if ((await frozenMontages(manifest, outputDir)).has(group.id))
        throw new Error('This montage lives on the storage only — nothing can join it.')
    }
    return manifest
  }
  await checkTarget()

  const partial = await incomingPartial(outputDir, filename)
  const counted = counting(drop, size ?? 0)
  const copyEnds = copyBegins()
  try {
    counted.begun()
    await pipeline(body, counted.through, gentleWriter(partial))
    counted.reading()
    const when = new Date(
      Number.isFinite(lastModified) && lastModified > 0 ? lastModified : Date.now()
    )
    await utimes(partial, when, when)

    const id = counted.id()
    const manifest = await checkTarget()
    const existing = manifest.files.find((f) => f.id === id)
    if (existing) {
      if (existing.freed) {
        await mkdir(path.dirname(existing.path), { recursive: true })
        await rename(partial, existing.path)
        restored(manifest, id, id, (await stat(existing.path)).size, true, false)
        await saveManifest(manifestPath, manifest)
      }
      await rm(partial, { force: true })
      const result = await placeExisting(
        manifest,
        outputDir,
        manifest.files.find((f) => f.id === id)!,
        target
      )
      if (result.outcome === 'moved' || result.outcome === 'copied')
        await saveManifest(manifestPath, manifest)
      return result
    }

    const mtime = (await shotTimes([partial])).get(partial) ?? Math.floor(when.getTime() / 1000)
    const dest = await landingFor(outputDir, filename, mtime)
    const { size } = await stat(partial)
    await rename(partial, dest)

    const file: ManifestFile = {
      ...originalEntry({ path: dest, id, mtime, size }),
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
    await saveManifest(manifestPath, manifest)
    return { filename: file.filename, outcome: 'added' }
  } finally {
    copyEnds()
    await rm(partial, { force: true })
    await removeIfEmpty(path.dirname(partial))
  }
}

declare global {
  var skydockIncomingCleared: boolean | undefined
}

const clearStaleIncoming = (outputDir: string) => {
  if (globalThis.skydockIncomingCleared) return
  globalThis.skydockIncomingCleared = true
  void rm(path.join(outputDir, '.incoming'), { recursive: true, force: true })
}

export { clearStaleIncoming, importFile }
export type { ImportTarget }
