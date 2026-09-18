import { mergeGroups, saveManifest, shiftFiles } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Two jumps become one, and the one may be re-timed to an anchor in the same move. */
const mergeGroupsIntent: Intent = ({
  data,
  manifest,
  manifestPath,
  frozen,
  refuse,
  refuseFrozen
}) => {
  if (frozen.has(data.leftId ?? '') || frozen.has(data.rightId ?? '')) return refuseFrozen()
  if (!data.leftId || !data.rightId) return refuse('Merge needs two group ids.')
  manifest.groups = mergeGroups(manifest.groups, data.leftId, data.rightId)
  if (data.anchorEpoch !== undefined && Number.isFinite(data.anchorEpoch)) {
    const merged = manifest.groups.find((g) => g.id === data.leftId)
    if (merged && merged.files.length > 0) {
      const min = Math.min(...merged.files.map((f) => f.mtime))
      const offset = Math.round(data.anchorEpoch) - min
      if (offset !== 0) {
        const ids = new Set<string>()
        for (const f of merged.files) if (f.id) ids.add(f.id)
        shiftFiles(manifest, ids, offset)
      }
    }
  }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { mergeGroupsIntent }
