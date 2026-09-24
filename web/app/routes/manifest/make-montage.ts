import {
  isMontage,
  montageCalled,
  passengerName,
  passengerOf,
  saveManifest
} from '@skydock/scripts'
import { freshIds } from '../../../../packages/skydock-scripts/src/clustering'
import { copyIntoMontage, moveFiles } from '../../../../packages/skydock-scripts/src/moveFiles'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { messageOf } from '@skydock/scripts'

/* Picked files, or a whole jump, made a montage under one name (RULES, Making a montage). Whether
   they move or are copied is not the person's to decide: files still in Fresh files belong nowhere
   and move in; files that already belong somewhere — a dropzone, another montage — are copied, so
   that place keeps its own. A name that is already a montage's joins it as a jump of its own. */
const makeMontageIntent: Intent = ({
  data,
  manifest,
  manifestPath,
  frozen,
  refuse,
  refuseFrozen
}) => {
  const ids = new Set(data.fileIds ?? [])
  const name = data.name?.trim() ?? ''
  if (ids.size === 0) return refuse('Pick the files the montage is made of.')
  if (!name) return refuse('Give the montage a name.')
  const passenger = montageCalled(manifest.groups, name)
  /* a montage with an edit takes nothing in: its project names its clips, and new ones are not */
  const joining = manifest.groups.filter(
    (g) => isMontage(g) && passengerOf(g) === passengerName(passenger)
  )
  if (joining.some((g) => frozen.has(g.id))) return refuseFrozen()

  const fresh = freshIds(manifest)
  try {
    if ([...ids].every((id) => fresh.has(id))) {
      moveFiles(manifest, ids, {
        newGroup: true,
        montage: true,
        passenger,
        startsAt: data.anchorEpoch
      })
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    const { copied, passedOver, freed } = copyIntoMontage(manifest, ids, passenger)
    if (copied === 0)
      return refuse(
        freed > 0
          ? 'Freed from this machine — on the storage only, with no file here to copy.'
          : 'Those files are no longer here.'
      )
    saveManifest(manifestPath, manifest)
    return { ...boardAnswer(manifest), copied: { files: copied, passedOver } }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { makeMontageIntent }
