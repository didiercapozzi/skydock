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

  const previousById = new Map<string, ManifestGroup>()
  const groupById = new Map<string, ManifestGroup>()
  for (const group of manifest.groups) {
    groupById.set(group.id, group)
    for (const file of group.files) if (file.id) previousById.set(file.id, group)
  }

  const usedIds = new Set<string>()
  for (const g of mergedFileGroups) {
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

  manifest.groups = mergedFileGroups.map((files) => {
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
        day: preservedGroup.day ?? day,
        files
      }
    }

    return {
      id: dominant?.id ?? getNextId(),
      label: dominant?.label ?? `Group ${nextIdx - 1}`,
      confirmed: dominant?.confirmed ?? false,
      processed: dominant?.processed,
      passenger: dominant?.passenger,
      day,
      files
    }
  })
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

export { reclusterGroups, shiftFiles }
