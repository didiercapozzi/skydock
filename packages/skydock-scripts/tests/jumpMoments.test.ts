// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { accelerationIn, readFelt } from '../src/jumpMoments'

/* Where the jump is in a clip, read off what the camera felt. The numbers here are the shape of a
   real tandem, measured off jumps that were then checked frame by frame: a minute in the plane at
   one gravity, a few seconds of next to nothing at the door, fifty seconds of freefall at one
   gravity again — drag against weight — the opening at two, a canopy ride, and the ground. */

const GRAVITY = 9.81

/* one second of readings at the rate a GoPro writes them */
const second = (gravities: number) => Array.from({ length: 200 }, () => gravities * GRAVITY)

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
    ...second(2.1),
    ...Array.from({ length: canopy }, () => second(1)).flat(),
    ...second(1.5),
    ...Array.from({ length: after }, () => second(1)).flat()
  ]
  return { felt, seconds: felt.length / 200 }
}

describe('where the jump is in a clip', () => {
  it('is the second the plane was left, the canopy opened, and the ground arrived', () => {
    const { felt, seconds } = jump()
    expect(readFelt(felt, seconds)).toEqual({ exit: 40, canopy: 96, landing: 187 })
  })

  /* Freefall weighs one gravity, the same as sitting in the plane — drag has caught up with
     weight. Only the seconds at the door weigh less, and that is the whole of what is looked for. */
  it('is not fooled by freefall weighing what the plane did', () => {
    const { felt, seconds } = jump({ freefall: 60 })
    expect(readFelt(felt, seconds)?.exit).toBe(40)
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
      ...second(2.1) /* the canopy */,
      ...Array.from({ length: 20 }, () => second(1)).flat()
    ]
    const found = readFelt(felt, felt.length / 200)
    expect(found?.exit).toBe(30)
    expect(found?.canopy).toBe(81)
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
      canopy: undefined,
      landing: undefined
    })
  })
})

/* What a GoPro writes is a stream of keys, each saying its own type, size and count, nested the same
   way. These build one by hand — the accelerometer, and the scale that turns its counts into
   motion — so that reading it is tested without a camera. */
const entry = (key: string, type: string, size: number, count: number, body: Buffer) => {
  const head = Buffer.alloc(8)
  head.write(key.padEnd(4), 0, 'latin1')
  head.write(type, 4, 'latin1')
  head[5] = size
  head.writeUInt16BE(count, 6)
  const padding = Buffer.alloc((4 - (body.length % 4)) % 4)
  return Buffer.concat([head, body, padding])
}

const readings = (triples: [number, number, number][]) => {
  const body = Buffer.alloc(triples.length * 6)
  triples.forEach(([x, y, z], at) => {
    body.writeInt16BE(x, at * 6)
    body.writeInt16BE(y, at * 6 + 2)
    body.writeInt16BE(z, at * 6 + 4)
  })
  return entry('ACCL', 's', 6, triples.length, body)
}

const scale = (by: number) => {
  const body = Buffer.alloc(2)
  body.writeInt16BE(by, 0)
  return entry('SCAL', 's', 2, 1, body)
}

describe('what the camera wrote down', () => {
  it('is read as motion, at the scale the camera says', () => {
    const stream = Buffer.concat([
      scale(418),
      readings([
        [4180, 0, 0],
        [0, 0, 2090]
      ])
    ])
    const felt = accelerationIn(stream)
    expect(felt).toHaveLength(2)
    expect(felt[0]).toBeCloseTo(10, 5)
    expect(felt[1]).toBeCloseTo(5, 5)
  })

  /* the measurements sit inside a container per device, so they are found by walking rather than
     by reading at an offset */
  it('is found however deeply it is wrapped', () => {
    const inner = Buffer.concat([scale(100), readings([[100, 0, 0]])])
    const stream = entry('DEVC', '\u0000', 1, inner.length, inner)
    expect(accelerationIn(stream)).toEqual([1])
  })

  it('reads nothing out of what is not a stream of measurements', () => {
    expect(accelerationIn(Buffer.from('not a stream at all', 'latin1'))).toEqual([])
  })
})
