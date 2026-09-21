import * as path from 'node:path'
import { fileStatus, outputKeyOf } from './fileStatus'
import { freeablePlace } from './freeable'
import { removeFile, removeTree } from './freeTandem'
import { hashFile } from './lib/fs'
import { statProcessedOutputs } from './manifest'
import { dsmFileMd5 } from './nas'
import type { NasSession } from './nas'
import { lastSegment } from './paths'
import { getCutProxyDir } from './proxy'
import { isTandem } from './tandem'
import type { Manifest, ManifestFile } from './types'

/* A dropzone holds every day ever shot there, and what went up of it is its processed copies. Once
   the storage is proved to hold those, the copies, the originals they were made from and their
   working copies are gigabytes this machine no longer needs. What goes up of a dropzone is the copy
   and never the original, so a trimmed, cropped or turned clip keeps only the part that was
   delivered — freeing is asked for knowing that, and counts them.

   The unit is the jump: one with every file on the storage is freed whole and reads as the storage's
   alone, one with a file still to upload is left as it is. A loose file is its own unit. Proof, not
   a record, and all or nothing: every copy is hashed here and by the storage, and a single mismatch
   deletes nothing at all. */

/* what was freed, and how many jumps and loose files stayed for not being all on the storage */
type DropzoneFreeResult = {
  groupIds: string[]
  fileIds: string[]
  bytes: number
  at: number
  kept: number
}

/* the dropzone's jumps and loose files, and which of them are on the storage by every check the
   board makes */
const freeableIn = (manifest: Manifest, destination: string) => {
  const outputs = statProcessedOutputs(manifest)
  const inJumps = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.path)))
  return freeablePlace(
    manifest.groups.filter((g) => g.destination === destination && !isTandem(g)),
    manifest.files.filter((f) => f.destination === destination && !inJumps.has(f.path)),
    (file) => fileStatus(file, { output: outputs[outputKeyOf(file)] }) === 'uploaded'
  )
}

const proveOnStorage = async (files: ManifestFile[], session: NasSession) => {
  const problems: string[] = []
  for (const file of files) {
    const sent = file.uploaded!
    const label = lastSegment(sent.remotePath)
    const [here, there] = await Promise.all([
      hashFile(sent.localPath).catch(() => null),
      dsmFileMd5(session.hostname, session.sessionId, sent.remotePath)
    ])
    if (here === null || here.toLowerCase() !== sent.md5.toLowerCase())
      problems.push(`${label} changed here since it was uploaded`)
    else if (there === null) problems.push(`${label} could not be checked on the storage`)
    else if (there.toLowerCase() !== sent.md5.toLowerCase())
      problems.push(`${label} on the storage is not the file that was sent`)
  }
  return problems
}

const freeDropzone = async ({
  manifest,
  outputDir,
  destination,
  session
}: {
  manifest: Manifest
  outputDir: string
  destination: string
  session: NasSession
}) => {
  const { jumps, files, kept } = freeableIn(manifest, destination)
  if (files.length === 0)
    throw new Error(`Nothing of ${destination} is on the storage yet — upload it first.`)
  const problems = await proveOnStorage(files, session)
  if (problems.length > 0)
    throw new Error(`Not freed, nothing was deleted: ${problems.join('; ')}.`)

  const going = new Set(files.map((f) => f.id))
  const originals = path.join(outputDir, 'original_files')
  const proxies = path.join(outputDir, 'proxies')
  const processed = path.join(outputDir, 'processed')
  /* an original another jump still holds, and is not being freed with this one, stays */
  const heldElsewhere = (file: ManifestFile) =>
    [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].some(
      (other) => other.path === file.path && !other.freed && !going.has(other.id)
    )
  let bytes = 0
  /* its original stayed, so the file is still here: freed is the file not being here, and saying it
     of one on the disk would lock it and have a camera pass it over */
  const stayed = new Set<string>()
  for (const file of files) {
    bytes += removeFile(processed, file.processed?.path)
    if (heldElsewhere(file)) {
      if (file.id) stayed.add(file.id)
      continue
    }
    bytes += removeFile(originals, file.path)
    if (file.proxy && file.proxy !== file.path) bytes += removeFile(proxies, file.proxy)
  }
  for (const jump of jumps) bytes += removeTree(proxies, getCutProxyDir(outputDir, jump.id))

  const result = {
    groupIds: jumps.map((g) => g.id),
    fileIds: files.flatMap((f) => (f.id && !stayed.has(f.id) ? [f.id] : [])),
    bytes,
    at: Math.floor(Date.now() / 1000),
    kept
  }
  markDropzoneFreed(manifest, result)
  return result
}

/* written into whichever manifest is current when it is done, as for a tandem */
const markDropzoneFreed = (manifest: Manifest, result: DropzoneFreeResult) => {
  const ids = new Set(result.fileIds)
  const jumps = new Set(result.groupIds)
  const freed = (f: ManifestFile) => (f.id && ids.has(f.id) ? { ...f, freed: true } : f)
  manifest.files = manifest.files.map(freed)
  manifest.groups = manifest.groups.map((g) =>
    jumps.has(g.id)
      ? { ...g, files: g.files.map(freed), freed: { at: result.at, bytes: 0 } }
      : { ...g, files: g.files.map(freed) }
  )
}

export { freeDropzone, markDropzoneFreed }
export type { DropzoneFreeResult }
