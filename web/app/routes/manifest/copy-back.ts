import { loadManifest, scanMedia } from '@skydock/scripts'
import { copyBack } from '../../../../packages/skydock-scripts/src/copy'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files this machine gave back, asked for again from the card they are still on.

   Freeing is deliberate: the original goes once the storage is proved to hold it, and plugging the
   camera in again passes it over rather than undoing that choice (RULES, Freeing space). This is
   the one way back, and it is asked for file by file. What comes back rejoins the jump it was in —
   the scan knows it by what it contains, not by what it is called — and reads as local again, its
   delivered copy having gone with the freeing. */
const copyBackIntent: Intent = async ({ data, manifestPath, outputDir, refuse }) => {
  const paths = data.paths ?? []
  if (paths.length === 0) return refuse('Nothing was asked for.')
  try {
    const back = await copyBack({ paths, outputDir })
    await scanMedia({ outputDir })
    const after = loadManifest(manifestPath)
    if (!after) return refuse('The registry could not be read after copying.')
    return { ...boardAnswer(after), copiedBack: { copied: back.copied, skipped: back.skipped } }
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}

export { copyBackIntent }
