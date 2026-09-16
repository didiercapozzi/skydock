import { GROUP_GAP_SECONDS } from './constants'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { formatDay, sortFilesByMtime } from './utils'

const reclusterGroups = (manifest: Manifest, preservedIds?: Set<string>) => {
  const seenIds = new Set<string>()
  for (const group of manifest.groups) {
    if (seenIds.has(group.id)) {
      let n = 1
      while (seenIds.has(`group_${n}`)) n++
      group.id = `group_${n}`
    }
    seenIds.add(group.id)
  }

  const preservedGroups = new Set<ManifestGroup>()
  if (preservedIds) {
    for (const group of manifest.groups) {
      if (group.files.some((f) => f.id && preservedIds.has(f.id))) preservedGroups.add(group)
    }
  }

  const preservedFileGroups: ManifestFile[][] = []
  const preservedFileIds = new Set<string>()
  for (const group of preservedGroups) {
    const sorted = sortFilesByMtime(group.files)
    preservedFileGroups.push(sorted)
    for (const f of sorted) if (f.id) preservedFileIds.add(f.id)
  }

  const remainingFiles = manifest.files.filter((f) => !f.id || !preservedFileIds.has(f.id))
  const sortedRemaining = sortFilesByMtime(remainingFiles)
  const fileGroups: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0

  for (const file of sortedRemaining) {
    if (current.length > 0 && file.mtime - lastMtime >= GROUP_GAP_SECONDS) {
      fileGroups.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) fileGroups.push(current)

  const groupMin = (files: ManifestFile[]) => {
    let min = Infinity
    for (const f of files) if (f.mtime < min) min = f.mtime
    return min
  }
  const allUnsorted = [...preservedFileGroups, ...fileGroups]
  const mins = new Map<ManifestFile[], number>()
  for (const g of allUnsorted) mins.set(g, groupMin(g))
  const allFileGroups = allUnsorted.sort((a, b) => (mins.get(a) ?? 0) - (mins.get(b) ?? 0))

  const mergedFileGroups: ManifestFile[][] = []
  let runningMax = -Infinity
  for (const fileGroup of allFileGroups) {
    const curMin = mins.get(fileGroup) ?? Infinity
    const last = mergedFileGroups[mergedFileGroups.length - 1]
    if (last && curMin - runningMax < GROUP_GAP_SECONDS) {
      last.push(...fileGroup)
      for (const f of fileGroup) if (f.mtime > runningMax) runningMax = f.mtime
    } else {
      mergedFileGroups.push([...fileGroup])
      runningMax = -Infinity
      for (const f of fileGroup) if (f.mtime > runningMax) runningMax = f.mtime
    }
  }
  for (const g of mergedFileGroups) g.sort((a, b) => a.mtime - b.mtime)

  // Lone files (single-file groups) stay in manifest.files but not in any group.
  // They appear as unassigned file rows in the UI and can be dragged into groups.
  // Preserved groups (manually edited) are kept even with 1 file.
  const multiFileGroups = mergedFileGroups.filter(
    (g) => g.length > 1 || g.some((f) => f.id && preservedFileIds.has(f.id))
  )

  const previousById = new Map<string, ManifestGroup>()
  const groupById = new Map<string, ManifestGroup>()
  for (const group of manifest.groups) {
    groupById.set(group.id, group)
    for (const file of group.files) if (file.id) previousById.set(file.id, group)
  }

  const usedIds = new Set<string>()
  for (const g of multiFileGroups) {
    for (const f of g) {
      if (!f.id) continue
      const prev = previousById.get(f.id)
      if (prev && preservedGroups.has(prev)) usedIds.add(prev.id)
    }
  }

  let nextIdx = 1
  const getNextId = () => {
    while (usedIds.has(`group_${nextIdx}`)) nextIdx++
    const id = `group_${nextIdx}`
    usedIds.add(id)
    nextIdx++
    return id
  }

  manifest.groups = multiFileGroups.map((files) => {
    const counts = new Map<string, number>()
    for (const file of files) {
      if (!file.id) continue
      const prev = previousById.get(file.id)
      if (prev) counts.set(prev.id, (counts.get(prev.id) ?? 0) + 1)
    }

    let dominant: ManifestGroup | undefined
    let dominantCount = 0
    for (const [groupId, count] of counts) {
      if (count > dominantCount) {
        dominantCount = count
        dominant = groupById.get(groupId)
      }
    }

    const fileIds = new Set<string>()
    for (const f of files) if (f.id) fileIds.add(f.id)
    const isPreserved = [...fileIds].some((id) => preservedFileIds.has(id))
    const preservedGroup = isPreserved
      ? [...preservedGroups].find((g) => g.files.some((f) => f.id && fileIds.has(f.id)))
      : undefined

    let minMtime = Infinity
    for (const f of files) if (f.mtime < minMtime) minMtime = f.mtime
    const day = formatDay(minMtime)

    if (preservedGroup) {
      return {
        id: preservedGroup.id,
        label: preservedGroup.label,
        confirmed: preservedGroup.confirmed,
        processed: preservedGroup.processed,
        passenger: preservedGroup.passenger,
        publish: preservedGroup.publish,
        destination: preservedGroup.destination,
        day: preservedGroup.day ?? day,
        files
      }
    }

    /* the destination is a user edit and survives a rescan; the share link does not,
       because the group's files changed and the published folder is now stale (§12.4) */
    return {
      id: dominant?.id ?? getNextId(),
      label: dominant?.label ?? `Group ${nextIdx - 1}`,
      confirmed: dominant?.confirmed ?? false,
      processed: dominant?.processed,
      passenger: dominant?.passenger,
      destination: dominant?.destination,
      day,
      files
    }
  })
}

/* Re-clusters only the files that sit in no group — the sorting area — so pulling files
   out of a destination does not permanently destroy the grouping the scan found.
   Groups already assigned to a destination are never touched. */
const regroupLooseFiles = (manifest: Manifest) => {
  const grouped = new Set<string>()
  for (const group of manifest.groups)
    for (const file of group.files) if (file.id) grouped.add(file.id)

  const loose = sortFilesByMtime(
    manifest.files.filter((f) => f.id && !grouped.has(f.id) && !f.destination)
  )
  if (loose.length === 0) return 0

  const usedIds = new Set(manifest.groups.map((g) => g.id))
  let nextIdx = 1
  const getNextId = () => {
    while (usedIds.has(`group_${nextIdx}`)) nextIdx++
    const id = `group_${nextIdx}`
    usedIds.add(id)
    nextIdx++
    return id
  }

  const batches: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0
  for (const file of loose) {
    if (current.length > 0 && file.mtime - lastMtime >= GROUP_GAP_SECONDS) {
      batches.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) batches.push(current)

  for (const files of batches) {
    let minMtime = Infinity
    for (const f of files) if (f.mtime < minMtime) minMtime = f.mtime
    const id = getNextId()
    manifest.groups.push({
      id,
      label: id,
      confirmed: false,
      day: formatDay(minMtime),
      files
    })
  }
  return batches.length
}

const shiftFiles = (manifest: Manifest, ids: Set<string>, offsetSeconds: number) => {
  const shifted = new Set<ManifestFile>()
  const shiftOne = (file: ManifestFile) => {
    if (!file.id || !ids.has(file.id) || shifted.has(file)) return
    shifted.add(file)
    if (file.originalMtime === undefined) file.originalMtime = file.mtime
    file.mtime += offsetSeconds
  }
  for (const file of manifest.files) shiftOne(file)
  for (const group of manifest.groups) {
    for (const file of group.files) shiftOne(file)
  }
}

export { reclusterGroups, regroupLooseFiles, shiftFiles }
