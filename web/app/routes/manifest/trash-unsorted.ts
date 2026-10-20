import { saveManifest, messageOf, busyWithFiles, busySaid } from '@skydock/scripts'
import {
  dropFromBoard,
  trashUnsorted
} from '../../../../packages/skydock-scripts/src/trashUnsorted'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files nobody wants go to the bin, from Fresh files or out of a montage (RULES, Putting files in the
   bin). Not while a jump or a place holding one of them, or a copy of one, is being processed,
   uploaded or rendered: a file taken away underneath would leave what is made of it half made. Not out of a montage with an edit, whose project names its clips. */
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
  const busy = busyWithFiles(manifest, ids)
  if (busy) return refuse(busySaid(busy))
  try {
    await trashUnsorted(manifest, ids, outputDir)
  } catch (e) {
    return refuse(messageOf(e))
  }
  const board = await latest()
  dropFromBoard(board, ids)
  await saveManifest(manifestPath, board)
  return boardAnswer(board)
}

export { trashUnsortedIntent }
