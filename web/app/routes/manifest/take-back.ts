import { busyWith, saveManifest, messageOf } from '@skydock/scripts'
import {
  deleteMontage,
  resetMontage,
  shotTimesBack
} from '../../../../packages/skydock-scripts/src/resetMontage'
import type { Intent } from './change'
import { boardAnswer } from '../../helpers/manifest'

/* Back to before processing, keeping every decision — or undone altogether (RULES, Taking a montage
   back). Not while its folder is being written: taking it away underneath would leave half of it. */
const takeBack =
  (take: typeof deleteMontage, needsCameraTimes: boolean): Intent =>
  async ({ data, manifest, manifestPath, outputDir, refuse }) => {
    const busy = busyWith({ groupIds: [data.groupId ?? ''] })
    if (busy)
      return refuse(
        busy === 'processing'
          ? 'This montage is being processed — wait for it to finish.'
          : 'This montage is being uploaded — wait for it to finish.'
      )
    try {
      /* what deleting sends back to be sorted goes back on its camera's time, asked of exiftool first */
      const shot = needsCameraTimes
        ? await shotTimesBack(manifest, outputDir, data.groupId ?? '')
        : undefined
      take(manifest, outputDir, data.groupId ?? '', shot)
    } catch (e) {
      return refuse(messageOf(e))
    }
    saveManifest(manifestPath, manifest)
    return boardAnswer(manifest)
  }

const resetMontageIntent = takeBack(resetMontage, false)
const deleteMontageIntent = takeBack(deleteMontage, true)

export { deleteMontageIntent, resetMontageIntent }
