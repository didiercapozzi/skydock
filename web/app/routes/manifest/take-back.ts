import { processingNow, saveManifest } from '@skydock/scripts'
import { deleteMontage, resetMontage } from '../../../../packages/skydock-scripts/src/resetMontage'
import type { Intent } from './change'
import { boardAnswer } from '../../helpers/manifest'
import { messageOf } from '@skydock/scripts'

/* Back to before processing, keeping every decision — or undone altogether (RULES, Taking a montage
   back). Not while its folder is being written: taking it away underneath would leave half of it. */
const takeBack =
  (take: typeof resetMontage): Intent =>
  ({ data, manifest, manifestPath, outputDir, refuse }) => {
    const running = processingNow()
    if (running && (running.groupIds.length === 0 || running.groupIds.includes(data.groupId ?? '')))
      return refuse('This montage is being processed — wait for it to finish.')
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
