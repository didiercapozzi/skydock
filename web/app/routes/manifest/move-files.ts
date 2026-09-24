import { saveManifest, UPLOADED_LOCKED } from '@skydock/scripts'
import { moveFiles } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files go from wherever they are into a jump, a new jump or a place — the one move a drag on the
   board and a drop from the computer both make (RULES, Jumps). */
const moveFilesIntent: Intent = ({
  data,
  manifest,
  manifestPath,
  frozen,
  frozenFiles,
  refuse,
  refuseFrozen
}) => {
  const ids = new Set(data.fileIds ?? [])
  if (ids.size === 0) return refuse('Select at least one file to move.')
  if ([...ids].some((id) => frozenFiles.has(id)) || frozen.has(data.targetGroupId ?? ''))
    return refuseFrozen()
  /* uploaded is the end of editing, and moving is editing where a file belongs (RULES, File status) */
  if (manifest.files.some((f) => f.id && ids.has(f.id) && (f.uploaded || f.freed)))
    return refuse(UPLOADED_LOCKED)
  try {
    moveFiles(manifest, ids, {
      targetGroupId: data.targetGroupId,
      newGroup: data.newGroup,
      montage: data.montage,
      destination: data.destination,
      name: data.name,
      startsAt: data.anchorEpoch
    })
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { moveFilesIntent }
