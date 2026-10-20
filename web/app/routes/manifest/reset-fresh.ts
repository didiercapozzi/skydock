import { saveManifest } from '@skydock/scripts'
import { resetFresh, resetFreshTimes } from '../../../../packages/skydock-scripts/src/resetFresh'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

const resetFreshIntent: Intent = async ({ data, manifest, manifestPath, refuse }) => {
  const reset =
    data.resetWhat === 'times' ? await resetFreshTimes(manifest) : await resetFresh(manifest)
  if (!reset) return refuse('There is nothing in Fresh files to reset.')
  await saveManifest(manifestPath, manifest)
  return {
    ...(await boardAnswer(manifest)),
    reset: { ...reset, what: data.resetWhat ?? 'everything' }
  }
}

export { resetFreshIntent }
