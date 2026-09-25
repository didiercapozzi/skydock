import { GRAVITY, READERS, telemetryOf } from './telemetry'
import type { JumpMoments } from './types'

/* The moments a jump is cut around: leaving the plane, the canopy — its first tug and where that
   opening has eased — and the ground.
   Finding them is what an editor does first, every time — the music is hung on the exit, the cabin
   before it is trimmed to a few seconds, and two cameras of one jump are lined up on the instant
   they both left.

   A camera writes down what it felt, and that answers it. Leaving the plane is weightlessness —
   briefly, until the air catches up and freefall weighs one gravity again, which is why the mark is
   the dip and not a lasting nothing. The canopy is a deceleration with canopy flight on the other
   side of it, marked twice: where the tug of it begins, which is the end of freefall, and where it
   has eased, which is where the frames show a canopy overhead. The ground is the last second heavier
   than a canopy ride.

   Both cameras here keep those measurements, each in its own way, and the same physics is read out
   of either — so one set of rules serves both.

   Read by the second, averaged, never by the single reading: freefall buffets a camera hard enough
   to touch one and a half gravities for an instant every few seconds, so a peak says nothing. What
   a whole second weighs separates the moments cleanly. Measured off real jumps:

     leaving the plane   0.2 – 0.7   the air has not caught up yet
     freefall            1.0         drag against weight, the two equal
     under a canopy      1.0         the same again — this is not about how high anything is
     the canopy opening  1.5 – 2.9   three seconds and more of it
     the ground          1.4 – 2.1

   Freefall is not always one gravity, which is what makes the canopy the hard one: a jumper
   tracking, turning or flying head-down weighs as much as an opening does, and for longer. Only an
   opening has a gravity held steady after it, minute after minute, which is a canopy flying.

   Not knowing is an answer, and the usual one: a clip shot on the ground has no exit, and neither
   has one that never left the plane or one off a camera that measures nothing. Those are marked by
   hand, or not at all. */

/* What is measured is the instant this camera's wearer was airborne — nothing else is in the
   readings. What an edit wants is the moment the jump begins on screen, and on a fun jump that is a
   second or so earlier: the group goes out of the door ahead of whoever is filming, and the push
   off begins before the weight does. A montage is its own subject and wants the instant itself.

   So the measurement is kept as measured, and the second is taken off where a cut is made from it.
   Dragging the mark moves the measurement with it, so a clip that wants something else gets it. */
const RUN_UP = 1

const cutFrom = (moments: JumpMoments, montage: boolean) =>
  montage ? moments.exit : Math.max(0, moments.exit - RUN_UP)

/* Leaving the plane, as the seconds around it average: under a gravity for the few seconds it takes
   the air to catch up. How deep the dip goes differs by camera and by how fast the aeroplane was
   going — a GoPro on one jump floors at 0.2, a DJI on another at 0.43 — so what is asked of it is
   the average of three seconds rather than any single second's depth.

   How light those three seconds are differs more than the floor does, because what a camera feels
   is not only the flight. Held out on an arm, the arm is in the readings too: the hand-held clip
   here reads 0.78 through its exit, while the same camera on a helmet reads 0.43 on the jump before
   it. Every clip on this machine falls on one side or the other of that with room to spare —

     a jump      0.36  0.40  0.41  0.43  0.49  0.51  0.58  0.78
     no jump     0.89  0.89  0.92  0.94  0.95 … 1.04

   and what follows the mark is what keeps a shaken clip from becoming a jump: the aeroplane has to
   have weighed its gravity a moment before, and the canopy that ends a jump has to be found after
   it. */
const LEAVING = 0.82 * GRAVITY

const FALLING_FOR = 3

/* What a second aboard the aeroplane weighs, near enough. It settles two things: the marked second
   has to be lighter than this — or the mark lands a second early, on the last second of the cabin —
   and a second this heavy has to have passed a moment before, or nothing happened here at all. A
   clip that begins in freefall shows no door being left, and is left alone. */
const STILL_ABOARD = 0.85 * GRAVITY

/* how far back the aeroplane has to be, for this to be the leaving of it */
const ABOARD_WITHIN = 6

