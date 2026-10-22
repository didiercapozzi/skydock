import { isMontage, passengerOf, saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A montage is done when the person says so — whatever else it has been through, and without being
   uploaded — or no longer done, taken back: all the jumps of the same montage together, since they are one
   to whoever it is for. Nothing is deleted or moved; it is only no longer something to do. */
const markDone: Intent = async ({ data, manifest, manifestPath, frozen, refuse, refuseFrozen }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group || !isMontage(group)) return refuse('That montage is no longer on the board.')
  const jumps = manifest.groups.filter((g) => isMontage(g) && passengerOf(g) === passengerOf(group))
  if (jumps.some((g) => frozen.has(g.id))) return refuseFrozen()
  if (jumps.some((g) => g.freed))
    return refuse('This montage is on the storage only — it has been freed from this machine.')
  const now = Math.floor(Date.now() / 1000)
  if (data.done === false) for (const jump of jumps) delete jump.done
  else {
    for (const jump of jumps) jump.done = jump.done ?? now
  }
  await saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { markDone }
