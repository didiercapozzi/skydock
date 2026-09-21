import { z } from 'zod'
import type { JumpMoments } from './types'

/* The jump's moments as a project holds them. Arithmetic and nothing else: no XML, no files.

   A clip that holds a jump is laid whole, like any other, and carries its moments as markers of its
   own. Marking rather than cutting is the point: a cut decides where the film changes, which is the
   editor's decision and theirs alone, while a marker only says where the door was left — and it is
   the clip's own, so it travels with the clip however often it is moved, trimmed or cut afterwards. */

/* A moment as kdenlive keeps one: where it is, in frames from the clip's own start, and what it is
   called. `duration` is what a marker spans, which for an instant is nothing; `type` is the colour
   category the editor draws it in, and the first is the one every project has. */
const markSchema = z.object({
  comment: z.string(),
  duration: z.number(),
  pos: z.number(),
  type: z.number()
})

type Mark = z.infer<typeof markSchema>

/* The moments, in the order they happen, named as the board names them — the same words the person
   reads on the clip's timeline before they ever open the editor. */
const NAMED = [
  { which: 'exit', comment: 'the exit' },
  { which: 'opening', comment: 'the opening' },
  { which: 'canopy', comment: 'the canopy' },
  { which: 'landing', comment: 'the ground' }
] as const

const marksFor = ({
  moments,
  cropStart,
  length,
  fps
}: {
  moments?: JumpMoments | null
  cropStart?: number | null
  length: number
  fps: number
}) => {
  if (!moments || length < 1) return [] as Mark[]
  /* The marks are seconds into the clip as the camera shot it; what the timeline holds is the copy
     that was made of it, which begins wherever it was trimmed to. */
  const at = (second: number) => Math.round((second - (cropStart ?? 0)) * fps)
  return NAMED.flatMap(({ which, comment }) => {
    const second = moments[which]
    const pos = second === undefined ? -1 : at(second)
    /* a moment the copy does not reach is not in this clip, and is not claimed to be */
    return second === undefined || pos < 0 || pos >= length
      ? []
      : [{ comment, duration: 0, pos, type: 0 }]
  })
}

export { marksFor, markSchema }
export type { Mark }
