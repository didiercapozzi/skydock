import {
  ensureNasSession,
  getOutputDir,
  loadManifest,
  processingNow,
  messageOf
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { deleteFromCameras, listCameras } from '../../../packages/skydock-scripts/src/cameraFiles'
import { copyAgain, stopCameraCopy } from '../../../packages/skydock-scripts/src/cameraWatch'

/* What is on the cameras plugged in, each file saying whether it is copied here, and on the storage. */
const loader = async () => Response.json({ cameras: await listCameras(getOutputDir()) })

/* what is picked on a camera's page to be deleted from it — or the camera, to be copied again */
const actionArgs = z.object({
  paths: z.array(z.string()).optional(),
  copy: z.string().optional(),
  /* the camera copy under way, and those waiting, stopped */
  stop: z.boolean().optional()
})

/* A camera's files deleted from it, into the bin, once each is proved to be on the storage, or its
   copy here to be in the bin, by its bytes (RULES, Seeing what is on a camera). All or nothing, with
   every file that is not named. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    if (data.stop) {
      if (!stopCameraCopy()) {
        errors.addGlobalError('No camera is being copied.')
        return errors.toResponse(422)
      }
      return { stopping: true }
    }
    /* Copied again while it stays plugged in, as plugging it in copies it: what is here already is
       passed over. The copy goes on behind the answer, shown in the header. */
    if (data.copy) {
      if (copyAgain(getOutputDir(), data.copy) === 0) {
        errors.addGlobalError('This camera is not plugged in any more.')
        return errors.toResponse(422)
      }
      return { copying: data.copy }
    }
    if (processingNow()) {
      errors.addGlobalError('Something is being processed — wait for it to finish.')
      return errors.toResponse(422)
    }
    const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
    if (!manifest) {
      errors.addGlobalError('Nothing has been scanned yet.')
      return errors.toResponse(422)
    }
    try {
      const deleted = await deleteFromCameras({
        paths: data.paths ?? [],
        manifest,
        /* only a file uploaded needs the storage to prove it */
        connect: ensureNasSession
      })
      return { deleted, cameras: await listCameras(getOutputDir()) }
    } catch (e) {
      errors.addGlobalError(messageOf(e))
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs, loader }
