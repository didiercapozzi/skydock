import {
  getManifestPath,
  getOutputDir,
  keepBoardStep,
  loadManifest,
  scanMedia,
  messageOf
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
/* server-only: it shells out to ffmpeg, so it is imported here rather than through the barrel the
   browser evaluates */
import { buildMissingProxies } from '../../../packages/skydock-scripts/src/proxy'
import { copyAgain } from '../../../packages/skydock-scripts/src/cameraWatch'
import { boardAnswer } from '../helpers/manifest'

const actionArgs = z.object({})

/* Rescan cameras: every camera plugged in is copied again — what is already here is passed over, so
   only what is missing comes across — and the output folder is scanned. A scan rewrites the whole
   registry, so it answers with the board's data like every other change rather than leaving the page
   to guess what moved (RULES, The workflow). The copy goes on behind the answer, shown in the header
   as a camera being plugged in is, and scans what it brought when it ends. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async () => {
    const outputDir = getOutputDir()
    copyAgain(outputDir)
    /* a scan can regroup what was not filed: one more step to go back to */
    keepBoardStep(getManifestPath(outputDir))
    const result = await scanMedia({ outputDir })
    /* Proxies are built behind the answer, not inside it: transcoding a card of clips takes
       minutes, and everything works without them meanwhile — the crop bar falls back to the clip
       itself and the editor makes its own. Each one appears on the next thing the board asks. */
    void buildMissingProxies(outputDir).catch((e: unknown) => {
      console.error('[Proxy] pass failed:', messageOf(e))
    })
    const manifest = loadManifest(getManifestPath(outputDir))
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
