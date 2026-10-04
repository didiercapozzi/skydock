import * as fs from 'node:fs'
import { parentOf } from './paths'
import type { RemoteListing } from './fileStatus'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { goneFromStorage, uploadedFiles } from './upload'

const stillHere = (file: ManifestFile) =>
  fs.existsSync(file.path) || Boolean(file.processed && fs.existsSync(file.processed.path))

const missingOnStorage = (file: ManifestFile, remote: RemoteListing) => {
  const record = file.uploaded
  if (!record) return false
  if (!remote.dirs.includes(parentOf(record.remotePath))) return false
  return !(record.remotePath in remote.sizes)
}

const isLost = (file: ManifestFile, remote: RemoteListing) =>
  Boolean(file.id) && Boolean(file.freed) && missingOnStorage(file, remote) && !stillHere(file)

const emptied = (group: ManifestGroup, remote: RemoteListing) =>
  group.files.length === 0 &&
  goneFromStorage(group.uploaded, remote).length === uploadedFiles(group.uploaded).length

const forgetLostFiles = (manifest: Manifest, remote: RemoteListing | null) => {
  if (!remote) return []
  const lost = manifest.files.filter((file) => isLost(file, remote))
  if (lost.length === 0) return []
  const ids = new Set(lost.map((file) => file.id!))
  const kept = (file: ManifestFile) => !file.id || !ids.has(file.id)
  manifest.files = manifest.files.filter(kept)
  manifest.groups = manifest.groups.flatMap((group) => {
    const files = group.files.filter(kept)
    if (files.length === group.files.length) return [group]
    const left = { ...group, files }
    return emptied(left, remote) ? [] : [left]
  })
  return lost.map((file) => file.filename)
}

export { forgetLostFiles }
