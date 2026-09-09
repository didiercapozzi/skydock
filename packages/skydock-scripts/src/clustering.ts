import { JUMP_GAP_SECONDS } from './constants'
import type { Manifest, ManifestFile, ManifestJump } from './types'
import { formatDay, sortFilesByMtime } from './utils'

const reclusterJumps = (manifest: Manifest, preservedIds?: Set<string>) => {
  const seenIds = new Set<string>()
  for (const jump of manifest.jumps) {
    if (seenIds.has(jump.id)) {
      let n = 1
      while (seenIds.has(`jump_${n}`)) n++
      jump.id = `jump_${n}`
    }
    seenIds.add(jump.id)
  }

  const preservedJumps = new Set<ManifestJump>()
  if (preservedIds) {
    for (const jump of manifest.jumps) {
      if (jump.files.some((f) => f.id && preservedIds.has(f.id))) preservedJumps.add(jump)
    }
  }

  const preservedGroups: ManifestFile[][] = []
  const preservedFileIds = new Set<string>()
  for (const jump of preservedJumps) {
    const sorted = sortFilesByMtime(jump.files)
    preservedGroups.push(sorted)
    for (const f of sorted) if (f.id) preservedFileIds.add(f.id)
  }

  const remainingFiles = manifest.files.filter((f) => !f.id || !preservedFileIds.has(f.id))
  const sortedRemaining = sortFilesByMtime(remainingFiles)
  const groups: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0

  for (const file of sortedRemaining) {
    if (current.length > 0 && file.mtime - lastMtime >= JUMP_GAP_SECONDS) {
      groups.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) groups.push(current)

  const groupMin = (files: ManifestFile[]) => {
    let min = Infinity
    for (const f of files) if (f.mtime < min) min = f.mtime
    return min
  }
  const allUnsorted = [...preservedGroups, ...groups]
  const mins = new Map<ManifestFile[], number>()
  for (const g of allUnsorted) mins.set(g, groupMin(g))
  const allGroups = allUnsorted.sort((a, b) => (mins.get(a) ?? 0) - (mins.get(b) ?? 0))

  const mergedGroups: ManifestFile[][] = []
  let runningMax = -Infinity
  for (const group of allGroups) {
    const curMin = mins.get(group) ?? Infinity
    const last = mergedGroups[mergedGroups.length - 1]
    if (last && curMin - runningMax < JUMP_GAP_SECONDS) {
      last.push(...group)
      for (const f of group) if (f.mtime > runningMax) runningMax = f.mtime
    } else {
      mergedGroups.push([...group])
      runningMax = -Infinity
      for (const f of group) if (f.mtime > runningMax) runningMax = f.mtime
    }
  }
  for (const g of mergedGroups) g.sort((a, b) => a.mtime - b.mtime)

  const previousById = new Map<string, ManifestJump>()
  const jumpById = new Map<string, ManifestJump>()
  for (const jump of manifest.jumps) {
    jumpById.set(jump.id, jump)
    for (const file of jump.files) if (file.id) previousById.set(file.id, jump)
  }

  const usedIds = new Set<string>()
  for (const g of mergedGroups) {
    for (const f of g) {
      if (!f.id) continue
      const prev = previousById.get(f.id)
      if (prev && preservedJumps.has(prev)) usedIds.add(prev.id)
    }
  }

  let nextIdx = 1
  const getNextId = () => {
    while (usedIds.has(`jump_${nextIdx}`)) nextIdx++
    const id = `jump_${nextIdx}`
    usedIds.add(id)
    nextIdx++
    return id
  }

  manifest.jumps = mergedGroups.map((files) => {
    const counts = new Map<string, number>()
    for (const file of files) {
      if (!file.id) continue
      const prev = previousById.get(file.id)
      if (prev) counts.set(prev.id, (counts.get(prev.id) ?? 0) + 1)
    }

    let dominant: ManifestJump | undefined
    let dominantCount = 0
    for (const [jumpId, count] of counts) {
      if (count > dominantCount) {
        dominantCount = count
        dominant = jumpById.get(jumpId)
      }
    }

    const groupIds = new Set<string>()
    for (const f of files) if (f.id) groupIds.add(f.id)
    const isPreserved = [...groupIds].some((id) => preservedFileIds.has(id))
    const preservedJump = isPreserved
      ? [...preservedJumps].find((j) => j.files.some((f) => f.id && groupIds.has(f.id)))
      : undefined

    let minMtime = Infinity
    for (const f of files) if (f.mtime < minMtime) minMtime = f.mtime
    const day = formatDay(minMtime)

    if (preservedJump) {
      return {
        id: preservedJump.id,
        label: preservedJump.label,
        confirmed: preservedJump.confirmed,
        processed: preservedJump.processed,
        passenger: preservedJump.passenger,
        publish: preservedJump.publish,
        day: preservedJump.day ?? day,
        files
      }
    }

    return {
      id: dominant?.id ?? getNextId(),
      label: dominant?.label ?? `Jump ${nextIdx - 1}`,
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
  for (const jump of manifest.jumps) {
    for (const file of jump.files) shiftOne(file)
  }
}

export { reclusterJumps, shiftFiles }
