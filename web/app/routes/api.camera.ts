import { ensureNasSession, getOutputDir, loadManifest, processingNow } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { deleteFromCameras, listCameras } from '../../../packages/skydock-scripts/src/cameraFiles'
import { messageOf } from '@skydock/scripts'

/* What is on the cameras plugged in, each file saying whether it is copied here, and on the storage. */
const loader = async () => Response.json({ cameras: await listCameras(getOutputDir()) })

const actionArgs = z.object({ paths: z.array(z.string()) })

/* A camera's files deleted from it, into the bin, once each is proved to be on the storage, by its
   bytes (RULES, Seeing what is on a camera). All or nothing, with every file that is not named. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    if (processingNow()) {
      errors.addGlobalError('Something is being processed — wait for it to finish.')
      return errors.toResponse(422)
    }
    const session = await ensureNasSession()
    if (!session) {
      errors.addGlobalError(
        'Connect the NAS first — deleting from the camera needs it to prove it holds the files.'
      )
      return errors.toResponse(422)
    }
    const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
    if (!manifest) {
      errors.addGlobalError('Nothing has been scanned yet.')
      return errors.toResponse(422)
    }
    try {
      const deleted = await deleteFromCameras({ paths: data.paths, manifest, session })
      return { deleted, cameras: await listCameras(getOutputDir()) }
    } catch (e) {
      errors.addGlobalError(messageOf(e))
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs, loader }
