import {
  getManifestPath,
  getOutputDir,
  loadManifest,
  readRecord,
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
    if (readRecord(getManifestPath(outputDir)).unreadable) {
      errors.addGlobalError(RECORD_UNREADABLE)
      return errors.toResponse(422)
    }
    if (data.cameras !== false) copyAgain(outputDir)
    const result = await scanMedia({ outputDir })
    void catchUp(outputDir)
    const manifest = loadManifest(getManifestPath(outputDir))
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
