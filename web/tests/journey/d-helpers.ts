import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import type { Locator } from 'playwright'
import { expect } from 'vitest'
import { z } from 'zod'
import { makeBigClip, makeClip } from './media'
import type { World } from './app'

const tool = (name: 'ffmpeg' | 'ffprobe') =>
  process.env[name === 'ffmpeg' ? 'SKYDOCK_FFMPEG_PATH' : 'SKYDOCK_FFPROBE_PATH'] ?? name

const ask = (...args: string[]) => String(execFileSync(tool('ffprobe'), ['-v', 'error', ...args]))

const probeSchema = z.object({
  streams: z.array(z.object({ width: z.number(), height: z.number() }).passthrough())
})

const probe = (file: string) => {
  const parsed = probeSchema.parse(
    JSON.parse(
      ask(
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration',
        '-of',
        'json',
        file
      )
    )
  )
  const seconds = Number(
    ask('-show_entries', 'format=duration', '-of', 'csv=p=0', file).trim().split('\n')[0]
  )
  return { seconds, width: parsed.streams[0]!.width, height: parsed.streams[0]!.height }
}

const pictureSizes = (file: string) =>
  ask('-select_streams', 'v:0', '-show_entries', 'packet=size', '-of', 'csv=p=0', file)
    .trim()
    .split('\n')
    .join(',')

const isCopyOf = (copy: string, original: string) =>
  `,${pictureSizes(original)},`.includes(`,${pictureSizes(copy)},`)

const fileSchema = z.object({
  id: z.string().optional(),
  filename: z.string().optional(),
  size: z.number().optional(),
  cropStart: z.number().nullish(),
  cropEnd: z.number().nullish(),
  rotation: z.number().nullish(),
  frame: z.object({ width: z.number(), height: z.number() }).passthrough().nullish(),
  moments: z
    .object({
      exit: z.number(),
      opening: z.number().optional(),
      canopy: z.number().optional(),
      landing: z.number().optional()
    })
    .nullish(),
  foundMoments: z.object({ exit: z.number() }).passthrough().nullish(),
  processed: z.object({ size: z.number() }).passthrough().nullish()
})

const manifestSchema = z.object({ files: z.array(fileSchema) })
const groupsSchema = z.object({ groups: z.array(z.object({ files: z.array(fileSchema) })) })

const recorded = (world: World, filename: string) => {
  const read = (name: string) => JSON.parse(fs.readFileSync(`${world.output}/${name}`, 'utf8'))
  const file = manifestSchema
    .parse(read('manifest.json'))
    .files.find((one) => one.filename === filename)
  if (!file) throw new Error(`${filename} is not in the record`)
  const inJump = groupsSchema
    .parse(read('groups.json'))
    .groups.flatMap((group) => group.files)
    .find((one) => one.id === file.id)
  return { ...file, ...inJump }
}

const JUMP_LENGTH = 40

const felt = (second: number) => {
  if (second >= 6 && second < 9) return 0.3
  if (second >= 14 && second < 17) return 1.8
  if (second === 28) return 2
  return 1
}

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

const pressed = (what: Locator, on: boolean) =>
  expect.poll(() => what.getAttribute('aria-pressed')).toBe(String(on))

const gone = (what: Locator) => expect.poll(() => what.count()).toBe(0)

const said = (what: Locator, text: string) => expect.poll(() => what.innerText()).toContain(text)

const switchedOff = (what: Locator, off: boolean) => expect.poll(() => what.isDisabled()).toBe(off)

const makeOwnPhoto = (file: string, when: string) => {
  execFileSync(tool('ffmpeg'), [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x240:rate=1',
    '-frames:v',
    '1',
    file
  ])
  fs.utimesSync(file, new Date(when), new Date(when))
}

const photoFacts = (file: string) =>
  z
    .array(z.object({ Orientation: z.number().optional(), ImageWidth: z.number() }).passthrough())
    .parse(
      JSON.parse(
        String(
          execFileSync(process.env.SKYDOCK_EXIFTOOL_PATH ?? 'exiftool', [
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

export {
  gone,
  isCopyOf,
  makeBigClip,
  makeJumpClip,
  makeOwnPhoto,
  photoFacts,
  pressed,
  probe,
  recorded,
  said,
  switchedOff
}
