import { passengerOf, saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A montage marked paid, or not — every jump of it, since a montage is paid for once, as one folder
   (RULES, The overview). */
const markPaid: Intent = ({ data, manifest, manifestPath, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('This montage is no longer on the board.')
  const who = passengerOf(group)
  for (const g of manifest.groups)
    if (g.id === group.id || (who && passengerOf(g) === who)) {
      if (data.paid) g.paid = true
      else delete g.paid
    }
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { markPaid }
