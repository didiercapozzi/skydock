import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { isArchiveFresh, sameContents } from './archive'
import { outputKeyOf, uploadGate } from './fileStatus'
import { computeFileId } from './fileId'
import { hashFile } from './lib/fs'
import { jsonText } from './lib/json'
import { statProcessedOutputs } from './manifest'
import { dsmFileMd5 } from './nas'
import type { NasSession } from './nas'
import { getGroupProcessedDir, isFlatGroup } from './process'
import { getCutProxyDir } from './proxy'
import { sendItems } from './sending'
import { isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile, SendPart } from './types'
import { uploadedFiles } from './upload'
import { getTrashDir, isVideoFile, sizeOf } from './utils'
import { lastSegment } from './paths'
import { publish } from './live'
import { slugOf } from './sending'
import { moveFile } from './lib/fs'
import { passengerName } from './workspace'

/* Once a montage is on the storage and handed over, what is left of it here is gigabytes nobody needs
   on this machine: the originals, the prepared copies, the working copies, the film and the zips.
   Freeing it deletes all of that — but only when there is proof that the storage holds the same
   bytes, and that nothing here changed since they went up. Proof, not a record: every file that went
   up is hashed here and hashed by the storage, and both have to match what was sent. The originals
   are covered because they are what the backup holds — the very files, byte for byte, either inside
   the zip that was just proved or sent one by one and proved themselves.

   The whole of the montage's folder goes, the project included — but the project, being the edit, is
   put in the bin rather than erased, since it is small and cannot be made again. Kept: every record,
   so the board still says who this was, what was sent where, and that it now lives only on the
   storage. */

type FreeResult = { groupId: string; fileIds: string[]; bytes: number; at: number }

/* Deleting only ever reaches what SkyDock made or copied, under the output folder — never the
   camera's own storage, which is mounted read-only anyway, and never anything outside. */
const inside = (root: string, target: string) => {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  return resolved.startsWith(`${base}${path.sep}`)
}

const removeFile = (root: string, target: string | undefined) => {
  if (!target || !inside(root, target) || !fs.existsSync(target)) return 0
  const size = fs.statSync(target).size
  fs.rmSync(target, { force: true })
  return size
}

const removeTree = (root: string, target: string) => {
  if (!inside(root, target) || !fs.existsSync(target)) return 0
  const walk = (dir: string): number =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .reduce(
        (sum, entry) =>
          sum +
          (entry.isDirectory()
            ? walk(path.join(dir, entry.name))
            : sizeOf(path.join(dir, entry.name))),
        0
      )
  const size = fs.statSync(target).isDirectory() ? walk(target) : sizeOf(target)
  fs.rmSync(target, { recursive: true, force: true })
  return size
}

/* Everything that has to hold before a byte is deleted. Each problem is named, so a refusal says
   what to do rather than only that it will not. */
