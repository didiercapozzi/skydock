import { getOutputDir, loadManifestAsync, processingNow, messageOf } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import {
  deleteFromCameras,
  listCameras,
  lookAtCameras
} from '../../../packages/skydock-scripts/src/cameraFiles'
import { ejectCamera } from '../../../packages/skydock-scripts/src/ejectCamera'
import {
  answerCamera,
  copyAgain,
  stopCameraCopy
} from '../../../packages/skydock-scripts/src/cameraWatch'

const loader = async () => Response.json({ cameras: await lookAtCameras(getOutputDir()) })

const actionArgs = z.object({
  paths: z.array(z.string()).optional(),
  copy: z.string().optional(),
  stop: z.boolean().optional(),
  remember: z.object({ key: z.string(), auto: z.boolean(), copy: z.boolean() }).optional(),
  forget: z.string().optional(),
  auto: z.object({ key: z.string(), on: z.boolean() }).optional(),
  eject: z.string().optional(),
  copyFiles: z.object({ mount: z.string(), paths: z.array(z.string()) }).optional()
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
    if (data.remember) {
      await answerCamera(getOutputDir(), { remember: data.remember.key, ...data.remember })
      return { remembered: data.remember.key }
    }
    if (data.forget) {
      await answerCamera(getOutputDir(), { forget: data.forget })
      return { forgotten: data.forget }
    }
    if (data.auto) {
      await answerCamera(getOutputDir(), { auto: data.auto })
      return { auto: data.auto }
    }
    if (data.eject) {
      const done = await ejectCamera(data.eject)
      if (!done.ok) {
        errors.addGlobalError(done.reason)
        return errors.toResponse(422)
      }
      return { ejected: data.eject }
    }
    if (data.copyFiles) {
      if (data.copyFiles.paths.length === 0) {
        errors.addGlobalError('Nothing is picked to copy.')
        return errors.toResponse(422)
      }
      if (
        (await copyAgain(
          getOutputDir(),
          data.copyFiles.mount,
          undefined,
          new Set(data.copyFiles.paths)
        )) === 0
      ) {
        errors.addGlobalError('This camera is not plugged in any more.')
        return errors.toResponse(422)
      }
      return { copying: data.copyFiles.mount }
    }
    if (data.copy) {
      if ((await copyAgain(getOutputDir(), data.copy)) === 0) {
        errors.addGlobalError('This camera is not plugged in any more.')
        return errors.toResponse(422)
      }
      return { copying: data.copy }
    }
    if (processingNow()) {
      errors.addGlobalError('Something is being processed — wait for it to finish.')
      return errors.toResponse(422)
    }
    const manifest = await loadManifestAsync(`${getOutputDir()}/manifest.json`)
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
