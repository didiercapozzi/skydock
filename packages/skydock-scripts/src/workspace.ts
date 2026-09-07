import type { ManifestFile, ManifestJump, ManifestPassenger } from './types'

const hasCompletePassenger = (passenger: ManifestPassenger | null | undefined): boolean => {
  if (!passenger) return false
  return (
    passenger.firstname.trim() !== '' &&
    passenger.lastname.trim() !== '' &&
    passenger.email.trim() !== ''
  )
}

const formatJumpDay = (mtime: number): string => {
  const d = new Date(mtime * 1000)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}${month}${day}`
}

const buildJumpBaseName = (
  passenger: ManifestPassenger | null | undefined,
  label: string,
  minMtime: number
): string => {
  const raw =
    passenger && passenger.firstname.trim() !== '' && passenger.lastname.trim() !== ''
      ? `${passenger.firstname.trim()}_${passenger.lastname.trim()}`
      : label
  const stem = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${stem === '' ? 'jump' : stem}_${formatJumpDay(minMtime)}`
}

const moveFilesBetweenJumps = (
  jumps: ManifestJump[],
  files: ManifestFile[],
  groups: Record<string, string[]>,
  targetJumpId: string,
  action: 'move' | 'copy'
): ManifestJump[] => {
  const byPath = new Map<string, ManifestFile>()
  for (const f of files) byPath.set(f.path, f)
  const allPaths = Object.values(groups).flat()
  return jumps.map((j) => {
    const sourcePaths = groups[j.id]
    let next =
      sourcePaths && action === 'move'
        ? j.files.filter((f) => !sourcePaths.includes(f.path))
        : j.files
    if (j.id === targetJumpId) {
      const additions: ManifestFile[] = []
      for (const p of allPaths) {
        const f = byPath.get(p)
        if (f && !next.some((x) => x.path === f.path)) additions.push(f)
      }
      next = [...next, ...additions]
    }
    return next === j.files ? j : { ...j, files: next }
  })
}

const reorderFilesInJump = (
  jumps: ManifestJump[],
  jumpId: string,
  paths: string[],
  toIndex: number
): ManifestJump[] =>
  jumps.map((j) => {
    if (j.id !== jumpId) return j
    const moved = j.files.filter((f) => paths.includes(f.path))
    if (moved.length === 0) return j
    const remaining = j.files.filter((f) => !paths.includes(f.path))
    const draggedBefore = j.files.slice(0, toIndex).filter((f) => paths.includes(f.path)).length
    const insertAt = Math.max(0, toIndex - draggedBefore)
    return {
      ...j,
      files: [...remaining.slice(0, insertAt), ...moved, ...remaining.slice(insertAt)]
    }
  })

const mergeJumps = (jumps: ManifestJump[], leftId: string, rightId: string): ManifestJump[] => {
  if (leftId === rightId) return jumps
  const left = jumps.find((j) => j.id === leftId)
  const right = jumps.find((j) => j.id === rightId)
  if (!left || !right) return jumps
  const seen = new Set(left.files.map((f) => f.path))
  const additions = right.files.filter((f) => !seen.has(f.path))
  const files = [...left.files, ...additions].sort((a, b) => a.mtime - b.mtime)
  return jumps
    .filter((j) => j.id !== rightId)
    .map((j) =>
      j.id === leftId
        ? {
            ...j,
            files,
            confirmed: left.confirmed && right.confirmed,
            processed: false,
            passenger: left.passenger ?? right.passenger ?? undefined,
            publish: undefined
          }
        : j
    )
}

export {
  buildJumpBaseName,
  hasCompletePassenger,
  mergeJumps,
  moveFilesBetweenJumps,
  reorderFilesInJump
}
