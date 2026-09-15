import type { ManifestGroup, SelectionMap } from '../components/types'
import type { ManifestFile } from '../components/types'

type UpdateArgs = {
  groupId: string
  filePath: string
  ctrlKey: boolean
  shiftKey: boolean
  prevLast: string | null
  allPaths: string[]
  unassignedFiles: ManifestFile[]
  groups: ManifestGroup[]
}

const updateSelection = (prev: SelectionMap, args: UpdateArgs) => {
  const { groupId, filePath, ctrlKey, shiftKey, prevLast, allPaths, unassignedFiles, groups } = args
  const next: SelectionMap = {}
  for (const [k, v] of Object.entries(prev)) next[k] = { ...v }

  if (shiftKey && prevLast) {
    const sIdx = allPaths.indexOf(prevLast)
    const eIdx = allPaths.indexOf(filePath)
    if (sIdx !== -1 && eIdx !== -1) {
      const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
      for (let i = from; i <= to; i++) {
        const p = allPaths[i]
        const gid = unassignedFiles.some((f) => f.path === p)
          ? 'unassigned'
          : (groups.find((g) => g.files.some((f) => f.path === p))?.id ?? groupId)
        if (!next[gid]) next[gid] = {}
        else next[gid] = { ...next[gid] }
        next[gid][p] = true
      }
      return next
    }
  }

  if (!next[groupId]) next[groupId] = {}
  else next[groupId] = { ...next[groupId] }

  if (next[groupId][filePath]) {
    const g = { ...next[groupId] }
    delete g[filePath]
    if (Object.keys(g).length === 0) delete next[groupId]
    else next[groupId] = g
  } else {
    next[groupId] = { ...next[groupId], [filePath]: true }
  }

  if (!ctrlKey && Object.keys(next[groupId] ?? {}).length > 0) {
    for (const k of Object.keys(next)) {
      if (k !== groupId) delete next[k]
    }
  }

  return next
}

export { updateSelection }
export type { UpdateArgs }
