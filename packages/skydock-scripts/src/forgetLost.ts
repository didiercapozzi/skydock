import { access } from 'node:fs/promises'
import { parentOf } from './paths'
import type { RemoteListing } from './fileStatus'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { goneFromStorage, uploadedFiles } from './upload'

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false
  )

const stillHere = async (file: ManifestFile) =>
  (
    await Promise.all(
      [file.path, file.processed?.path].map((path) => path !== undefined && exists(path))
    )
  ).some(Boolean)

const missingOnStorage = (file: ManifestFile, remote: RemoteListing) => {
  const record = file.uploaded
  if (!record) return false
  if (!remote.dirs.includes(parentOf(record.remotePath))) return false
  return !(record.remotePath in remote.sizes)
}

const isLost = async (file: ManifestFile, remote: RemoteListing) =>
  Boolean(file.id) &&
  Boolean(file.freed) &&
  missingOnStorage(file, remote) &&
  !(await stillHere(file))

const emptied = (group: ManifestGroup, remote: RemoteListing) =>
  group.files.length === 0 &&
  goneFromStorage(group.uploaded, remote).length === uploadedFiles(group.uploaded).length

const forgetLostFiles = async (manifest: Manifest, remote: RemoteListing | null) => {
  if (!remote) return []
  const verdicts = await Promise.all(manifest.files.map((file) => isLost(file, remote)))
  const lost = manifest.files.filter((_, i) => verdicts[i])
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
