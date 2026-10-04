import { saveManifest, UPLOADED_LOCKED, messageOf } from '@skydock/scripts'
import { moveFiles, shotTimesFor } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files go from wherever they are into a jump, a new jump or a place — the one move a drag on the
   board and a drop from the computer both make (RULES, Jumps). */
const moveFilesIntent: Intent = async ({
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
    const to = {
      targetGroupId: data.targetGroupId,
      newGroup: data.newGroup,
      montage: data.montage,
      destination: data.destination,
      name: data.name,
      startsAt: data.anchorEpoch
    }
    /* back to be sorted, a file goes on its camera's time, which exiftool is asked for beside the board */
    moveFiles(manifest, ids, { ...to, shot: await shotTimesFor(manifest, ids, to) })
  } catch (e) {
    return refuse(messageOf(e))
  }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { moveFilesIntent }
