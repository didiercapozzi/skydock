import { getOutputDir, loadManifest, processingNow, messageOf } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { deleteFromCameras, listCameras } from '../../../packages/skydock-scripts/src/cameraFiles'
import { copyAgain, stopCameraCopy } from '../../../packages/skydock-scripts/src/cameraWatch'

const loader = async () => Response.json({ cameras: await listCameras(getOutputDir()) })

const actionArgs = z.object({
  paths: z.array(z.string()).optional(),
  copy: z.string().optional(),
  stop: z.boolean().optional()
})

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
        outputDir: getOutputDir()
      })
      return { deleted, cameras: await listCameras(getOutputDir()) }
    } catch (e) {
      errors.addGlobalError(messageOf(e))
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs, loader }
