import { busyWith, saveManifest, messageOf } from '@skydock/scripts'
import {
  deleteMontage,
  resetMontage,
  startEditAgain
} from '../../../../packages/skydock-scripts/src/resetMontage'
import type { Manifest } from '@skydock/scripts'
import type { ActionData } from './args'
import type { Intent } from './change'
import { boardAnswer } from '../../helpers/manifest'

/* Back to before processing, keeping every decision — or undone altogether (RULES, Taking a montage
   back). Not while its folder is being written: taking it away underneath would leave half of it. */
const takeBack =
  (
    take: (
      manifest: Manifest,
      outputDir: string,
      groupId: string,
      data: ActionData
    ) => Promise<unknown>
  ): Intent =>
  async ({ data, manifest, manifestPath, outputDir, refuse }) => {
    const busy = busyWith({ groupIds: [data.groupId ?? ''] })
    if (busy)
      return refuse(
        busy === 'processing'
          ? 'This montage is being processed — wait for it to finish.'
          : 'This montage is being uploaded — wait for it to finish.'
      )
    try {
      await take(manifest, outputDir, data.groupId ?? '', data)
    } catch (e) {
      return refuse(messageOf(e))
    }
    await saveManifest(manifestPath, manifest)
    return boardAnswer(manifest)
  }

const resetMontageIntent = takeBack(resetMontage)
const deleteMontageIntent = takeBack(deleteMontage)
const startEditAgainIntent = takeBack((manifest, outputDir, groupId, data) =>
  startEditAgain(manifest, outputDir, groupId, data.edit)
)

export { deleteMontageIntent, resetMontageIntent, startEditAgainIntent }