/* a second weighing this much is the canopy or the ground — or, in freefall, a hard turn */
const HEAVY = 1.4 * GRAVITY

/* What tells a canopy opening from a turn in freefall: it lasts. An opening decelerates for three
   seconds and more; a sport jumper tracking or turning touches the same weight for one second and
   is back to freefall. Measured on a jump where four seconds of freefall manoeuvring read as heavily
   as a montage's canopy does — and the opening, forty seconds later, read heavier still for five
   seconds together. The ground needs no such test: nothing after a canopy is mistaken for it. */
const OPENING_MEAN = 1.5 * GRAVITY

const OPENING_FOR = 3

/* A canopy cannot open the moment the door is left: a drogue is thrown within seconds of it, and the
   shove of that is not the opening. */
const SHORTEST_FREEFALL = 6

/* And it cannot open much later than this: from the height a club's aeroplane climbs to, freefall
   lasts a minute or so. Anything claimed as an opening long after the door was left is not one —
   it is somebody still flying — and then nothing is claimed at all. */
const LONGEST_FREEFALL = 80

/* What has to come after an opening, and the whole of what tells one: flying under a canopy. It
   weighs a gravity and goes on weighing it, and nothing in freefall does — a jumper tracking,
   turning or flying head-down weighs anything but.

   This is what asking about the deceleration alone could not do. A camera flyer turning away from
   his group stops as hard as a montage's canopy does and for as long; a freefly jump held three
   gravities for half a minute and read as an opening at its eighth second. Both are answered by
   asking what came next. */
const FLYING_FROM = 0.75 * GRAVITY

const FLYING_TO = 1.35 * GRAVITY

const FLYING_FOR = 10

/* how soon that flying has to begin, for the deceleration before it to have been the opening */
const FLYING_WITHIN = 12

/* what each second of the clip weighed */
const bySecond = (felt: number[], seconds: number) => {
  const rate = felt.length / seconds
  const each: number[] = []
  for (let second = 0; second < Math.floor(seconds); second++) {
    const from = Math.floor(second * rate)
    const upto = Math.min(felt.length, Math.floor((second + 1) * rate))
    if (upto <= from) break
    let sum = 0
    for (let at = from; at < upto; at++) sum += felt[at]
    each.push(sum / (upto - from))
  }
  return each
}

/* An opening's hardest moment comes within a few seconds of its first tug, and the whole of it is
   over inside ten. Looked for any longer and a turn under the canopy is taken for the opening. */
const HARDEST_WITHIN = 5

const OPENING_LASTS = 10

/* Seconds find the moment; the readings themselves say when in it. A camera measures sixty or two
   hundred times a second, so once the second is known the crossing inside it can be had — the last
   instant the thing still weighed what it did before. Which matters: a second either way is the
   difference between music that lands on the door and music that lands after it.

   Smoothed over a fifth of a second first, because a single reading is noise: freefall alone swings
   a camera from nothing to twice gravity between one reading and the next. */
const SMOOTH_OVER = 0.2

/* What it weighed up to this instant, looking back rather than forward: a window that reaches ahead
   is already lightening before the door is open, and already easing before the canopy has. */
const smoothedAt = (felt: number[], rate: number, over = SMOOTH_OVER) => {
  const span = Math.max(1, Math.round(over * rate))
  return (at: number) => {
    const upto = Math.min(felt.length, at + 1)
    const from = Math.max(0, upto - span)
    if (upto <= from) return felt[0] ?? 0
    let sum = 0
    for (let one = from; one < upto; one++) sum += felt[one]
    return sum / (upto - from)
  }
}

/* The instant the plane was left, rather than the second it happened in: the last moment the camera
   still weighed what the aeroplane made it weigh.

   The second that was found is the second whose *average* first fell, and the crossing can sit
   anywhere inside it — a door left at its end reads as light on average while its first frames still
   weigh a gravity, and marking the second's start then lands the exit up to a second early, with the
   pair still standing in the door. So the search runs to the end of that second as well as back
   through the one before, and takes the last moment at that weight: after it, nothing is holding the
   camera up. The shove of pushing off is part of the exit and weighs more than a gravity, not less,
   so it is on the right side of that line. */
