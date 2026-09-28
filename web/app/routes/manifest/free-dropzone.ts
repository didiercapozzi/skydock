import { ensureNasSession, processingNow, saveManifest, messageOf } from '@skydock/scripts'
import {
  freeDropzone,
  markDropzoneFreed
} from '../../../../packages/skydock-scripts/src/freeDropzone'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Delete what of a dropzone is on the storage from this machine, once the storage is proved to hold
   it (RULES, Freeing space). The proof is the storage's own checksum, so it has to be reachable. */
const freeDropzoneIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  latest
}) => {
  const destination = data.destination ?? ''
  const session = await ensureNasSession()
  if (!session)
    return refuse('Connect the storage first — freeing needs it to prove it holds the files.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  try {
    const result = await freeDropzone({ manifest, outputDir, destination, session })
    /* checking gigabytes takes a while; whatever was saved meanwhile is kept */
    const saved = latest()
    markDropzoneFreed(saved, result)
    saveManifest(manifestPath, saved)
    return {
      ...boardAnswer(saved),
      freedPlace: {
        place: destination,
        bytes: result.bytes,
        files: result.fileIds.length,
        kept: result.kept
      }
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { freeDropzoneIntent }
