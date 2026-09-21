// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cutFrom, readFelt } from '../src/jumpMoments'

/* Where the jump is in a clip, read off what the camera felt. The numbers here are the shape of a
   real tandem, measured off jumps that were then checked frame by frame: a minute in the plane at
   one gravity, a few seconds of next to nothing at the door, fifty seconds of freefall at one
   gravity again — drag against weight — the opening at two, a canopy ride, and the ground.

   The marks are instants, not seconds: the door is where the weight left one gravity, and the
   canopy is where its opening eased — three or four seconds after the first tug, which is when the
   frames show one flying. */

const GRAVITY = 9.81

/* one second of readings at the rate a GoPro writes them */
const second = (gravities: number) => Array.from({ length: 200 }, () => gravities * GRAVITY)

/* An opening lasts: three seconds of deceleration and more, which is what tells it from a hard turn
   in freefall. The ground is one second of impact. */
const OPENING = 3

const jump = ({
  cabin = 40,
  exit = 6,
  freefall = 50,
  canopy = 90,
  after = 5
}: { cabin?: number; exit?: number; freefall?: number; canopy?: number; after?: number } = {}) => {
  const felt = [
    ...Array.from({ length: cabin }, () => second(1)).flat(),
    ...Array.from({ length: exit }, () => second(0.3)).flat(),
    ...Array.from({ length: freefall }, () => second(1)).flat(),
    ...Array.from({ length: OPENING }, () => second(2.1)).flat(),
    ...Array.from({ length: canopy }, () => second(1)).flat(),
    ...second(1.5),
    ...Array.from({ length: after }, () => second(1)).flat()
  ]
  return { felt, seconds: felt.length / 200 }
}

