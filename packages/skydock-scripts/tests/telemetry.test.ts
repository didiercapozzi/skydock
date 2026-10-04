// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { accelerationIn, djiAcceleration, gpsIn } from '../src/telemetry'

const GRAVITY = 9.81

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

  it('is found however deeply it is wrapped', () => {
    const inner = Buffer.concat([scale(100), readings([[100, 0, 0]])])
    const stream = entry('DEVC', '\u0000', 1, inner.length, inner)
    expect(accelerationIn(stream)).toEqual([1])
  })

  it('reads nothing out of what is not a stream of measurements', () => {
    expect(accelerationIn(Buffer.from('not a stream at all', 'latin1'))).toEqual([])
  })
})

const asVarint = (value: number) => {
  const bytes: number[] = []
  let left = value
  do {
    const seven = left % 128
    left = Math.floor(left / 128)
    bytes.push(left > 0 ? seven + 128 : seven)
  } while (left > 0)
  return Buffer.from(bytes)
}

const key = (field: number, shape: number) => asVarint(field * 8 + shape)

const message = (field: number, body: Buffer) =>
  Buffer.concat([key(field, 2), asVarint(body.length), body])

const float = (field: number, value: number) => {
  const body = Buffer.alloc(4)
  body.writeFloatLE(value, 0)
  return Buffer.concat([key(field, 5), body])
}

const felt = (x: number, y: number, z: number) =>
  message(3, message(2, message(10, Buffer.concat([float(2, x), float(3, y), float(4, z)]))))

describe('what a DJI wrote down', () => {
  it('is read as motion, out of its own record', () => {
    const readings = djiAcceleration(Buffer.concat([felt(0, 0, 1), felt(0.6, 0, 0.8)]))
    expect(readings).toHaveLength(2)
    expect(readings[0]).toBeCloseTo(GRAVITY, 4)
    expect(readings[1]).toBeCloseTo(GRAVITY, 4)
  })

  it('reads nothing out of a record that holds no acceleration', () => {
    const other = message(3, message(2, message(11, float(2, 42))))
    expect(djiAcceleration(other)).toEqual([])
  })

  it('reads nothing out of what is not one of its records at all', () => {
    expect(djiAcceleration(Buffer.from('nothing of the sort', 'latin1'))).toEqual([])
  })
})

const scales = (by: number[]) => {
  const body = Buffer.alloc(by.length * 4)
  by.forEach((one, at) => body.writeInt32BE(one, at * 4))
  return entry('SCAL', 'l', 4, by.length, body)
}

const fix = (kind: number) => {
  const body = Buffer.alloc(4)
  body.writeUInt32BE(kind, 0)
  return entry('GPSF', 'L', 4, 1, body)
}

const gps5 = (samples: [number, number, number, number, number][]) => {
  const body = Buffer.alloc(samples.length * 20)
  samples.forEach((one, at) =>
    one.forEach((value, part) => body.writeInt32BE(value, at * 20 + part * 4))
  )
  return entry('GPS5', 'l', 20, samples.length, body)
}

const gps9 = (
  samples: { at: number[]; up: number; fast: number; day: number; second: number; sure: number }[]
) => {
  const body = Buffer.alloc(samples.length * 32)
  samples.forEach((one, at) => {
    const from = at * 32
    body.writeInt32BE(one.at[0], from)
    body.writeInt32BE(one.at[1], from + 4)
    body.writeInt32BE(one.up, from + 8)
    body.writeInt32BE(0, from + 12)
    body.writeInt32BE(one.fast, from + 16)
    body.writeInt32BE(one.day, from + 20)
    body.writeInt32BE(one.second, from + 24)
    body.writeUInt16BE(0, from + 28)
    body.writeUInt16BE(one.sure, from + 30)
  })
  return entry('GPS9', '?', 32, samples.length, body)
}

describe('where the camera says it was', () => {
  it('is read as metres above the sea and a speed in kilometres an hour', () => {
    const stream = Buffer.concat([
      scales([10_000_000, 10_000_000, 1000, 1000, 1000]),
      fix(3),
      gps5([
        [465_000_000, 68_000_000, 3_940_000, 2000, 55_000],
        [465_000_000, 68_000_000, 2_100_000, 2000, 51_000]
      ])
    ])
    const fixes = gpsIn(stream)
    expect(fixes).toHaveLength(2)
    expect(fixes[0].altitude).toBeCloseTo(3940, 3)
    expect(fixes[0].speed).toBeCloseTo(198, 3)
    expect(fixes[1].altitude).toBeCloseTo(2100, 3)
  })

  it('takes nothing from a receiver that has no fix in three dimensions', () => {
    const stream = Buffer.concat([
      scales([10_000_000, 10_000_000, 1000, 1000, 1000]),
      fix(2),
      gps5([[465_000_000, 68_000_000, 3_940_000, 2000, 55_000]])
    ])
    expect(gpsIn(stream)).toEqual([])
  })

  it('keeps the moment a newer receiver stamps on each fix', () => {
    const stream = Buffer.concat([
      scales([10_000_000, 10_000_000, 1000, 1000, 1000, 1, 1000, 100, 1]),
      gps9([
        {
          at: [465_000_000, 68_000_000],
          up: 3_940_000,
          fast: 55_000,
          day: 9500,
          second: 45_000_000,
          sure: 3
        },
        {
          at: [465_000_000, 68_000_000],
          up: 3_930_000,
          fast: 55_500,
          day: 9500,
          second: 45_100_000,
          sure: 3
        },
        {
          at: [465_000_000, 68_000_000],
          up: 3_920_000,
          fast: 56_000,
          day: 9500,
          second: 45_200_000,
          sure: 2
        }
      ])
    ])
    const fixes = gpsIn(stream)
    expect(fixes).toHaveLength(2)
    expect(fixes[0].at).toBe(0)
    expect(fixes[1].at).toBeCloseTo(100, 5)
    expect(fixes[1].altitude).toBeCloseTo(3930, 3)
  })

  it('reads nothing out of a camera that was never told where it was', () => {
    expect(gpsIn(Buffer.concat([scale(418), readings([[4180, 0, 0]])]))).toEqual([])
  })
})
