import { getOutputDir, loadManifest, scanMedia } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
/* server-only: it shells out to ffmpeg, so it is imported here rather than through the barrel the
   browser evaluates */
import { buildMissingProxies } from '../../../packages/skydock-scripts/src/proxy'
import { boardAnswer } from '../helpers/manifest'

const actionArgs = z.object({})

/* A scan rewrites the whole registry, so it answers with the board's data like every other change
   rather than leaving the page to guess what moved (RULES, The workflow). */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async () => {
    const outputDir = getOutputDir()
    const result = await scanMedia({ outputDir })
    /* Proxies are built behind the answer, not inside it: transcoding a card of clips takes
       minutes, and everything works without them meanwhile — the crop bar falls back to the clip
       itself and the editor makes its own. Each one appears on the next thing the board asks. */
    void buildMissingProxies(outputDir).catch((e: unknown) => {
      console.error('[Proxy] pass failed:', e instanceof Error ? e.message : String(e))
    })
    const manifest = loadManifest(`${outputDir}/manifest.json`)
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
