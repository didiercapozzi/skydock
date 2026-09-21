import { saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* One of a jump's moments, moved by hand. What the camera measured is a starting point: the exit
   decides where the music begins, and a second either way is the difference between a cut that
   lands and one that does not (RULES, Where the jump is in a clip).

   It belongs to the file rather than to the jump that holds it: the door was left at one instant,
   whatever anybody later does with the footage. Unlike a trim, it is not undone by processing again
   and does not make a copy stale — nothing is cut differently for it until somebody says so. */
const setMomentIntent: Intent = ({ data, manifest, manifestPath, refuse }) => {
  const id = data.fileIds?.[0]
  if (!id || (data.fileIds?.length ?? 0) > 1) return refuse('Move one mark at a time.')
  const moment = data.moment
  if (!moment) return refuse('Say which moment it is.')
  const file = manifest.files.find((f) => f.id === id)
  if (!file) return refuse('That file is no longer on the board.')

  const held = file.moments ?? { exit: 0 }
  const moved = { ...held, [moment.which]: moment.seconds }
  /* A jump happens in one order and a mark says when: the canopy cannot open before the door is
     left. Refusing is better than silently sorting them, since one of the two is wrong and only
     the person moving them knows which. */
  const inOrder = [moved.exit, moved.opening, moved.canopy, moved.landing].filter(
    (at) => at !== undefined
  )
  if (inOrder.some((at, index) => index > 0 && at <= inOrder[index - 1]))
    return refuse('A jump goes door, opening, canopy, ground — the marks have to say the same.')

  /* every copy of the file, not only the registry's: a jump holds its own resolved copy, and the
     board is answered out of those — a mark written to one of the two comes back looking unmoved */
  for (const one of [file, ...manifest.groups.flatMap((g) => g.files)])
    if (one.id === id) one.moments = moved
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { setMomentIntent }
