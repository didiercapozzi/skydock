import { regroupLooseFiles, saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* the loose files of the sorting area are clustered into jumps again, by time */
const regroupLoose: Intent = async ({ manifest, manifestPath, refuse }) => {
  const made = regroupLooseFiles(manifest)
  if (made === 0) return refuse('Nothing to regroup — the sorting area has no loose files.')
  await saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { regroupLoose }
