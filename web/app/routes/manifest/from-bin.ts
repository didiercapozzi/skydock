import { loadManifest, scanMedia } from '@skydock/scripts'
import { messageOf } from '@skydock/scripts'
import { bringBackFromBin } from '../../../../packages/skydock-scripts/src/bin'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Files taken back out of the bin (RULES, Putting files in the bin): moved into the originals under
   the day each was shot, and scanned, which puts them in Fresh files as a scan puts any new file.
   A file whose footage is on the board already stays in the bin and is named. */
const fromBinIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const paths = data.paths ?? []
  if (paths.length === 0) return refuse('Pick the files to bring back.')
  try {
    const { back, kept } = await bringBackFromBin({ paths, manifest, outputDir })
    if (back.length > 0) await scanMedia({ outputDir })
    const after = loadManifest(manifestPath)
    if (!after) return refuse('The registry could not be read after bringing them back.')
    return { ...boardAnswer(after), fromBin: { back: back.length, kept } }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { fromBinIntent }
