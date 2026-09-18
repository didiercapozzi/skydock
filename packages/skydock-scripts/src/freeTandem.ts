import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { isArchiveFresh, sameContents } from './archive'
import { outputKeyOf, uploadGate } from './fileStatus'
import { hashFile } from './lib/fs'
import { statProcessedOutputs } from './manifest'
import { dsmFileMd5 } from './nas'
import type { NasSession } from './nas'
import { getGroupProcessedDir, isFlatGroup } from './process'
import { getCutProxyDir } from './proxy'
import { isTandem } from './tandem'
import type { Manifest, ManifestFile } from './types'
import { uploadedFiles } from './upload'
import { isVideoFile, sizeOf } from './utils'
import { lastSegment } from './paths'

/* Once a tandem is on the storage and handed over, what is left of it here is gigabytes nobody needs
   on this machine: the originals, the prepared copies, the working copies, the film and the zips.
   Freeing it deletes all of that — but only when there is proof that the storage holds the same
   bytes, and that nothing here changed since they went up. Proof, not a record: every file that went
   up is hashed here and hashed by the storage, and both have to match what was sent. The originals
   are covered because they are what the backup holds — the very files, byte for byte, either inside
   the zip that was just proved or sent one by one and proved themselves.

   Kept: the project (it is the edit, and small) and every record, so the board still says who this
   was, what was sent where, and that it now lives only on the storage. */

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
  session: NasSession
) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('Tandem not found.')
  if (!isTandem(group) || isFlatGroup(group)) throw new Error('Only a tandem can be freed.')
  if (group.freed) throw new Error('This tandem is already freed from this machine.')
  const record = group.uploaded
  if (!record) throw new Error('Upload this tandem first — nothing of it is on the storage yet.')

  const dir = getGroupProcessedDir(outputDir, group).dir
  const sharing = manifest.groups.filter(
    (g) => g.id !== group.id && isTandem(g) && getGroupProcessedDir(outputDir, g).dir === dir
  )
  if (sharing.length > 0)
    throw new Error(
      'This passenger has more than one jump in the same folder — only a single-jump tandem can be freed.'
    )

  /* nothing changed since it was prepared — a crop or a re-time since then is not on the storage */
  const outputs = statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) throw new Error(`${gate.message} — it changed since it was uploaded.`)

  const videos = group.files.filter((f) => isVideoFile(f.path))
  const problems: string[] = []
  if (videos.length > 0 && !record.film) problems.push('the film was never uploaded')

  /* every file that went up: the same bytes here and on the storage as when it was sent */
  const sent = uploadedFiles(record)
  for (const file of sent) {
    const label = lastSegment(file.remotePath)
    if (!fs.existsSync(file.localPath) || sizeOf(file.localPath) !== file.size) {
      problems.push(`${label} changed here since it was uploaded`)
      continue
    }
    const [here, there] = await Promise.all([
      hashFile(file.localPath),
      dsmFileMd5(session.hostname, session.sessionId, file.remotePath)
    ])
    if (here.toLowerCase() !== file.md5.toLowerCase())
      problems.push(`${label} changed here since it was uploaded`)
    else if (there === null) problems.push(`${label} could not be checked on the storage`)
    else if (there.toLowerCase() !== file.md5.toLowerCase())
      problems.push(`${label} on the storage is not the file that was sent`)
  }

  /* the originals: inside a zip that holds exactly them and is newer than all of them, or each one
     sent and proved on its own */
  const sentLocally = new Set(sent.map((f) => f.localPath))
  if (videos.length > 0) {
    if (record.rushes) {
      const listed = (() => {
        try {
          return z
            .array(z.string())
            .safeParse(JSON.parse(fs.readFileSync(`${record.rushes.localPath}.contents`, 'utf-8')))
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
    } else if (!videos.every((v) => sentLocally.has(v.path))) {
      problems.push('not every original is in the backup')
    }
  }

  /* the photos: the prepared copies are what the passenger's zip holds */
  const photos = group.files.filter((f) => !isVideoFile(f.path))
  if (photos.length > 0) {
    if (!record.photos) problems.push('the photos were never uploaded')
    else {
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

const freeTandem = async ({
  manifest,
  outputDir,
  groupId,
  session
}: {
  manifest: Manifest
  outputDir: string
  groupId: string
  session: NasSession
}): Promise<FreeResult> => {
  const { group, dir } = await proveOnStorage(manifest, outputDir, groupId, session)

  let bytes = 0
  const originals = path.join(outputDir, 'original_files')
  const proxies = path.join(outputDir, 'proxies')
  /* An original another jump still holds — this one copied into it, or a copy of its own here — is
     not this tandem's alone to delete: it stays, with its proxy, until the last jump holding it is
     freed. Everything made from it for this tandem still goes. */
  const heldElsewhere = (file: ManifestFile) =>
    manifest.files.some((other) => other.path === file.path && other.id !== file.id && !other.freed)
  for (const file of group.files) {
    if (heldElsewhere(file)) continue
    bytes += removeFile(originals, file.path)
    if (file.proxy && file.proxy !== file.path) bytes += removeFile(proxies, file.proxy)
  }
  bytes += removeTree(proxies, getCutProxyDir(outputDir, group.id))
  /* the passenger's folder, all but the project */
  if (fs.existsSync(dir))
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith('.kdenlive')) continue
      bytes += removeTree(path.join(outputDir, 'processed'), path.join(dir, entry))
    }

  const result = {
    groupId: group.id,
    fileIds: group.files.flatMap((f) => (f.id ? [f.id] : [])),
    bytes,
    at: Math.floor(Date.now() / 1000)
  }
  markFreed(manifest, result)
  return result
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
          files: g.files.map((f) => ({ ...f, freed: true })),
          freed: { at: result.at, bytes: result.bytes }
        }
      : g
  )
}

export { freeTandem, markFreed }
export type { FreeResult }
