import { processingNow, saveManifest, messageOf } from '@skydock/scripts'
import {
  dropFromBoard,
  trashUnsorted
} from '../../../../packages/skydock-scripts/src/trashUnsorted'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files nobody wants go to the bin, from Fresh files or out of a montage (RULES, Putting files in the
   bin). Not while something is being processed: a file taken away underneath would leave its copy
   half written. Not out of a montage with an edit, whose project names its clips. */
const trashUnsortedIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  frozenFiles,
  refuse,
  refuseFrozen,
  latest
}) => {
  const ids = new Set(data.fileIds ?? [])
  if (ids.size === 0) return refuse('Select at least one file to put in the bin.')
  if ([...ids].some((id) => frozenFiles.has(id))) return refuseFrozen()
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  try {
    await trashUnsorted(manifest, ids, outputDir)
  } catch (e) {
    return refuse(messageOf(e))
  }
  /* the files are moved; they come off the board as it is now */
  const board = latest()
  dropFromBoard(board, ids)
  saveManifest(manifestPath, board)
  return boardAnswer(board)
}

export { trashUnsortedIntent }
