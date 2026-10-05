import {
  getManifestPath,
  getOutputDir,
  keepBoardStep,
  loadManifest,
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
  handler: async ({ data }) => {
    const outputDir = getOutputDir()
    if (data.cameras !== false) copyAgain(outputDir)
    keepBoardStep(getManifestPath(outputDir))
    const result = await scanMedia({ outputDir })
    void catchUp(outputDir)
    const manifest = loadManifest(getManifestPath(outputDir))
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