const leftAt = (felt: number[], rate: number, second: number, level: number) => {
  const smoothed = smoothedAt(felt, rate)
  const from = Math.round(second * rate)
  const earliest = Math.max(0, from - Math.round(rate))
  const latest = Math.min(felt.length - 1, from + Math.round(rate))
  for (let at = latest; at >= earliest; at--)
    if (smoothed(at) >= level) return Math.round((at / rate) * 10) / 10
  return second
}

/* The ground is the other way round — the weight arrives rather than leaves — so it is the first
   moment inside that second which weighs more than a canopy ride does. Smoothed the other way round
   too: a window that looks back lands a fifth of a second after the impact, having waited for its
   own average to catch up, so this one looks at what is about to happen instead. */
const struckAt = (felt: number[], rate: number, second: number, level: number) => {
  const span = Math.max(1, Math.round(SMOOTH_OVER * rate))
  const ahead = (at: number) => {
    const upto = Math.min(felt.length, at + span)
    let sum = 0
    for (let one = at; one < upto; one++) sum += felt[one]
    return upto > at ? sum / (upto - at) : 0
  }
  const from = Math.round(second * rate)
  const latest = Math.min(felt.length - 1, from + Math.round(rate))
  for (let at = from; at <= latest; at++)
    if (ahead(at) >= level) return Math.round((at / rate) * 10) / 10
  return second
}

/* When the canopy is open, which is not when it began to open: the deceleration is what the camera
   feels, and it runs for seconds — a montage's on purpose, slowly. Looked at frame by frame, the
   canopy is overhead and flying about when that deceleration has half gone from its hardest moment,
   which is three or four seconds after the first tug of it. Half of it rather than any fixed weight,
   because a fierce opening and a soft one end the same way and at different numbers. */
const HALF_GONE = 0.5

/* An opening is seconds long, so it is watched by the second. A fifth of a second is the right
   window for the door, where the weight falls off a cliff, and quite the wrong one here: freefall's
   own noise crosses any level within a moment of the hardest part, and the mark would land back at
   the first tug. */
const SMOOTH_OPENING = 1

/* the hardest instant of an opening, which both of its marks are measured from */
const hardestOf = (
  felt: number[],
  rate: number,
  second: number,
  smoothed: (at: number) => number
) => {
  const from = Math.round(second * rate)
  const hardest = Math.min(felt.length - 1, from + Math.round(HARDEST_WITHIN * rate))
  let peak = from
  for (let at = from; at <= hardest; at++) if (smoothed(at) > smoothed(peak)) peak = at
  return { from, peak }
}

const easedAt = (felt: number[], rate: number, second: number) => {
  const smoothed = smoothedAt(felt, rate, SMOOTH_OPENING)
  const { from, peak } = hardestOf(felt, rate, second, smoothed)
  const latest = Math.min(felt.length - 1, from + Math.round(OPENING_LASTS * rate))
  const eased = GRAVITY + (smoothed(peak) - GRAVITY) * HALF_GONE
  for (let at = peak; at <= latest; at++)
    if (smoothed(at) <= eased) return Math.round((at / rate) * 10) / 10
  return Math.round((peak / rate) * 10) / 10
}

/* The other end of the same opening: where it began, the first tug, with freefall on the near side
   of it. A montage's opening is drawn out on purpose and the two marks sit three or four seconds
   apart — the film wants both, since the deceleration is the moment the jump changes and the easing
   is where the canopy is flying.

   Read backwards from the hardest instant, as its easing is read forwards: the tug is the last
   moment the camera still weighed what freefall weighs. A quarter of the way up rather than at a
   gravity exactly, because freefall is never quite a gravity for long — buffeted, tracking, a
   montage's drogue holding the pair — and a mark asked to wait for exactly one would slide back
   seconds into the freefall before it. */
const JUST_BEGUN = 0.25

