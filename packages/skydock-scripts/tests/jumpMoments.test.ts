// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cutFrom, readFelt } from '../src/jumpMoments'

const GRAVITY = 9.81

const second = (gravities: number) => Array.from({ length: 200 }, () => gravities * GRAVITY)

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
    expect(found?.canopy).toBeGreaterThan(96)
    expect(found?.canopy).toBeLessThan(101)
    expect(found?.landing).toBe(189)
  })

  it('marks the tug that ends the freefall as well as the canopy above it', () => {
    const { felt, seconds } = jump()
    const found = readFelt(felt, seconds)
    expect(found?.opening).toBeGreaterThanOrEqual(95)
    expect(found?.opening).toBeLessThanOrEqual(97)
    expect(found?.opening).toBeLessThan(found?.canopy ?? 0)
  })

  it('says nothing of an opening it never found the canopy of', () => {
    const felt = [
      ...Array.from({ length: 20 }, () => second(1)).flat(),
      ...Array.from({ length: 6 }, () => second(0.3)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    expect(readFelt(felt, felt.length / 200)?.opening).toBeUndefined()
  })

  it('is not fooled by freefall weighing what the plane did', () => {
    const { felt, seconds } = jump({ freefall: 60 })
    expect(readFelt(felt, seconds)?.exit).toBe(40)
  })

  it('is the moment inside that second when the weight went, not the second’s start', () => {
    const felt = [
      ...Array.from({ length: 40 }, () => second(1)).flat(),
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

  it('says nothing of a clip that shows no exit', () => {
    const still = Array.from({ length: 120 }, () => second(1)).flat()
    expect(readFelt(still, 120)).toBeNull()
  })

  it('finds the door of a camera held out on an arm, where the dip is shallow', () => {
    const felt = [
      ...Array.from({ length: 84 }, () => second(1)).flat(),
      ...[1.23, 1.08, 1.26].flatMap((g) => second(g)),
      ...[0.67, 0.85, 0.83, 0.81, 0.77].flatMap((g) => second(g)),
      ...Array.from({ length: 40 }, (_, at) => second(at % 3 === 0 ? 1.3 : 1.05)).flat(),
      ...Array.from({ length: OPENING }, () => second(2.2)).flat(),
      ...Array.from({ length: 60 }, () => second(1)).flat(),
      ...second(1.6),
      ...Array.from({ length: 5 }, () => second(1)).flat()
    ]

    const found = readFelt(felt, felt.length / 200)

    expect(found?.exit).toBeGreaterThanOrEqual(87)
    expect(found?.exit).toBeLessThanOrEqual(88)
    expect(found?.canopy).toBeDefined()
  })

  it('is not a clip that was only shaken about', () => {
    const shaken = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...Array.from({ length: 6 }, (_, at) => second(at % 2 === 0 ? 0.86 : 0.92)).flat(),
      ...Array.from({ length: 60 }, () => second(1)).flat()
    ]
    expect(readFelt(shaken, shaken.length / 200)).toBeNull()
  })

  it('is not a camera being knocked about', () => {
    const knocked = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...second(0.2).slice(0, 60),
      ...Array.from({ length: 30 }, () => second(1)).flat()
    ]
    expect(readFelt(knocked, knocked.length / 200)).toBeNull()
  })

  it('does not mistake the drogue for the canopy', () => {
    const felt = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...Array.from({ length: 5 }, () => second(0.3)).flat(),
      ...second(1.6),
      ...Array.from({ length: 45 }, () => second(1)).flat(),
      ...Array.from({ length: OPENING }, () => second(2.1)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(30)
    expect(found?.canopy).toBeGreaterThan(81)
    expect(found?.canopy).toBeLessThan(86)
  })

  it('is not a hard turn in freefall', () => {
    const felt = [
      ...Array.from({ length: 12 }, () => second(1)).flat(),
      ...Array.from({ length: 4 }, () => second(0.4)).flat(),
      ...Array.from({ length: 24 }, () => second(1.1)).flat(),
      ...second(1.45),
      ...Array.from({ length: 19 }, () => second(1.1)).flat(),
      ...Array.from({ length: 4 }, () => second(2)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(12)
    expect(found?.canopy).toBeGreaterThan(60)
    expect(found?.canopy).toBeLessThan(66)
  })

  it('is the opening at the end of the flying, not the flying', () => {
    const felt = [
      ...Array.from({ length: 12 }, () => second(1)).flat(),
      ...Array.from({ length: 4 }, () => second(0.4)).flat(),
      ...Array.from({ length: 8 }, () => second(1.1)).flat(),
      ...Array.from({ length: 40 }, () => second(2.2)).flat(),
      ...Array.from({ length: 3 }, () => second(3)).flat(),
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(12)
    expect(found?.canopy).toBeGreaterThanOrEqual(64)
    expect(found?.canopy).toBeLessThan(70)
  })

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

describe('the door of a clip with a lull aboard before it', () => {
  const clip = () => {
    const felt = [
      ...Array.from({ length: 30 }, () => second(1)).flat(),
      ...Array.from({ length: 4 }, () => second(0.8)).flat(),
      ...Array.from({ length: 42 }, () => second(1)).flat(),
      ...Array.from({ length: 5 }, () => second(0.4)).flat(),
      ...Array.from({ length: 50 }, () => second(1.1)).flat(),
      ...Array.from({ length: OPENING }, () => second(2.1)).flat(),
      ...Array.from({ length: 60 }, () => second(1)).flat(),
      ...second(1.5),
      ...Array.from({ length: 5 }, () => second(1)).flat()
    ]
    return { felt, seconds: felt.length / 200 }
  }

  it('is the exit the canopy follows, not the lull', () => {
    const { felt, seconds } = clip()
    const moments = readFelt(felt, seconds)
    expect(moments?.exit).toBe(76)
    expect(moments?.opening).toBeDefined()
    expect(moments?.landing).toBeDefined()
  })

  it('is the deepest dip when the clip ends before any canopy', () => {
    const { felt } = clip()
    const cut = felt.slice(0, 90 * 200)
    expect(readFelt(cut, 90)?.exit).toBe(76)
  })
})

describe('the door of a wearer who hangs out before letting go', () => {
  type Dir = 1 | -1

  const pushes = (gravities: number, dir: Dir): [number, number, number][] =>
    Array.from({ length: 200 }, () => [0, 0, gravities * GRAVITY * dir])

  const clip = (turnedAt: number, hang: number) => {
    const plan: [number, number, Dir][] = [
      [turnedAt, 1, 1],
      [40 - turnedAt, 1.2, -1],
      [hang, 1.2, -1],
      [5, 0.3, -1],
      [50, 1, -1],
      [OPENING, 2.1, -1],
      [60, 1, -1],
      [1, 1.5, -1],
      [5, 1, -1]
    ]
    const seconds = plan.flatMap(([length, gravities, dir]) =>
      Array.from({ length }, () => ({ gravities, dir }))
    )
    const felt = seconds.flatMap(({ gravities }) => second(gravities))
    const vectors = seconds.flatMap(({ gravities, dir }) => pushes(gravities, dir))
    return { felt, vectors, seconds: felt.length / 200 }
  }

  it('is where the direction turned over, not where the weight went', () => {
    const { felt, vectors, seconds } = clip(40, 1)
    expect(readFelt(felt, seconds)?.exit).toBeGreaterThanOrEqual(40.8)
    expect(readFelt(felt, seconds, vectors)?.exit).toBeCloseTo(40, 0)
  })

  it('leaves the weight alone where the two agree to within a few tenths', () => {
    const { felt, vectors, seconds } = clip(40, 0)
    expect(readFelt(felt, seconds, vectors)?.exit).toBe(readFelt(felt, seconds)?.exit)
  })

  it('leaves the weight alone when the direction never turned', () => {
    const { felt, seconds } = clip(40, 1)
    const same = felt.map((one) => [0, 0, one] as [number, number, number])
    expect(readFelt(felt, seconds, same)?.exit).toBe(readFelt(felt, seconds)?.exit)
  })

  it('ignores a turn further back than a second and a half before the weight goes', () => {
    const { felt, vectors, seconds } = clip(36, 1)
    expect(readFelt(felt, seconds, vectors)?.exit).toBe(readFelt(felt, seconds)?.exit)
  })
})

describe('where a cut starts from', () => {
  const moments = { exit: 38.6, canopy: 101.6, landing: 192.7 }

  it('is the measured instant on a montage', () => {
    expect(cutFrom(moments, true)).toBe(38.6)
  })

  it('is a second before it on a fun jump', () => {
    expect(cutFrom(moments, false)).toBeCloseTo(37.6, 5)
  })

  it('never runs before the clip does', () => {
    expect(cutFrom({ exit: 0.4 }, false)).toBe(0)
  })
})
