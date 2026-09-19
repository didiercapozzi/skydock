import { processingNow, saveManifest } from '@skydock/scripts'
import { trashUnsorted } from '../../../../packages/skydock-scripts/src/trashUnsorted'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Unsorted files nobody wants go to the bin (RULES, Putting files in the bin). Not while something
   is being processed: a file taken away underneath would leave its copy half written. */
const trashUnsortedIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const ids = new Set(data.fileIds ?? [])
  if (ids.size === 0) return refuse('Select at least one file to put in the bin.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  try {
    await trashUnsorted(manifest, ids, outputDir)
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { trashUnsortedIntent }
