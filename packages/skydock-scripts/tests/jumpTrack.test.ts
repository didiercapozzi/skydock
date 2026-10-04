// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { RATE, trackOf } from '../src/jumpTrack'

const GRAVITY = 9.81

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
    expect(track?.force[10]).toBeCloseTo(1, 2)
    expect(track?.force[46]).toBeCloseTo(0.3, 2)
  })

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

  it('leaves a gap where the satellites had nothing to say', () => {
    const fixes = Array.from({ length: 200 }, (_, at) => ({
      at: at / 10,
      altitude: 4000 - at,
      speed: 190
    }))
    const track = trackOf(felt, fixes, 46)
    expect(track?.altitude?.[10]).not.toBeNull()
    expect(track?.altitude?.[80]).toBeNull()
    expect(track?.speed?.[80]).toBeNull()
  })

  it('is nothing at all for a clip with no measurements in it', () => {
    expect(trackOf([], [], 46)).toBeNull()
    expect(trackOf(felt, [], 0)).toBeNull()
  })
})