const beganAt = (felt: number[], rate: number, second: number) => {
  const smoothed = smoothedAt(felt, rate, SMOOTH_OPENING)
  const { from, peak } = hardestOf(felt, rate, second, smoothed)
  /* no earlier than the second before the one the opening was found in: whatever the readings do
     further back than that is freefall, not this */
  const earliest = Math.max(0, from - Math.round(rate))
  const begun = GRAVITY + (smoothed(peak) - GRAVITY) * JUST_BEGUN
  for (let at = peak; at >= earliest; at--)
    if (smoothed(at) <= begun) return Math.round((at / rate) * 10) / 10
  return Math.round((earliest / rate) * 10) / 10
}

/* The door is the first light second with lighter ones after it; the canopy the first heavy second
   a sensible while later; the ground the last heavy second of all — each then placed to the tenth
   of a second by the readings themselves. */
const readFelt = (felt: number[], seconds: number): JumpMoments | null => {
  if (felt.length < 100 || seconds <= 0) return null
  const weighed = bySecond(felt, seconds)
  if (weighed.length < 5) return null

  const exit = weighed.findIndex((second, at) => {
    if (second >= STILL_ABOARD) return false
    const falling = weighed.slice(at, at + FALLING_FOR)
    if (falling.length < FALLING_FOR) return false
    if (falling.reduce((sum, one) => sum + one, 0) / FALLING_FOR >= LEAVING) return false
    return weighed
      .slice(Math.max(0, at - ABOARD_WITHIN), at)
      .some((before) => before >= STILL_ABOARD)
  })
  if (exit === -1) return null

  /* A deceleration that lasts, with flying under a canopy on the other side of it. Neither half
     alone will do: a jump holds other decelerations that last — a camera flyer turning away from
     the group, a tracking dive pulled out of — and on the clips here those run to one and a half
     gravities for three and four seconds, which is a montage canopy's whole measure. Only an opening
     is followed by a gravity, held. */
  const opening = (at: number) => {
    const during = weighed.slice(at, at + OPENING_FOR)
    return during.length < OPENING_FOR ? 0 : during.reduce((sum, one) => sum + one, 0) / OPENING_FOR
  }
  const flyingAfter = (at: number) => {
    for (let from = at + 1; from <= at + FLYING_WITHIN; from++) {
      const flying = weighed.slice(from, from + FLYING_FOR)
      if (flying.length < FLYING_FOR) return false
      if (flying.every((one) => one >= FLYING_FROM && one <= FLYING_TO)) return true
    }
    return false
  }
  /* and the hardest of those, since a manoeuvre can sit a few seconds before a real opening and be
     followed by the same canopy flight — nothing in a jump stops a body as hard as its canopy */
  const canopy = weighed.reduce(
    (best, _, at) =>
      at >= exit + SHORTEST_FREEFALL &&
      at <= exit + LONGEST_FREEFALL &&
      opening(at) >= OPENING_MEAN &&
      opening(at) > (best === -1 ? 0 : opening(best)) &&
      flyingAfter(at)
        ? at
        : best,
    -1
  )
  /* the ground: the last second of the jump that weighs more than a canopy ride does */
  const last = weighed.reduce<number | undefined>(
    (found, second, at) => (second >= HEAVY ? at : found),
    undefined
  )
  const landing = canopy !== -1 && last !== undefined && last > canopy ? last : undefined

  const rate = felt.length / seconds
  return {
    exit: leftAt(felt, rate, exit, STILL_ABOARD),
    opening: canopy === -1 ? undefined : beganAt(felt, rate, canopy),
    canopy: canopy === -1 ? undefined : easedAt(felt, rate, canopy),
    landing: landing === undefined ? undefined : struckAt(felt, rate, landing, HEAVY)
  }
}

/* What this clip shows of the jump, as its camera measured it — or nothing, which is no failure and
   needs no explaining. How far through reading the clip it has got is said as it goes, for whoever
   is showing it. */
const jumpMoments = async (clip: string, onPercent?: (percent: number) => void) => {
  const written = await telemetryOf(clip, onPercent)
  return written ? readFelt(READERS[written.kind](written.data), written.seconds) : null
}

export { cutFrom, jumpMoments, readFelt, RUN_UP }
