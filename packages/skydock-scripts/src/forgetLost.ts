import * as fs from 'node:fs'
import { parentOf } from './paths'
import type { RemoteListing } from './fileStatus'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { goneFromStorage, uploadedFiles } from './upload'

/* Footage that is nowhere is not listed.

   A file whose space was freed has no original and no copy left on this machine: the storage is the
   only place it exists. If somebody then deletes it over there, the board is left holding a name, a
   length and a lock for footage that cannot be reached, opened, uploaded or freed — a row that can
   only ever be a dead link. So the entry is dropped and the app stops mentioning it.

   Only what the storage actually answered about counts, and only what the disk confirms is not
   here: a folder that was not listed, a call that failed, or an original still on this machine all
   mean the file stays exactly as it was. Forgetting takes away the record, never a file — there is
   nothing left to delete by the time this applies. */

/* still reachable from here: the original, or the copy that was made from it */
const stillHere = (file: ManifestFile) =>
  fs.existsSync(file.path) || Boolean(file.processed && fs.existsSync(file.processed.path))

/* Absent from a folder that answered. A file of the wrong size is not this: something is there, and
   that is the board's `processed` to report, not a reason to forget anything. */
const missingOnStorage = (file: ManifestFile, remote: RemoteListing) => {
  const record = file.uploaded
  if (!record) return false
  if (!remote.dirs.includes(parentOf(record.remotePath))) return false
  return !(record.remotePath in remote.sizes)
}

const isLost = (file: ManifestFile, remote: RemoteListing) =>
  Boolean(file.id) && Boolean(file.freed) && missingOnStorage(file, remote) && !stillHere(file)

/* A jump with nothing left in it goes with its files. A tandem does too, unless the storage still
   holds what was delivered of it — the film outlives the rushes it was cut from, and that delivery
   is the one thing about a passenger worth keeping a folder for. */
const emptied = (group: ManifestGroup, remote: RemoteListing) =>
  group.files.length === 0 &&
  goneFromStorage(group.uploaded, remote).length === uploadedFiles(group.uploaded).length

/* Drops every lost file from the manifest, and returns what was dropped so it can be said out loud
   in the log. The manifest is only worth saving when something comes back. */
const forgetLostFiles = (manifest: Manifest, remote: RemoteListing | null) => {
  if (!remote) return []
  const lost = manifest.files.filter((file) => isLost(file, remote))
  if (lost.length === 0) return []
  const ids = new Set(lost.map((file) => file.id!))
  const kept = (file: ManifestFile) => !file.id || !ids.has(file.id)
  manifest.files = manifest.files.filter(kept)
  manifest.groups = manifest.groups.flatMap((group) => {
    const files = group.files.filter(kept)
    /* only a jump this took something out of is weighed: one that was already empty is somebody
       else's business */
    if (files.length === group.files.length) return [group]
    const left = { ...group, files }
    return emptied(left, remote) ? [] : [left]
  })
  return lost.map((file) => file.filename)
}

export { forgetLostFiles }
