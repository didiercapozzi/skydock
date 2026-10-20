import { saveManifest, messageOf } from '@skydock/scripts'
import { copyFiles } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

const copyFilesIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  frozen,
  refuse,
  refuseFrozen
}) => {
  const ids = new Set(data.fileIds ?? [])
  if (ids.size === 0 || !data.targetGroupId)
    return refuse('Pick files and a jump to copy them into.')
  if (frozen.has(data.targetGroupId)) return refuseFrozen(data.targetGroupId)
  try {
    const { copied, passedOver, freed } = copyFiles(manifest, ids, data.targetGroupId)
    if (copied === 0)
      return refuse(
        passedOver > 0
          ? 'That jump already holds those files.'
          : freed > 0
            ? 'Freed from this machine — it is on the storage only, with no file here to copy.'
            : 'Those files are no longer here.'
      )
    await saveManifest(manifestPath, manifest)
    return { ...(await boardAnswer(manifest)), copied: { files: copied, passedOver } }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { copyFilesIntent }
