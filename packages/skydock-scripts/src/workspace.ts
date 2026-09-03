import type { ManifestFile, ManifestJump } from './types'

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

export { moveFilesBetweenJumps, reorderFilesInJump }
