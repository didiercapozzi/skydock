import { mergeGroups, saveManifest, shiftGroupTo } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Two jumps become one, and the one may be re-timed in the same move so that it starts, by its own run, at the anchor. */
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
  const merged = manifest.groups.find((g) => g.id === data.leftId)
  if (merged && data.anchorEpoch !== undefined && Number.isFinite(data.anchorEpoch))
    shiftGroupTo(manifest, merged, data.anchorEpoch)
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { mergeGroupsIntent }
