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
/* server-only: it shells out to ffmpeg, so it is imported here rather than through the barrel the
   browser evaluates */
import { catchUp } from '../../../packages/skydock-scripts/src/catchUp'
import { copyAgain } from '../../../packages/skydock-scripts/src/cameraWatch'
import { boardAnswer } from '../helpers/manifest'

/* `cameras: false` is a scan alone, for a work folder being looked through for the first time: nothing is
   copied from a camera then, since nobody has asked */
const actionArgs = z.object({ cameras: z.boolean().optional() })

/* Rescan cameras: every camera plugged in is copied again — what is already here is passed over, so
   only what is missing comes across — and the output folder is scanned. A scan rewrites the whole
   registry, so it answers with the board's data like every other change rather than leaving the page
   to guess what moved (RULES, The workflow). The copy goes on behind the answer, shown in the header
   as a camera being plugged in is, and scans what it brought when it ends. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const outputDir = getOutputDir()
    /* a record that cannot be read is left as it is: a scan would build it again from the files */
    if (readRecord(getManifestPath(outputDir)).unreadable) {
      errors.addGlobalError(RECORD_UNREADABLE)
      return errors.toResponse(422)
    }
    if (data.cameras !== false) copyAgain(outputDir)
    const result = await scanMedia({ outputDir })
    /* Proxies are built behind the answer, not inside it: transcoding a card of clips takes
       minutes, and everything works without them meanwhile — the crop bar falls back to the clip
       itself and the editor makes its own. Each one appears on the next thing the board asks. */
    void catchUp(outputDir)
    const manifest = loadManifest(getManifestPath(outputDir))
    return { scan: result, ...(manifest ? boardAnswer(manifest) : { groups: [] }) }
  }
})

export { action, actionArgs }
