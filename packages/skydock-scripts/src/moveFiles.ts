import * as fs from 'node:fs'
import { groupFromFiles, shiftGroupTo } from './clustering'
import { diskTimes, shotTimes } from './scan'
import type { Manifest, ManifestFile, ManifestPassenger } from './types'
import { idsOf } from './lib/words'

type MoveTo = {
  targetGroupId?: string
  newGroup?: boolean
  destination?: string | null
  name?: string
  startsAt?: number
  montage?: boolean
  passenger?: ManifestPassenger
  shot?: Map<string, number>
}

const backToSort = (to: MoveTo) => !to.targetGroupId && !to.newGroup && !to.destination

const shotTimesFor = (manifest: Manifest, ids: Set<string>, to: MoveTo) =>
  backToSort(to)
    ? shotTimes(manifest.files.filter((f) => f.id && ids.has(f.id)).map((f) => f.path))
    : Promise.resolve(undefined)

const endCopies = (manifest: Manifest, ids: Set<string>) => {
  const ending = manifest.files.filter((f) => f.id && ids.has(f.id) && f.copyOf)
  for (const copy of ending) {
    const output = copy.processed?.path
    if (output && fs.existsSync(output)) {
      try {
        fs.unlinkSync(output)
      } catch {}
    }
  }
  const gone = new Set(ending.map((f) => f.id))
  manifest.files = manifest.files.filter((f) => !gone.has(f.id))
  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.id)) }))
    .filter((g) => g.files.length > 0)
  return new Set([...ids].filter((id) => !gone.has(id)))
}

const moveFiles = (manifest: Manifest, asked: Set<string>, to: MoveTo) => {
  if (to.targetGroupId && !manifest.groups.some((g) => g.id === to.targetGroupId))
    throw new Error('Target jump not found.')
  const ids = backToSort(to) ? endCopies(manifest, asked) : asked
  if (ids.size === 0) return

  if (!to.targetGroupId && !to.newGroup)
    for (const copy of manifest.groups.flatMap((g) => g.files)) {
      const entry = copy.id && ids.has(copy.id) && manifest.files.find((f) => f.id === copy.id)
      if (entry) Object.assign(entry, copy)
    }

  if (backToSort(to)) {
    const going = manifest.files.filter((f) => f.id && ids.has(f.id))
    const times = to.shot ?? diskTimes(going.map((f) => f.path))
    for (const file of going) file.mtime = times.get(file.path) || file.mtime
  }

  for (const file of manifest.files) {
    if (!file.id || !ids.has(file.id)) continue
    const output = file.processed?.path
    if (output && fs.existsSync(output)) {
      try {
        fs.unlinkSync(output)
      } catch {}
    }
    delete file.processed
    delete file.uploaded
    if (to.destination && !to.newGroup && !to.targetGroupId) file.destination = to.destination
    else delete file.destination
  }

  const refs = new Map<string, ManifestFile>()
  for (const f of manifest.groups.flatMap((g) => g.files))
    if (f.id && ids.has(f.id)) refs.set(f.id, f)
  const moving = manifest.files.flatMap((f) =>
    f.id && ids.has(f.id) ? [{ ...(refs.get(f.id) ?? f), destination: undefined }] : []
  )

  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !f.id || !ids.has(f.id)) }))
    .filter((g) => g.files.length > 0 || g.id === to.targetGroupId)

  if (to.targetGroupId) {
    const target = manifest.groups.find((g) => g.id === to.targetGroupId)!
    target.files = [...target.files, ...moving].sort((a, b) => a.mtime - b.mtime)
    target.processed = undefined
  }
  if (to.newGroup) {
    if (moving.length === 0) throw new Error('Those files are no longer in the manifest.')
    const group = groupFromFiles(manifest, moving, to.destination ?? undefined)
    const name = to.name?.trim()
    if (group && to.montage) group.montageJump = true
    if (group && to.passenger) group.passenger = to.passenger
    else if (group && name) group.name = name
    if (group && to.startsAt !== undefined) shiftGroupTo(manifest, group, to.startsAt)
  }
}

const copiesOf = (manifest: Manifest, ids: Set<string>, held: Set<string>) => {
  const taken = new Set(idsOf(manifest.files))
  const asHeld = new Map<string, ManifestFile>()
  for (const f of manifest.files) if (f.id && ids.has(f.id)) asHeld.set(f.id, f)
  for (const f of manifest.groups.flatMap((g) => g.files))
    if (f.id && ids.has(f.id)) asHeld.set(f.id, f)

  const copies: ManifestFile[] = []
  let freed = 0
  for (const source of asHeld.values()) {
    if (source.freed) {
      freed++
      continue
    }
    if (held.has(source.path)) continue
    const original = source.copyOf ?? source.id!
    let n = 1
    while (taken.has(`${original}~${n}`)) n++
    const id = `${original}~${n}`
    taken.add(id)
    held.add(source.path)
    const { processed: _p, uploaded: _u, destination: _d, freed: _f, ...kept } = source
    copies.push({ ...kept, id, copyOf: original })
  }
  manifest.files.push(...copies)
  return { copies, passedOver: asHeld.size - copies.length - freed, freed }
}

const copyFiles = (manifest: Manifest, ids: Set<string>, targetGroupId: string) => {
  const target = manifest.groups.find((g) => g.id === targetGroupId)
  if (!target) throw new Error('Target jump not found.')
  const { copies, passedOver, freed } = copiesOf(
    manifest,
    ids,
    new Set(target.files.map((f) => f.path))
  )
  if (copies.length > 0) {
    target.files = [...target.files, ...copies.map((c) => ({ ...c }))].sort(
      (a, b) => a.mtime - b.mtime
    )
    target.processed = undefined
  }
  return { copied: copies.length, passedOver, freed }
}

const copyIntoMontage = (manifest: Manifest, ids: Set<string>, passenger: ManifestPassenger) => {
  const { copies, passedOver, freed } = copiesOf(manifest, ids, new Set())
  const group = groupFromFiles(manifest, copies)
  if (group) {
    group.montageJump = true
    group.passenger = passenger
  }
  return { copied: copies.length, passedOver, freed, groupId: group?.id }
}

const deleteJump = (manifest: Manifest, groupId: string) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('That jump is no longer on the board.')
  const ids = new Set(idsOf(group.files))
  moveFiles(manifest, ids, { destination: null })
  manifest.groups = manifest.groups.filter((g) => g.id !== groupId)
  return ids.size
}

export { copyFiles, copyIntoMontage, deleteJump, moveFiles, shotTimesFor }
export type { MoveTo }
