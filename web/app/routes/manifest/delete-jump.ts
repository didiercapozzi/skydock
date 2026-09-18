import { processingNow, saveManifest } from '@skydock/scripts'
import { deleteJump } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A jump is deleted and its files go back to Unsorted, loose (RULES, Jumps). Not a tandem with an
   edit, not one freed to the storage, not files already uploaded — uploaded is the end of editing —
   and not while something is being processed underneath it. */
const deleteJumpIntent: Intent = ({
  data,
  manifest,
  manifestPath,
  frozen,
  refuse,
  refuseFrozen
}) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('That jump is no longer on the board.')
  if (frozen.has(group.id)) return refuseFrozen()
  if (group.freed)
    return refuse('This jump is on the storage only — there is nothing here to move.')
  if (group.uploaded || group.files.some((f) => f.uploaded))
    return refuse('This jump is on the storage — uploaded is the end of editing.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  deleteJump(manifest, group.id)
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { deleteJumpIntent }
