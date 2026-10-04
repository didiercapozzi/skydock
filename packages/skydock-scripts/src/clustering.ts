import { GROUP_GAP_SECONDS } from './constants'
import { isFiled } from './filed'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { formatDay, sortFilesByMtime } from './utils'
import { idsOf } from './lib/words'

const splitByGap = (files: ManifestFile[]) => {
  const batches: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let last = 0
  for (const file of sortFilesByMtime(files)) {
    if (current.length > 0 && file.mtime - last >= GROUP_GAP_SECONDS) {
      batches.push(current)
      current = []
    }
    current.push(file)
    last = file.mtime
  }
  if (current.length > 0) batches.push(current)
  return batches
}

const mainRun = (held: ManifestFile[]) => {
  const own = held.filter((f) => !f.copyOf)
  const runs = splitByGap(own.length > 0 ? own : held)
  return runs.reduce<ManifestFile[]>((a, b) => (b.length > a.length ? b : a), [])
}

const offGap = (held: ManifestFile[]) => {
  const main = new Set(mainRun(held))
  return new Set(held.flatMap((f) => (f.id && !f.copyOf && !main.has(f) ? [f.id] : [])))
}

const startOfFiles = (files: ManifestFile[]) => mainRun(files)[0]?.mtime ?? 0

const dayOfFiles = (files: ManifestFile[]) =>
  files.length === 0 ? '' : formatDay(startOfFiles(files))

const buildGroup = (files: ManifestFile[], id: string, label: string) => ({
  id,
  label,
  day: dayOfFiles(files),
  files
})

const idMinter = (taken: Iterable<string>) => {
  const used = new Set(taken)
  let idx = 1
  return {
    used,
    next: () => {
      while (used.has(`group_${idx}`)) idx++
      const id = `group_${idx}`
      used.add(id)
      return id
    }
  }
}

const reclusterGroups = (manifest: Manifest) => {
  const previous = new Map<string, ManifestGroup>()
  for (const group of manifest.groups)
    for (const file of group.files) if (file.id) previous.set(file.id, group)

  const copies = manifest.files.filter((f) => f.copyOf)
  const mint = idMinter([])
  manifest.groups = splitByGap(manifest.files.filter((f) => !f.copyOf))
    .filter((files) => files.length > 1)
    .map((files) => {
      const counts = new Map<ManifestGroup, number>()
      for (const file of files) {
        const before = file.id ? previous.get(file.id) : undefined
        if (before) counts.set(before, (counts.get(before) ?? 0) + 1)
      }
      let dominant: ManifestGroup | undefined
      let most = 0
      for (const [group, count] of counts) {
        if (count > most) {
          most = count
          dominant = group
        }
      }
      const keepsId = dominant !== undefined && !mint.used.has(dominant.id)
      if (keepsId && dominant) mint.used.add(dominant.id)
      const id = keepsId && dominant ? dominant.id : mint.next()
      return {
        ...buildGroup(files, id, dominant?.label ?? id),
        processed: dominant?.processed,
        passenger: dominant?.passenger,
        destination: dominant?.destination,
        ...(keepsId && dominant?.name ? { name: dominant.name } : {})
      }
    })
  const homeless = new Set<string>()
  for (const copy of copies) {
    const was = copy.id ? previous.get(copy.id) : undefined
    const home = was && manifest.groups.find((g) => g.id === was.id)
    const held = was?.files.find((f) => f.id === copy.id)
    if (home && held) home.files = [...home.files, held].sort((a, b) => a.mtime - b.mtime)
    else if (copy.id && !copy.destination) homeless.add(copy.id)
  }
  if (homeless.size > 0) manifest.files = manifest.files.filter((f) => !f.id || !homeless.has(f.id))
}

const groupNewFiles = (manifest: Manifest, added: ManifestFile[]) => {
  const unfiled = manifest.groups.filter((g) => !isFiled(g))
  for (const batch of splitByGap(added)) {
    const first = batch[0]!.mtime
    const last = batch[batch.length - 1]!.mtime
    const near = unfiled.find((g) => {
      const own = g.files.filter((f) => !f.copyOf).map((f) => f.mtime)
      return (
        own.length > 0 &&
        first - Math.max(...own) < GROUP_GAP_SECONDS &&
        Math.min(...own) - last < GROUP_GAP_SECONDS
      )
    })
    if (near) {
      near.files = sortFilesByMtime([...near.files, ...batch])
      near.day = dayOfFiles(near.files)
    } else if (batch.length > 1) groupFromFiles(manifest, batch)
  }
}

const groupFromFiles = (manifest: Manifest, files: ManifestFile[], destination?: string) => {
  if (files.length === 0) return null
  const id = idMinter(manifest.groups.map((g) => g.id)).next()
  const group: ManifestGroup = {
    ...buildGroup(sortFilesByMtime(files), id, id),
    ...(destination ? { destination } : {})
  }
  manifest.groups.push(group)
  return group
}

const freshIds = (manifest: Manifest) => {
  const filed = new Set(manifest.groups.filter(isFiled).flatMap((g) => g.files.map((f) => f.id)))
  return new Set(
    manifest.files.flatMap((f) => (f.id && !f.destination && !filed.has(f.id) ? [f.id] : []))
  )
}

const looseFiles = (manifest: Manifest) => {
  const grouped = new Set(manifest.groups.flatMap((g) => idsOf(g.files)))
  return manifest.files.filter((f) => f.id && !grouped.has(f.id) && !f.destination)
}

const regroupLooseFiles = (manifest: Manifest) => {
  const loose = looseFiles(manifest)
  if (loose.length === 0) return 0

  const batches = splitByGap(loose).filter((files) => files.length > 1)
  for (const files of batches) groupFromFiles(manifest, files)
  return batches.length
}

const shiftFiles = (manifest: Manifest, ids: Set<string>, offsetSeconds: number) => {
  const shifted = new Set<ManifestFile>()
  const shiftOne = (file: ManifestFile) => {
    if (!file.id || !ids.has(file.id) || shifted.has(file)) return
    shifted.add(file)
    file.mtime += offsetSeconds
  }
  for (const file of manifest.files) shiftOne(file)
  for (const group of manifest.groups) for (const file of group.files) shiftOne(file)
  for (const group of manifest.groups) {
    if (group.files.some((f) => shifted.has(f))) group.day = dayOfFiles(group.files)
  }
}

const shiftGroupTo = (manifest: Manifest, group: ManifestGroup, anchorEpoch: number) => {
  if (group.files.length === 0) return
  const offset = Math.round(anchorEpoch) - startOfFiles(group.files)
  if (offset === 0) return
  shiftFiles(manifest, new Set(idsOf(group.files)), offset)
}

const retimeFile = (manifest: Manifest, id: string, epoch: number) => {
  const touched = [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].filter(
    (f) => f.id === id
  )
  if (touched.length === 0) return false
  for (const file of touched) file.mtime = Math.round(epoch)
  for (const group of manifest.groups)
    if (group.files.some((f) => f.id === id)) group.files.sort((a, b) => a.mtime - b.mtime)
  return true
}

export {
  dayOfFiles,
  freshIds,
  groupFromFiles,
  groupNewFiles,
  looseFiles,
  offGap,
  reclusterGroups,
  regroupLooseFiles,
  retimeFile,
  shiftFiles,
  shiftGroupTo,
  splitByGap,
  startOfFiles
}
