import { saveManifest } from '@skydock/scripts'
import { resetFresh, resetFreshTimes } from '../../../../packages/skydock-scripts/src/resetFresh'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Fresh files put back as a scan would first have left them (RULES, Jumps). Not while something is
   being processed: what is made from a file must not have the file changed underneath it. */
const resetFreshIntent: Intent = async ({ data, manifest, manifestPath, refuse, refuseBusy }) => {
  const busy = refuseBusy()
  if (busy) return busy
  const reset =
    data.resetWhat === 'times' ? await resetFreshTimes(manifest) : await resetFresh(manifest)
  if (!reset) return refuse('There is nothing in Fresh files to reset.')
  saveManifest(manifestPath, manifest)
  return { ...boardAnswer(manifest), reset: { ...reset, what: data.resetWhat ?? 'everything' } }
}

export { resetFreshIntent }
