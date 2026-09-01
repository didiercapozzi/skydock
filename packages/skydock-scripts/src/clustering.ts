import { JUMP_GAP_SECONDS } from './constants'
import type { Manifest, ManifestFile, ManifestJump } from './types'
import { sortFilesByMtime } from './utils'

const reclusterJumps = (manifest: Manifest, preservedPaths?: Set<string>): void => {
  const seenIds = new Set<string>()
  for (const jump of manifest.jumps) {
    if (seenIds.has(jump.id)) {
      let n = 1
      while (seenIds.has(`jump_${n}`)) n++
      jump.id = `jump_${n}`
      jump.label = `Jump ${n}`
    }
    seenIds.add(jump.id)
  }

  const preservedJumps = new Set<ManifestJump>()
  if (preservedPaths) {
    for (const jump of manifest.jumps) {
      if (jump.files.some((f) => preservedPaths.has(f.path))) preservedJumps.add(jump)
    }
  }

  const preservedGroups: ManifestFile[][] = []
  const preservedFilePaths = new Set<string>()
  for (const jump of preservedJumps) {
    const sorted = sortFilesByMtime(jump.files)
    preservedGroups.push(sorted)
    for (const f of sorted) preservedFilePaths.add(f.path)
  }

  const remainingFiles = manifest.files.filter((f) => !preservedFilePaths.has(f.path))
  const sortedRemaining = sortFilesByMtime(remainingFiles)
  const groups: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0

  for (const file of sortedRemaining) {
    if (current.length > 0 && file.mtime - lastMtime > JUMP_GAP_SECONDS) {
      groups.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) groups.push(current)

  const allGroups = [...preservedGroups, ...groups].sort((a, b) => {
    const aMin = Math.min(...a.map((f) => f.mtime))
    const bMin = Math.min(...b.map((f) => f.mtime))
    return aMin - bMin
  })

  const mergedGroups: ManifestFile[][] = []
  for (const group of allGroups) {
    if (mergedGroups.length === 0) {
      mergedGroups.push([...group].sort((a, b) => a.mtime - b.mtime))
    } else {
      const last = mergedGroups[mergedGroups.length - 1]
      const lastMax = Math.max(...last.map((f) => f.mtime))
      const curMin = Math.min(...group.map((f) => f.mtime))
      if (curMin - lastMax <= JUMP_GAP_SECONDS) {
        last.push(...group)
        last.sort((a, b) => a.mtime - b.mtime)
      } else {
        mergedGroups.push([...group].sort((a, b) => a.mtime - b.mtime))
      }
    }
  }

  const previousByPath = new Map<string, ManifestJump>()
  for (const jump of manifest.jumps) {
    for (const file of jump.files) previousByPath.set(file.path, jump)
  }

  const usedIds = new Set<string>()
  for (const g of mergedGroups) {
    for (const f of g) {
      const prev = previousByPath.get(f.path)
      if (prev && preservedJumps.has(prev)) usedIds.add(prev.id)
    }
  }

  let nextIdx = 1
  const getNextId = (): string => {
    while (usedIds.has(`jump_${nextIdx}`)) nextIdx++
    const id = `jump_${nextIdx}`
    usedIds.add(id)
    nextIdx++
    return id
  }

  manifest.jumps = mergedGroups.map((files) => {
    const counts = new Map<string, number>()
    for (const file of files) {
      const prev = previousByPath.get(file.path)
      if (prev) counts.set(prev.id, (counts.get(prev.id) ?? 0) + 1)
    }

    let dominant: ManifestJump | undefined
    let dominantCount = 0
    for (const [jumpId, count] of counts) {
      if (count > dominantCount) {
        dominantCount = count
        dominant = manifest.jumps.find((j) => j.id === jumpId)
      }
    }

    const isPreserved = files.some((f) => preservedFilePaths.has(f.path))
    const preservedJump = isPreserved
      ? [...preservedJumps].find((j) => j.files.some((f) => files.includes(f)))
      : undefined

    if (preservedJump) {
      return {
        id: preservedJump.id,
        label: preservedJump.label,
        confirmed: preservedJump.confirmed,
        processed: preservedJump.processed,
        files
      }
    }

    return {
      id: dominant?.id ?? getNextId(),
      label: dominant?.label ?? `Jump ${nextIdx - 1}`,
      confirmed: dominant?.confirmed ?? false,
      processed: dominant?.processed,
      files
    }
  })
}

const shiftFiles = (manifest: Manifest, paths: Set<string>, offsetSeconds: number): void => {
  for (const file of manifest.files) {
    if (!paths.has(file.path)) continue
    if (file.originalMtime === undefined) file.originalMtime = file.mtime
    file.mtime += offsetSeconds
  }
  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (!paths.has(file.path)) continue
      if (file.originalMtime === undefined) file.originalMtime = file.mtime
      file.mtime += offsetSeconds
    }
  }
}

export { reclusterJumps, shiftFiles }
