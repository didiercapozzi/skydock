// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { RATE, trackOf } from '../src/jumpTrack'

/* The jump as a series to be drawn against the footage: the force the camera felt from the first
   frame to the last, and beside it the height and speed a camera with satellites wrote down. What
   no camera wrote is not drawn (RULES, The jump on a graph). */

const GRAVITY = 9.81

/* one second of readings at the rate a GoPro writes them */
const second = (gravities: number) => Array.from({ length: 200 }, () => gravities * GRAVITY)

const felt = [
  ...Array.from({ length: 20 }, () => second(1)).flat(),
  ...Array.from({ length: 6 }, () => second(0.3)).flat(),
  ...Array.from({ length: 20 }, () => second(1)).flat()
]

describe('a jump as a graph', () => {
  it('is what the camera felt, in gravities, twice a second from end to end', () => {
    const track = trackOf(felt, [], 46)
    expect(track?.rate).toBe(RATE)
    expect(track?.seconds).toBe(46)
    expect(track?.force).toHaveLength(46 * RATE)
    /* the cabin weighs a gravity, the door barely a third of one */
    expect(track?.force[10]).toBeCloseTo(1, 2)
    expect(track?.force[46]).toBeCloseTo(0.3, 2)
  })

  /* Neither camera here has satellites switched on, and the graph says so by having no such line
     rather than by drawing one from nothing. */
  it('says nothing of height or speed when the camera never knew either', () => {
    const track = trackOf(felt, [], 46)
    expect(track?.altitude).toBeUndefined()
    expect(track?.speed).toBeUndefined()
  })

  it('carries the height and the speed when the camera wrote them down', () => {
    const fixes = Array.from({ length: 460 }, (_, at) => ({
      at: at / 10,
      altitude: 4000 - at * 5,
      speed: 190
    }))
    const track = trackOf(felt, fixes, 46)
    expect(track?.altitude).toHaveLength(46 * RATE)
    expect(track?.altitude?.[0]).toBeCloseTo(3990, 0)
    expect(track?.speed?.[20]).toBeCloseTo(190, 5)
  })

  /* A receiver loses the sky under a canopy or in the door, and comes back a few seconds later. The
     seconds it said nothing about are a gap in the line, not a line ruled straight across them. */
  it('leaves a gap where the satellites had nothing to say', () => {
    const fixes = Array.from({ length: 200 }, (_, at) => ({
      at: at / 10,
      altitude: 4000 - at,
      speed: 190
    }))
    const track = trackOf(felt, fixes, 46)
    /* the fixes run out after twenty seconds of a forty-six second clip */
    expect(track?.altitude?.[10]).not.toBeNull()
    expect(track?.altitude?.[80]).toBeNull()
    expect(track?.speed?.[80]).toBeNull()
  })

  /* A clip a camera wrote nothing worth reading about has no graph, the same silence the marks
     answer with. */
  it('is nothing at all for a clip with no measurements in it', () => {
    expect(trackOf([], [], 46)).toBeNull()
    expect(trackOf(felt, [], 0)).toBeNull()
  })
})
