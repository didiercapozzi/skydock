import { z } from 'zod'
import { cutFrom } from './jumpMoments'
import type { JumpMoments } from './types'

/* Where a clip is cut when it has a jump in it, and what the jump's moments are called once they are
   in the project. Arithmetic and nothing else: no XML, no files.

   A jump changes at four instants and SkyDock knows all four (RULES, Where the jump is in a clip).
   Laid as one block, finding them again means scrubbing a clip of seven minutes; laid cut at them,
   the cabin, the exit, the freefall and the landing are blocks to keep or delete. Nothing is thrown
   away — the pieces are the whole clip, in order and touching — so the film is as long as the
   footage either way, and a clip with no jump in it comes out of this as the one piece it was. */

/* A moment as kdenlive keeps one, on a clip or along the timeline: where it is, in frames, and what
   it is called. `duration` is what a marker spans, which for an instant is nothing; `type` is which
   colour category the editor draws it in, and the first is the one every project has. */
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

/* A landing is the approach and the touchdown together, so the last block begins before the ground
   rather than at it. Fifteen seconds, measured off a finished film where the editor took seventeen:
   long enough to hold the turn onto final and the flare, short enough that it is the landing and not
   the end of the canopy ride. */
const APPROACH = 15

/* The canopy is marked twice and cut at once. A cut where the opening eased as well as where it began
   would leave a block of three or four seconds — the opening itself — which is a sliver on a
   timeline, not a piece anybody moves. So the freefall ends at the first tug. */
const cutsAt = (moments: JumpMoments) => [
  /* a montage is only ever a tandem's, and a tandem is cut on the instant its own camera left */
  cutFrom(moments, true),
  moments.opening ?? moments.canopy,
  moments.landing === undefined ? undefined : moments.landing - APPROACH
]

/* Two cuts inside a second of each other are one cut: a mark moved by hand can sit anywhere, and a
   piece too short to grab is worse than no cut at all. */
const APART = 1

type Piece = { in: number; out: number }

const cutClip = ({
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
  /* The marks are seconds into the clip as the camera shot it; what the timeline holds is the copy
     that was made of it, which begins wherever it was trimmed to. */
  const at = (second: number) => Math.round((second - (cropStart ?? 0)) * fps)
  const inside = (frame: number) => frame > 0 && frame < length
  const whole: Piece[] = [{ in: 0, out: length - 1 }]
  if (!moments || length < 1) return { pieces: whole, marks: [] as Mark[] }

  const marks = NAMED.flatMap(({ which, comment }) => {
    const second = moments[which]
    const pos = second === undefined ? -1 : at(second)
    /* a moment the copy does not reach is not in this clip, and is not claimed to be */
    return second === undefined || pos < 0 || pos >= length
      ? []
      : [{ comment, duration: 0, pos, type: 0 }]
  })

  const boundaries = cutsAt(moments)
    .flatMap((second) => (second === undefined ? [] : [at(second)]))
    .filter(inside)
    .sort((a, b) => a - b)
    .reduce<number[]>(
      (kept, frame) =>
        kept.some((already) => Math.abs(already - frame) < APART * fps) ||
        frame < APART * fps ||
        length - frame < APART * fps
          ? kept
          : [...kept, frame],
      []
    )

  const edges = [0, ...boundaries, length]
  const pieces = edges.slice(0, -1).map((from, index) => ({ in: from, out: edges[index + 1]! - 1 }))
  return { pieces: pieces.length > 0 ? pieces : whole, marks }
}

export { APPROACH, cutClip, markSchema }
export type { Mark, Piece }
