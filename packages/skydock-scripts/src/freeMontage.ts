import { readdir, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { isArchiveFresh, readContents, sameContents } from './archive'
import { outputKeyOf, uploadGate } from './fileStatus'
import { computeFileId } from './fileId'
import { hashFile, moveFile, pathExists, statOrNull } from './lib/fs'
import { statProcessedOutputs } from './manifest'
import { dsmFileMd5 } from './nas'
import type { NasSession } from './nas'
import { getGroupProcessedDir, isFlatGroup } from './process'
import { getCutProxyDir } from './proxy'
import { sendItems, slugOf } from './sending'
import { isNamedMontage } from './montageArtifacts'
import { EDIT_ENDING } from './montageNames'
import type { Manifest, ManifestFile, SendPart } from './types'
import { uploadedFiles } from './upload'
import { getTrashDir, isVideoFile, mapWithLimit } from './utils'
import { lastSegment } from './paths'
import { inJob } from './live'
import { passengerName } from './workspace'

type StoredRecord = NonNullable<ManifestFile['uploaded']>

type FreeResult = { groupId: string; fileIds: string[]; bytes: number; at: number }

const inside = (root: string, target: string) => {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  return resolved.startsWith(`${base}${path.sep}`)
}

const removeFile = async (root: string, target: string | undefined) => {
  if (!target || !inside(root, target)) return 0
  const stat = await statOrNull(target)
  if (!stat) return 0
  await rm(target, { force: true })
  return stat.size
}

const sizeUnder = async (target: string): Promise<number> => {
  const stat = await statOrNull(target)
  if (!stat) return 0
  if (!stat.isDirectory()) return stat.size
  const entries = await readdir(target)
  const sizes = await mapWithLimit(entries, 16, (entry) => sizeUnder(path.join(target, entry)))
  return sizes.reduce((sum, size) => sum + size, 0)
}

const removeTree = async (root: string, target: string) => {
  if (!inside(root, target)) return 0
  const size = await sizeUnder(target)
  await rm(target, { recursive: true, force: true })
  return size
}

const proofOf = async (file: StoredRecord, session: NasSession) => {
  const label = lastSegment(file.remotePath)
  const local = await statOrNull(file.localPath)
  if (local?.size !== file.size) return `${label} changed here since it was uploaded`
  const [here, there] = await Promise.all([
    hashFile(file.localPath).catch(() => null),
    dsmFileMd5(session.hostname, session.sessionId, file.remotePath)
  ])
  if (here === null || here.toLowerCase() !== file.md5.toLowerCase())
    return `${label} changed here since it was uploaded`
  if (there === null) return `${label} could not be checked on the storage`
  if (there.toLowerCase() !== file.md5.toLowerCase())
    return `${label} on the storage is not the file that was sent`
  return null
}

const changedSince = async <T>(
  zip: string,
  items: T[],
  pathOf: (item: T) => string | undefined
) => {
  const zipped = (await statOrNull(zip))?.mtimeMs ?? -Infinity
  const stats = await mapWithLimit(items, 16, async (item) => {
    const file = pathOf(item)
    return file ? await statOrNull(file) : null
  })
  return items.filter((_, i) => !stats[i] || stats[i].mtimeMs > zipped)
}

const proveOnStorage = async (
  manifest: Manifest,
  outputDir: string,
  groupId: string,
  session: NasSession,
  step: (name: string) => void = () => {}
) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('Montage not found.')
  if (!isNamedMontage(group) || isFlatGroup(group)) throw new Error('Only a montage can be freed.')
  if (group.freed) throw new Error('This montage is already freed from this machine.')
  const record = group.uploaded
  if (!record) throw new Error('Upload this montage first — nothing of it is on the storage yet.')

  const dir = getGroupProcessedDir(outputDir, group).dir
  const sharing = manifest.groups.filter(
    (g) => g.id !== group.id && isNamedMontage(g) && getGroupProcessedDir(outputDir, g).dir === dir
  )
  if (sharing.length > 0)
    throw new Error(
      'This montage has more than one jump in the same folder — only a single-jump montage can be freed.'
    )

  const wasFreed =
    group.freedBefore !== undefined ||
    (uploadedFiles(record).length > 0 &&
      (await Promise.all(uploadedFiles(record).map((file) => pathExists(file.localPath)))).every(
        (exists) => !exists
      ) &&
      (
        await Promise.all(
          group.files.map((f) => (f.processed ? pathExists(f.processed.path) : false))
        )
      ).every((exists) => !exists))
  if (wasFreed) {
    const present = await Promise.all(group.files.map((f) => pathExists(f.path)))
    const here = group.files.filter((f, i) => !f.freed && present[i])
    const problems: string[] = []
    const checks = await Promise.all(
      uploadedFiles(record).map(async (file) => {
        step(lastSegment(file.remotePath))
        const there = await dsmFileMd5(session.hostname, session.sessionId, file.remotePath)
        if (there === null)
          return `${lastSegment(file.remotePath)} could not be checked on the storage`
        if (there.toLowerCase() !== file.md5.toLowerCase())
          return `${lastSegment(file.remotePath)} on the storage is not the file that was sent`
        return null
      })
    )
    problems.push(...checks.flatMap((c) => (c ? [c] : [])))
    const listed = new Set<string>(
      [
        record.rushes,
        record.photos,
        record.film,
        ...(record.originals ?? []),
        ...(record.photoFiles ?? [])
      ].flatMap((r) => (r ? [lastSegment(r.localPath)] : []))
    )
    for (const sent of record.sent ?? [])
      for (const name of sent.contents ?? []) listed.add(lastSegment(name))
    for (const file of here) {
      const preparedForIt =
        file.processed !== undefined &&
        file.processed.source.id === file.id &&
        file.processed.at <= record.at
      if (!listed.has(file.filename) && !preparedForIt)
        problems.push(`${file.filename} is not in what was uploaded`)
      else if ((await computeFileId(file.path)) !== file.id)
        problems.push(`${file.filename} is not the file that was uploaded`)
    }
    if (here.length === 0) problems.push('nothing of it is here to free')
    if (problems.length > 0)
      throw new Error(`Not freed, nothing was deleted: ${problems.join('; ')}.`)
    return { group, dir }
  }

  const outputs = await statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) throw new Error(`${gate.message} — it changed since it was uploaded.`)

  const videos = group.files.filter((f) => isVideoFile(f.path))
  const problems: string[] = []
  const filmSent =
    record.film !== undefined ||
    [record.rushes, record.photos].some((zip) => zip?.holds?.includes('film'))
  if (videos.length > 0 && !filmSent) problems.push('the film was never uploaded')

  const sent = uploadedFiles(record)
  const proofs = await mapWithLimit(sent, 4, (file) => {
    step(lastSegment(file.remotePath))
    return proofOf(file, session)
  })
  problems.push(...proofs.flatMap((p) => (p ? [p] : [])))

  const expected = async (holds: SendPart[]) =>
    (await sendItems(group, outputDir, [{ ending: 'check', parts: holds }])).find(
      (item) => item.zip
    )?.entries ?? []

  const sentNames = new Set(sent.map((f) => path.basename(f.localPath)))
  if (videos.length > 0) {
    if (record.rushes) {
      const rushes = record.rushes
      const entries = rushes.holds
        ? await expected(rushes.holds)
        : [
            ...videos.map((f) => ({ file: f.path, name: f.filename })),
            ...((await readContents(rushes.localPath)) ?? [])
              .filter((n) => !videos.some((v) => v.filename === n))
              .map((n) => ({ file: path.join(path.dirname(rushes.localPath), n), name: n }))
          ]
      if (!(await sameContents(rushes.localPath, entries)))
        problems.push('the backup zip does not hold exactly these originals')
      else {
        const changed = await changedSince(rushes.localPath, videos, (v) => v.path)
        if (changed.length > 0)
          problems.push(
            `${changed.map((v) => v.filename).join(', ')} changed since the backup zip was made — upload again`
          )
      }
    } else if (!videos.every((v) => sentNames.has(v.filename))) {
      problems.push('not every original is in the backup')
    }
  }

  const photos = group.files.filter((f) => !isVideoFile(f.path))
  if (photos.length > 0) {
    const copies = photos.flatMap((f) => (f.processed ? [path.basename(f.processed.path)] : []))
    if (record.photos?.holds) {
      const zip = record.photos.localPath
      const stale = await changedSince(zip, photos, (f) => f.processed?.path)
      if (!(await sameContents(zip, await expected(record.photos.holds))) || stale.length > 0)
        problems.push('the photos zip does not hold exactly these photos')
    } else if (!record.photos) {
      if (copies.length !== photos.length || !copies.every((name) => sentNames.has(name)))
        problems.push('the photos were never uploaded')
    } else {
      const entries = photos.flatMap((f) =>
        f.processed ? [{ file: f.processed.path, name: path.basename(f.processed.path) }] : []
      )
      if (
        entries.length !== photos.length ||
        !(await isArchiveFresh(record.photos.localPath, entries))
      )
        problems.push('the photos zip does not hold exactly these photos')
    }
  }

  if (problems.length > 0)
    throw new Error(`Not freed, nothing was deleted: ${problems.join('; ')}.`)
  return { group, dir }
}

