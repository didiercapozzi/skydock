import { busyWith, saveManifest, messageOf } from '@skydock/scripts'
import { deleteMontage, resetMontage } from '../../../../packages/skydock-scripts/src/resetMontage'
import type { Intent } from './change'
import { boardAnswer } from '../../helpers/manifest'

/* Back to before processing, keeping every decision — or undone altogether (RULES, Taking a montage
   back). Not while its folder is being written: taking it away underneath would leave half of it. */
const takeBack =
  (take: typeof resetMontage): Intent =>
  ({ data, manifest, manifestPath, outputDir, refuse }) => {
    const busy = busyWith({ groupIds: [data.groupId ?? ''] })
    if (busy)
      return refuse(
        busy === 'processing'
          ? 'This montage is being processed — wait for it to finish.'
          : 'This montage is being uploaded — wait for it to finish.'
      )
    try {
      take(manifest, outputDir, data.groupId ?? '')
    } catch (e) {
      return refuse(messageOf(e))
    }
    saveManifest(manifestPath, manifest)
    return boardAnswer(manifest)
  }

const resetMontageIntent = takeBack(resetMontage)
const deleteMontageIntent = takeBack(deleteMontage)

export { deleteMontageIntent, resetMontageIntent }
