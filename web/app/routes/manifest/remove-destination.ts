import { processingNow, saveManifest } from '@skydock/scripts'
import {
  hasDestination,
  removeDestination
} from '../../../../packages/skydock-scripts/src/destinations'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A place taken off the board: what was filed there is back in Fresh files, keeping its jumps and
   everything decided about them (RULES, Places). Nothing on the disk is deleted and nothing on the
   storage is touched.

   Not a place holding anything already on the storage — uploaded is the end of editing, and unfiling
   an uploaded jump would leave the board saying it belongs nowhere while the storage says otherwise.
   Not while something is being processed, because what is being written is being written into that
   place's folder. Tandems is a place like any other, and goes the same way. */
const removeDestinationIntent: Intent = ({ data, manifest, manifestPath, frozen, refuse }) => {
  const name = data.destination?.trim()
  if (!name) return refuse('Removing a place needs to know which one.')
  if (!hasDestination(manifest, name)) return refuse('That place is no longer on the board.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')

  const filed = manifest.groups.filter((group) => group.destination === name)
  if (filed.some((group) => frozen.has(group.id)))
    return refuse('A montage there has an edit — change it in kdenlive first.')
  if (filed.some((group) => group.uploaded || group.freed))
    return refuse('Something there is on the storage — uploaded is the end of editing.')
  if (
    [...manifest.files, ...filed.flatMap((group) => group.files)].some(
      (file) => file.destination === name && (file.uploaded || file.freed)
    )
  )
    return refuse('Something there is on the storage — uploaded is the end of editing.')

  removeDestination(manifest, name)
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { removeDestinationIntent }