const proveOnStorage = async (
  manifest: Manifest,
  outputDir: string,
  groupId: string,
  session: NasSession,
  /* said once for each thing proved, with its name */
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

  /* A montage freed before, some of which has come back — files copied back off a camera or fetched
     from the storage — holds nothing of what freeing deleted but what came back. What it proved then
     stands: the storage holds what went up. So only what is here again has to be shown to be the same
     as what was sent, and nothing is demanded of the prepared copies and archives that are gone. */
  const wasFreed =
    group.freedBefore !== undefined ||
    (uploadedFiles(record).length > 0 &&
      uploadedFiles(record).every((file) => !fs.existsSync(file.localPath)) &&
      group.files.every((f) => !f.processed || !fs.existsSync(f.processed.path)))
  if (wasFreed) {
    const here = group.files.filter((f) => !f.freed && fs.existsSync(f.path))
    const problems: string[] = []
    /* the storage still holds each thing that went up, as it was sent */
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
    /* and each file that is here is that file — by what it contains — and was sent */
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
      /* an upload from before zips were listed names no files: a copy prepared from this very file,
         before the upload, is what says it went up in it */
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

  /* nothing changed since it was prepared — a crop or a re-time since then is not on the storage */
  const outputs = statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) throw new Error(`${gate.message} — it changed since it was uploaded.`)

  const videos = group.files.filter((f) => isVideoFile(f.path))
  const problems: string[] = []
  const filmSent =
    record.film !== undefined ||
    [record.rushes, record.photos].some((zip) => zip?.holds?.includes('film'))
  if (videos.length > 0 && !filmSent) problems.push('the film was never uploaded')

  /* every file that went up: the same bytes here and on the storage as when it was sent */
  const sent = uploadedFiles(record)
  /* all at once: each is hashed here while the storage hashes it there, and the biggest of them decides
     how long this takes, not the sum — one after another, gigabytes were checked in a queue */
  const proofs = await Promise.all(
    sent.map(async (file) => {
      const label = lastSegment(file.remotePath)
      step(label)
      if (!fs.existsSync(file.localPath) || sizeOf(file.localPath) !== file.size)
        return `${label} changed here since it was uploaded`
      const [here, there] = await Promise.all([
        hashFile(file.localPath),
        dsmFileMd5(session.hostname, session.sessionId, file.remotePath)
      ])
      if (here.toLowerCase() !== file.md5.toLowerCase())
        return `${label} changed here since it was uploaded`
      if (there === null) return `${label} could not be checked on the storage`
      if (there.toLowerCase() !== file.md5.toLowerCase())
        return `${label} on the storage is not the file that was sent`
      return null
    })
  )
  problems.push(...proofs.flatMap((p) => (p ? [p] : [])))

  /* A zip that says what it holds holds exactly what the plan puts in such a zip, laid out the same
     way — worked out again here from the montage as it stands. */
  const expected = (holds: SendPart[]) =>
    sendItems(group, outputDir, [{ ending: 'check', parts: holds }]).find((item) => item.zip)
      ?.entries ?? []

  /* the originals: inside a zip that holds exactly them and is newer than all of them, or each one
     sent and proved on its own */
  const sentNames = new Set(sent.map((f) => path.basename(f.localPath)))
  if (videos.length > 0) {
    if (record.rushes?.holds) {
      const zipped = fs.existsSync(record.rushes.localPath)
        ? fs.statSync(record.rushes.localPath).mtimeMs
        : -Infinity
      const changed = videos
        .filter((v) => !fs.existsSync(v.path) || fs.statSync(v.path).mtimeMs > zipped)
        .map((v) => v.filename)
      if (!sameContents(record.rushes.localPath, expected(record.rushes.holds)))
        problems.push('the backup zip does not hold exactly these originals')
      else if (changed.length > 0)
        problems.push(`${changed.join(', ')} changed since the backup zip was made — upload again`)
    } else if (record.rushes) {
      const listed = (() => {
        try {
          return jsonText
            .pipe(z.array(z.string()))
            .safeParse(fs.readFileSync(`${record.rushes.localPath}.contents`, 'utf-8'))
        } catch {
          return null
        }
      })()
      const names = listed?.success ? listed.data : []
      const entries = [
        ...videos.map((f) => ({ file: f.path, name: f.filename })),
        ...names
          .filter((n) => !videos.some((v) => v.filename === n))
          .map((n) => ({ file: path.join(path.dirname(record.rushes!.localPath), n), name: n }))
      ]
      /* What is proved here is that the originals are safe, so only they have to be older than
         the zip. A film beside them in it is proved by its own checksum, and a project in it is
         kept on this machine whatever happens — an edit saved again after the upload loses
         nothing by being freed. */
      const zipped = fs.existsSync(record.rushes.localPath)
        ? fs.statSync(record.rushes.localPath).mtimeMs
        : -Infinity
      const changed = videos
        .filter((v) => !fs.existsSync(v.path) || fs.statSync(v.path).mtimeMs > zipped)
        .map((v) => v.filename)
      if (!sameContents(record.rushes.localPath, entries))
        problems.push('the backup zip does not hold exactly these originals')
      else if (changed.length > 0)
        problems.push(`${changed.join(', ')} changed since the backup zip was made — upload again`)
    } else if (!videos.every((v) => sentNames.has(v.filename))) {
      problems.push('not every original is in the backup')
    }
  }

  /* the photos: the prepared copies are what the passenger's zip holds */
  const photos = group.files.filter((f) => !isVideoFile(f.path))
  if (photos.length > 0) {
    const copies = photos.flatMap((f) => (f.processed ? [path.basename(f.processed.path)] : []))
    if (record.photos?.holds) {
      /* only the photos have to be older than the zip: a project in it may be saved again since */
      const zip = record.photos.localPath
      const built = fs.existsSync(zip) ? fs.statSync(zip).mtimeMs : -Infinity
      const stale = photos.some(
        (f) =>
          !f.processed ||
          !fs.existsSync(f.processed.path) ||
          fs.statSync(f.processed.path).mtimeMs > built
      )
      if (!sameContents(zip, expected(record.photos.holds)) || stale)
        problems.push('the photos zip does not hold exactly these photos')
    } else if (!record.photos) {
      if (copies.length !== photos.length || !copies.every((name) => sentNames.has(name)))
        problems.push('the photos were never uploaded')
    } else {
      const entries = photos.flatMap((f) =>
        f.processed ? [{ file: f.processed.path, name: path.basename(f.processed.path) }] : []
      )
      if (entries.length !== photos.length || !isArchiveFresh(record.photos.localPath, entries))
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
  /* where the project goes, being put aside rather than erased */
  trashDir?: string
}) => {
  const target = manifest.groups.find((g) => g.id === groupId)
  const label = target ? passengerName(target.passenger) : ''
  /* said as it goes, for the window in the corner: each thing proved, then each file deleted */
  const total = (target ? uploadedFiles(target.uploaded).length + target.files.length : 0) + 1
  let done = 0
  const say = (
    stage: 'checking' | 'deleting' | 'done' | 'failed',
    name?: string,
    reason?: string
  ) =>
    publish({
      kind: 'free',
      groupId,
      label,
      stage,
      done: Math.min(done, total),
      total,
      ...(name ? { name } : {}),
      ...(reason ? { reason } : {})
    })
  say('checking')
  try {
    const { group, dir } = await proveOnStorage(manifest, outputDir, groupId, session, (name) => {
      say('checking', name)
      done++
    })
    /* the proof is done, whatever count it came to: what is left is deleting */
    done = Math.max(done, total - group.files.length - 1)

    let bytes = 0
    const originals = path.join(outputDir, 'original_files')
    const proxies = path.join(outputDir, 'proxies')
    /* An original another jump still holds — this one copied into it, or a copy of its own here — is
       not this montage's alone to delete: it stays, with its proxy, until the last jump holding it is
       freed. Everything made from it for this montage still goes. */
    const heldElsewhere = (file: ManifestFile) =>
      manifest.files.some(
        (other) => other.path === file.path && other.id !== file.id && !other.freed
      )
    /* and it is not said to live on the storage only either, because it does not: it is on the disk,
       and a file the board calls gone is a file nothing can be done with — not copied into another
       jump, not moved, not dropped in again */
    const stayed = new Set<string>()
    for (const file of group.files) {
      say('deleting', file.filename)
      if (heldElsewhere(file)) {
        if (file.id) stayed.add(file.id)
      } else {
        bytes += removeFile(originals, file.path)
        if (file.proxy && file.proxy !== file.path) bytes += removeFile(proxies, file.proxy)
      }
      done++
    }
    bytes += removeTree(proxies, getCutProxyDir(outputDir, group.id))
    /* The passenger's folder, the whole of it: what the montage made goes, and the project — the edit,
       small and not to be made again — is put in the bin, so that nothing of it is erased. */
    say('deleting', lastSegment(dir))
    if (fs.existsSync(dir)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const bin = path.join(trashDir, `montage-${slugOf(label) || 'montage'}-${stamp}`)
      for (const entry of fs.readdirSync(dir))
        if (entry.endsWith('.kdenlive'))
          await moveFile(path.join(dir, entry), path.join(bin, entry))
      bytes += removeTree(path.join(outputDir, 'processed'), dir)
    }
    done = total

    const result = {
      groupId: group.id,
      fileIds: group.files.flatMap((f) => (f.id && !stayed.has(f.id) ? [f.id] : [])),
      bytes,
      at: Math.floor(Date.now() / 1000)
    }
    markFreed(manifest, result)
    say('done')
    return result
  } catch (e) {
    say('failed', undefined, e instanceof Error ? e.message : String(e))
    throw e
  }
}

/* Written into whichever manifest is current when it is done — checking gigabytes takes a while,
   and the board goes on being used meanwhile. */
const markFreed = (manifest: Manifest, result: FreeResult) => {
  const ids = new Set(result.fileIds)
  manifest.files = manifest.files.map((f: ManifestFile) =>
    f.id && ids.has(f.id) ? { ...f, freed: true } : f
  )
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

export { freeMontage, markFreed, removeFile, removeTree }
