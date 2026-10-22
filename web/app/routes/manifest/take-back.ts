import { jumpsOfMontage, saveManifest, messageOf } from '@skydock/scripts'
import {
  deleteMontage,
  resetMontage,
  startEditAgain
} from '../../../../packages/skydock-scripts/src/resetMontage'
import { forgetWatched } from '../../../../packages/skydock-scripts/src/montageWatch'
import type { Manifest } from '@skydock/scripts'
import type { ActionData } from './args'
import type { Intent } from './change'
import { boardAnswer } from '../../helpers/manifest'

/* Back to just named, keeping every decision — or undone altogether (RULES, Taking a montage
   back). Not while any jump of its folder is being processed, uploaded or rendered: taking it away
   underneath would leave half of it. */
const takeBack =
  (
    take: (
      manifest: Manifest,
      outputDir: string,
      groupId: string,
      data: ActionData
    ) => Promise<{ groupIds: string[] }>
  ): Intent =>
  async ({ data, manifest, manifestPath, outputDir, refuse, refuseBusy }) => {
    const busy = refuseBusy({ groupIds: jumpsOfMontage(manifest, outputDir, data.groupId ?? '') })
    if (busy) return busy
    try {
      forgetWatched((await take(manifest, outputDir, data.groupId ?? '', data)).groupIds)
    } catch (e) {
      return refuse(messageOf(e))
    }
    await saveManifest(manifestPath, manifest)
    return boardAnswer(manifest)
  }

const resetMontageIntent = takeBack(resetMontage)
const deleteMontageIntent = takeBack(deleteMontage)
const startEditAgainIntent = takeBack(startEditAgain)

export { deleteMontageIntent, resetMontageIntent, startEditAgainIntent }