describe('where the jump is in a clip', () => {
  it('is the moment the plane was left, the canopy came open, and the ground arrived', () => {
    const { felt, seconds } = jump()
    const found = readFelt(felt, seconds)
    expect(found?.exit).toBe(40)
    /* the opening begins at 96 and is over by a few seconds later, which is the second mark */
    expect(found?.canopy).toBeGreaterThan(96)
    expect(found?.canopy).toBeLessThan(101)
    expect(found?.landing).toBe(189)
  })

  /* The canopy is marked twice, because a film wants both: the tug that ends the freefall, and the
     easing three or four seconds later where the canopy is overhead and flying. */
  it('marks the tug that ends the freefall as well as the canopy above it', () => {
    const { felt, seconds } = jump()
    const found = readFelt(felt, seconds)
    /* freefall runs to 96 and the opening begins there */
    expect(found?.opening).toBeGreaterThanOrEqual(95)
    expect(found?.opening).toBeLessThanOrEqual(97)
    expect(found?.opening).toBeLessThan(found?.canopy ?? 0)
  })

  /* A clip whose canopy was never found has no opening either: the two are two ends of one thing. */
  it('says nothing of an opening it never found the canopy of', () => {
    const felt = [
      ...Array.from({ length: 20 }, () => second(1)).flat(),
      ...Array.from({ length: 6 }, () => second(0.3)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    expect(readFelt(felt, felt.length / 200)?.opening).toBeUndefined()
  })

  /* Freefall weighs one gravity, the same as sitting in the plane — drag has caught up with
     weight. Only the seconds at the door weigh less, and that is the whole of what is looked for. */
  it('is not fooled by freefall weighing what the plane did', () => {
    const { felt, seconds } = jump({ freefall: 60 })
    expect(readFelt(felt, seconds)?.exit).toBe(40)
  })

  /* The second that is found is the second whose average first fell, and a door left in the middle
     of it still weighs a gravity at its start. Marking the second's start puts the exit up to a
     second early — on this jump, with the pair still standing in the door. */
  it('is the moment inside that second when the weight went, not the second’s start', () => {
    const felt = [
      ...Array.from({ length: 40 }, () => second(1)).flat(),
      /* the fortieth second: six tenths still aboard, a shove, then nothing */
      ...second(1).slice(0, 120),
      ...second(1.5).slice(0, 20),
      ...second(0.3).slice(0, 60),
      ...Array.from({ length: 30 }, () => second(0.3)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]

    const found = readFelt(felt, felt.length / 200)

    expect(found?.exit).toBeGreaterThanOrEqual(40.5)
    expect(found?.exit).toBeLessThanOrEqual(40.8)
  })

  /* A clip that never left the ground has no jump in it, and saying so is the answer wanted. */
  it('says nothing of a clip that shows no exit', () => {
    const still = Array.from({ length: 120 }, () => second(1)).flat()
    expect(readFelt(still, 120)).toBeNull()
  })

  /* A camera knocked about on the ground goes light for an instant. An aeroplane being left does
     not stop after an instant. */
  it('is not a camera being knocked about', () => {
    const knocked = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...second(0.2).slice(0, 60),
      ...Array.from({ length: 30 }, () => second(1)).flat()
    ]
    expect(readFelt(knocked, knocked.length / 200)).toBeNull()
  })

  /* A drogue is thrown within seconds of the door and shoves hard enough to look like an opening.
     It is not one: nothing that soon after an exit ends the freefall. */
  it('does not mistake the drogue for the canopy', () => {
    const felt = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...Array.from({ length: 5 }, () => second(0.3)).flat(),
      ...second(1.6) /* the drogue, five seconds after the door */,
      ...Array.from({ length: 45 }, () => second(1)).flat(),
      ...Array.from({ length: OPENING }, () => second(2.1)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(30)
    /* the opening begins at 81, and the drogue forty-five seconds before it is not one */
    expect(found?.canopy).toBeGreaterThan(81)
    expect(found?.canopy).toBeLessThan(86)
  })

  /* A sport jumper tracking away, or turning hard, weighs as much for a second as a tandem's canopy
     does. What tells them apart is that an opening goes on. This is a jump that was marked wrongly
     until it did: the manoeuvre at forty seconds, the opening at sixty. */
  it('is not a hard turn in freefall', () => {
    const felt = [
      ...Array.from({ length: 12 }, () => second(1)).flat(),
      ...Array.from({ length: 4 }, () => second(0.4)).flat(),
      ...Array.from({ length: 24 }, () => second(1.1)).flat(),
      ...second(1.45) /* one second of turning, and back to freefall */,
      ...Array.from({ length: 19 }, () => second(1.1)).flat(),
      ...Array.from({ length: 4 }, () => second(2)).flat() /* the canopy, at sixty */,
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(12)
    /* the opening begins at 60; the second of turning at 40 is not an opening at all */
    expect(found?.canopy).toBeGreaterThan(60)
    expect(found?.canopy).toBeLessThan(66)
  })

  /* A jumper head-down and turning weighs two gravities for as long as they care to, which is what a
     canopy weighs and far longer than one opens for. What tells them apart is what follows: only an
     opening has a canopy flying on the other side of it. This is a jump that was marked at its
     eighth second — in the middle of the flying — until that was asked. */
  it('is the opening at the end of the flying, not the flying', () => {
    const felt = [
      ...Array.from({ length: 12 }, () => second(1)).flat(),
      ...Array.from({ length: 4 }, () => second(0.4)).flat(),
      ...Array.from({ length: 8 }, () => second(1.1)).flat(),
      ...Array.from({ length: 40 }, () => second(2.2)).flat() /* head-down, and turning */,
      ...Array.from({ length: 3 }, () => second(3)).flat() /* the opening */,
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(12)
    /* the opening begins at 64, at the end of the flying, and its mark is where it eased */
    expect(found?.canopy).toBeGreaterThanOrEqual(64)
    expect(found?.canopy).toBeLessThan(70)
  })

  /* A clip cut before the canopy still has its exit, and says nothing it cannot see. */
  it('gives what the clip reaches and no more', () => {
    const felt = [
      ...Array.from({ length: 20 }, () => second(1)).flat(),
      ...Array.from({ length: 6 }, () => second(0.3)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    expect(readFelt(felt, felt.length / 200)).toEqual({
      exit: 20,
      opening: undefined,
      canopy: undefined,
      landing: undefined
    })
  })
})

/* What is measured is when this camera's wearer became airborne. What an edit starts from is the
   moment the jump begins on screen — and on a fun jump the group is out of the door a second before
   whoever is filming them. A tandem is its own subject, and wants the instant itself. */
describe('where a cut starts from', () => {
  const moments = { exit: 38.6, canopy: 101.6, landing: 192.7 }

  it('is the measured instant on a tandem', () => {
    expect(cutFrom(moments, true)).toBe(38.6)
  })

  it('is a second before it on a fun jump', () => {
    expect(cutFrom(moments, false)).toBeCloseTo(37.6, 5)
  })

  /* a clip whose jump begins in its first second has nowhere earlier to start */
  it('never runs before the clip does', () => {
    expect(cutFrom({ exit: 0.4 }, false)).toBe(0)
  })
})
