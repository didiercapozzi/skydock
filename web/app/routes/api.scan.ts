import {
  getManifestPath,
  getOutputDir,
  loadManifestAsync,
  readRecordAsync,
  RECORD_UNREADABLE,
  scanMedia
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { catchUp } from '../../../packages/skydock-scripts/src/catchUp'
import { copyAgain } from '../../../packages/skydock-scripts/src/cameraWatch'
import { boardAnswer } from '../helpers/manifest'

const actionArgs = z.object({ cameras: z.boolean().optional() })

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const outputDir = getOutputDir()
    if ((await readRecordAsync(getManifestPath(outputDir))).unreadable) {
      errors.addGlobalError(RECORD_UNREADABLE)
      return errors.toResponse(422)
    }
    if (data.cameras !== false) copyAgain(outputDir)
    const result = await scanMedia({ outputDir })
    void catchUp(outputDir)
    const manifest = await loadManifestAsync(getManifestPath(outputDir))
    return { scan: result, ...(manifest ? await boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