const freeMontage = async ({
  manifest,
  outputDir,
  groupId,
  session,
  trashDir = getTrashDir()
}: {
  manifest: Manifest
  outputDir: string
  groupId: string
  session: NasSession
  trashDir?: string
}) => {
  const target = manifest.groups.find((g) => g.id === groupId)
  const label = target ? passengerName(target.passenger) : ''
  return inJob(
    {
      type: 'free',
      label,
      total: (target ? uploadedFiles(target.uploaded).length + target.files.length : 0) + 1
    },
    async (freeing) => {
      const { group, dir } = await proveOnStorage(manifest, outputDir, groupId, session, (name) => {
        freeing.checking(name)
        freeing.step()
      })

      let bytes = 0
      const originals = path.join(outputDir, 'original_files')
      const proxies = path.join(outputDir, 'proxies')
      const heldElsewhere = (file: ManifestFile) =>
        manifest.files.some(
          (other) => other.path === file.path && other.id !== file.id && !other.freed
        )
      const stayed = new Set<string>()
      for (const file of group.files) {
        freeing.working(file.filename)
        if (heldElsewhere(file)) {
          if (file.id) stayed.add(file.id)
        } else {
          bytes += await removeFile(originals, file.path)
          if (file.proxy && file.proxy !== file.path) bytes += await removeFile(proxies, file.proxy)
        }
        freeing.step()
      }
      bytes += await removeTree(proxies, getCutProxyDir(outputDir, group.id))
      freeing.working(lastSegment(dir))
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const bin = path.join(trashDir, `montage-${slugOf(label) || 'montage'}-${stamp}`)
      for (const entry of await readdir(dir).catch(() => []))
        if (entry.endsWith(EDIT_ENDING))
          await moveFile(path.join(dir, entry), path.join(bin, entry))
      bytes += await removeTree(path.join(outputDir, 'processed'), dir)

      const result = {
        groupId: group.id,
        fileIds: group.files.flatMap((f) => (f.id && !stayed.has(f.id) ? [f.id] : [])),
        bytes,
        at: Math.floor(Date.now() / 1000)
      }
      markFreed(manifest, result)
      return result
    }
  )
}

const freedAmong = (ids: Set<string>) => (f: ManifestFile) =>
  f.id && ids.has(f.id) ? { ...f, freed: true } : f

const markFreed = (manifest: Manifest, result: FreeResult) => {
  const ids = new Set(result.fileIds)
  manifest.files = manifest.files.map(freedAmong(ids))
  manifest.groups = manifest.groups.map((g) =>
    g.id === result.groupId
      ? {
          ...g,
          files: g.files.map((f) => (f.id && !ids.has(f.id) ? f : { ...f, freed: true })),
          freed: { at: result.at, bytes: result.bytes },
          freedBefore: undefined
        }
      : g
  )
}

export { freeMontage, freedAmong, markFreed, proofOf, removeFile, removeTree }
