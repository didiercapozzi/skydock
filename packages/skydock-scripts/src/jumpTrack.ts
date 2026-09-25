import { GRAVITY, POSITION, READERS, telemetryOf } from './telemetry'
import type { Fix } from './telemetry'

/* A clip's jump as a series to be drawn: what the camera felt from the first frame to the last, and
   beside it — when the camera was told where it was — how high it was and how fast it was moving.

   The force is always there, since both cameras measure it: it is the shape of the whole jump, the
   cabin at one gravity, the dip at the door, freefall, the opening, the canopy ride and the ground.
   Height and speed come off satellites and nothing else. A camera with its satellites switched off
   writes neither, and then neither is drawn — a jump is not worth inventing numbers about. */

/* Twice a second, which is as fine as a graph of three minutes can be read and fine enough to drag
   a point along: each point is what that half second averaged, because a single reading is noise —
   freefall alone swings a camera from nothing to twice gravity between one reading and the next. */
const RATE = 2

const sampled = (values: number[], seconds: number, points: number) => {
  const each = values.length / points
  return Array.from({ length: points }, (_, point) => {
    const from = Math.floor(point * each)
    const upto = Math.max(from + 1, Math.min(values.length, Math.floor((point + 1) * each)))
    let sum = 0
    for (let at = from; at < upto; at++) sum += values[at] ?? 0
    return sum / (upto - from)
  })
}

/* Where each fix belongs in the clip. The newer receivers carry their own clock and say it; the
   older ones say only how many fixes there were, which over a run of them is the same thing spread
   evenly. A gap where the receiver had nothing to say is a gap in the drawing, not a line ruled
   across it. */
const alongClip = (fixes: Fix[], seconds: number, points: number) => {
  const at = (fix: Fix, index: number) =>
    fix.at ?? (fixes.length > 1 ? (index / (fixes.length - 1)) * seconds : 0)
  const altitude: (number | null)[] = Array.from({ length: points }, () => null)
  const speed: (number | null)[] = Array.from({ length: points }, () => null)
  const counts = Array.from({ length: points }, () => 0)
  fixes.forEach((fix, index) => {
    /* the same half second the force is averaged over, so a point on one line is the same instant
       as the point above it */
    const point = Math.min(points - 1, Math.max(0, Math.floor((at(fix, index) / seconds) * points)))
    counts[point]++
    altitude[point] = (altitude[point] ?? 0) + fix.altitude
    speed[point] = (speed[point] ?? 0) + fix.speed
  })
  for (let point = 0; point < points; point++)
    if (counts[point] > 0) {
      altitude[point] = (altitude[point] ?? 0) / counts[point]
      speed[point] = (speed[point] ?? 0) / counts[point]
    }
  return { altitude, speed }
}

const trackOf = (felt: number[], fixes: Fix[], seconds: number) => {
  if (felt.length < 100 || seconds <= 0) return null
  const points = Math.max(1, Math.round(seconds * RATE))
  const force = sampled(felt, seconds, points).map((one) => one / GRAVITY)
  const position =
    fixes.length > 0 ? alongClip(fixes, seconds, points) : { altitude: undefined, speed: undefined }
  return { seconds, rate: RATE, force, ...position }
}

const jumpTrack = async (clip: string) => {
  const written = await telemetryOf(clip)
  if (!written) return null
  const position = POSITION[written.kind]
  return trackOf(
    READERS[written.kind](written.data),
    position ? position(written.data) : [],
    written.seconds
  )
}

export { jumpTrack, RATE, trackOf }
