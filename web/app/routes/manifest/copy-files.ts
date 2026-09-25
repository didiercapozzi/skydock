import { saveManifest } from '@skydock/scripts'
import { copyFiles } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { messageOf } from '@skydock/scripts'

/* Files copied into another jump, staying where they are as well (RULES, Jumps). A montage with an
   edit takes nothing in, a copy included: its project names its clips, and a new one is not among
   them. What is copied *from* may be frozen — copying changes nothing about it. */
const copyFilesIntent: Intent = ({
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
  if (frozen.has(data.targetGroupId)) return refuseFrozen()
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
    saveManifest(manifestPath, manifest)
    return { ...boardAnswer(manifest), copied: { files: copied, passedOver } }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { copyFilesIntent }
