import { ensureNasSession, saveManifest, messageOf } from '@skydock/scripts'
import {
  freeDropzone,
  markDropzoneFreed
} from '../../../../packages/skydock-scripts/src/freeDropzone'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Intent } from './change'

/* Delete what of a dropzone is on the storage from this machine, once the storage is proved to hold
   it (RULES, Freeing space). The proof is the storage's own checksum, so it has to be reachable. Not
   while that place, or a jump filed there, is being processed or uploaded. */
const freeDropzoneIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  refuseBusy,
  latest
}) => {
  const destination = data.destination ?? ''
  const busy = refuseBusy({
    destination,
    groupIds: manifest.groups.filter((g) => g.destination === destination).map((g) => g.id)
  })
  if (busy) return busy
  const session = await ensureNasSession()
  if (!session) return refuse(connectFirst('freeing needs it to prove it holds the files'))
  try {
    const result = await freeDropzone({ manifest, outputDir, destination, session })
    const saved = await latest()
    markDropzoneFreed(saved, result)
    await saveManifest(manifestPath, saved)
    return {
      ...(await boardAnswer(saved)),
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
