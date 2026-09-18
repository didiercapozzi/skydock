import { saveManifest, shiftFiles } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A jump's files move in time together, so that its earliest file lands on the anchor (RULES,
   Times and dates). */
const shiftGroupTime: Intent = ({ data, manifest, manifestPath, frozen, refuse, refuseFrozen }) => {
  if (frozen.has(data.groupId ?? '')) return refuseFrozen()
  if (!data.groupId) return refuse('Shift needs a group id.')
  if (data.anchorEpoch === undefined || !Number.isFinite(data.anchorEpoch))
    return refuse('Shift needs a valid anchor time.')
  const target = manifest.groups.find((g) => g.id === data.groupId)
  if (!target) return refuse('Group not found.')
  if (target.files.length === 0) return refuse('Group has no files.')
  const min = Math.min(...target.files.map((f) => f.mtime))
  const offset = Math.round(data.anchorEpoch) - min
  if (offset !== 0) {
    const ids = new Set<string>()
    for (const f of target.files) if (f.id) ids.add(f.id)
    shiftFiles(manifest, ids, offset)
  }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { shiftGroupTime }
