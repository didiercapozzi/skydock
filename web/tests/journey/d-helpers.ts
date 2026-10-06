import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import type { Locator } from 'playwright'
import { expect } from 'vitest'
import { z } from 'zod'
import { ffprobe, makeClip, tool } from './media'

/* What the preview chapters share: asking the tools what a copy turned out to be, and a clip off a camera that
   records what it felt. */

/* the size in bytes of every picture a video file holds, in order: a copy that only cut the ends holds the
   very same pictures as the original, an encode again holds others */
const pictureSizes = (file: string) =>
  ffprobe('-select_streams', 'v:0', '-show_entries', 'packet=size', '-of', 'csv=p=0', file)
    .trim()
    .split('\n')
    .join(',')

/* the copy kept the original's pictures untouched, only the ends cut off */
const isCopyOf = (copy: string, original: string) =>
  `,${pictureSizes(original)},`.includes(`,${pictureSizes(copy)},`)

/* The seconds of a jump, in the order they happen, as what a camera felt each second of the clip:
   a gravity aboard the aeroplane, almost nothing for the three seconds after the door, a gravity in
   freefall, three seconds of the canopy opening, a gravity flying under it, and the ground. */
const JUMP_LENGTH = 40

const felt = (second: number) => {
  if (second >= 6 && second < 9) return 0.3
  if (second >= 14 && second < 17) return 1.8
  if (second === 28) return 2
  return 1
}

/* One reading a video frame, written the way a DJI writes them: a protocol buffer whose acceleration sits
   three levels down, in gravities, one number a component. */
const reading = (gravities: number) => {
  const part = Buffer.alloc(4)
  part.writeFloatLE(gravities)
  const zero = Buffer.alloc(4)
  const inner = Buffer.concat([
    Buffer.from([0x15]),
    zero,
    Buffer.from([0x1d]),
    zero,
    Buffer.from([0x25]),
    part
  ])
  const middle = Buffer.concat([Buffer.from([0x52, inner.length]), inner])
  const outer = Buffer.concat([Buffer.from([0x12, middle.length]), middle])
  return Buffer.concat([Buffer.from([0x1a, outer.length]), outer])
}

const box = (kind: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length + 8)
  head.write(kind, 4, 'latin1')
  return Buffer.concat([head, body])
}

const numbers = (...values: number[]) => {
  const out = Buffer.alloc(values.length * 4)
  values.forEach((value, at) => out.writeUInt32BE(value, at * 4))
  return out
}

/* the track a DJI keeps its measurements in: named `CAM meta`, one sample a video frame, all of them in one
   place at the end of the file */
const measurementsTrack = (samples: number, size: number, offset: number) => {
  const timescale = 1000
  const duration = JUMP_LENGTH * timescale
  const matrix = Buffer.alloc(36)
  matrix.writeUInt32BE(0x00010000, 0)
  matrix.writeUInt32BE(0x00010000, 16)
  matrix.writeUInt32BE(0x40000000, 32)
  const tkhd = box(
    'tkhd',
    numbers(3, 0, 0, 99, 0, duration),
    Buffer.alloc(8),
    Buffer.alloc(8),
    matrix,
    Buffer.alloc(8)
  )
  const mdhd = box('mdhd', numbers(0, 0, 0, timescale, duration), Buffer.from([0x55, 0xc4, 0, 0]))
  const hdlr = box(
    'hdlr',
    numbers(0, 0),
    Buffer.from('meta', 'latin1'),
    Buffer.alloc(12),
    Buffer.from('CAM meta\0', 'latin1')
  )
  const dinf = box('dinf', box('dref', numbers(0, 1), box('url ', numbers(1))))
  const entry = Buffer.concat([numbers(0, 0), Buffer.from([0, 1])])
  const stbl = box(
    'stbl',
    box('stsd', numbers(0, 1), box('djmd', entry)),
    box('stts', numbers(0, 1, samples, timescale / 25)),
    box('stsc', numbers(0, 1, 1, samples, 1)),
    box('stsz', numbers(0, size, samples)),
    box('stco', numbers(0, 1, offset))
  )
  return box(
    'trak',
    tkhd,
    box('mdia', mdhd, hdlr, box('minf', box('nmhd', numbers(0)), dinf, stbl))
  )
}

/* A clip off a camera that wrote down what it felt, in the one place ffmpeg could not put it: made as
   any clip is, then given the track a DJI gives its own — appended to the movie box at the end of the file,
   with the readings after it. */
const makeJumpClip = (file: string, when: string) => {
  makeClip(file, when, JUMP_LENGTH)
  const samples = JUMP_LENGTH * 25
  const readings = Buffer.concat(
    Array.from({ length: samples }, (_, at) => reading(felt(Math.floor(at / 25))))
  )
  const bytes = fs.readFileSync(file)
  let at = 0
  let moov = -1
  while (at < bytes.length) {
    if (bytes.toString('latin1', at + 4, at + 8) === 'moov') moov = at
    at += bytes.readUInt32BE(at)
  }
  if (moov < 0 || moov + bytes.readUInt32BE(moov) !== bytes.length)
    throw new Error('the movie box is not at the end of the clip')
  const grown = bytes.readUInt32BE(moov) + measurementsTrack(samples, reading(1).length, 0).length
  const track = measurementsTrack(samples, reading(1).length, moov + grown + 8)
  const head = Buffer.from(bytes.subarray(0, moov + bytes.readUInt32BE(moov)))
  head.writeUInt32BE(grown, moov)
  fs.writeFileSync(file, Buffer.concat([head, track, box('mdat', readings)]))
  fs.utimesSync(file, new Date(when), new Date(when))
}

/* what a person sees on a control, waited for as they would: pressed or not, shown or gone, switched off */
const pressed = (what: Locator, on: boolean) =>
  expect.poll(() => what.getAttribute('aria-pressed')).toBe(String(on))

const gone = (what: Locator) => expect.poll(() => what.count()).toBe(0)

const switchedOff = (what: Locator, off: boolean) => expect.poll(() => what.isDisabled()).toBe(off)

/* what a photo carries about how to be shown: the way it is to be turned, and how many pixels it has */
const photoFacts = (file: string) =>
  z
    .array(z.object({ Orientation: z.number().optional(), ImageWidth: z.number() }).passthrough())
    .parse(
      JSON.parse(
        String(
          execFileSync(tool('exiftool'), [
            '-json',
            '-n',
            '-Orientation',
            '-ImageWidth',
            '-ImageHeight',
            file
          ])
        )
      )
    )[0]!

export { gone, isCopyOf, makeJumpClip, photoFacts, pressed, switchedOff }
