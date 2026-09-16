import { getOutputDir, loadManifest, scanMedia } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { boardAnswer } from '../helpers/manifest'

const actionArgs = z.object({})

/* A scan rewrites the whole registry, so it answers with the board's data like every other change
   rather than leaving the page to guess what moved (RULES, The workflow). */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async () => {
    const outputDir = getOutputDir()
    const result = await scanMedia({ outputDir })
    const manifest = loadManifest(`${outputDir}/manifest.json`)
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
