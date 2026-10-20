// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { availableFormats, filmArgs } from '../src/filmRender'
import { createTmpDir } from './fixtures'

let dir: string

const source: EditSource = {
  name: 'a.mp4',
  path: '',
  play: '',
  seconds: 3,
  sound: false,
  marks: []
}

const film = (output: FilmEdit['output']): FilmEdit => ({
  version: 1,
  clips: [{ id: 'clip-1', name: 'a.mp4', start: 0, end: 3, sound: false }],
  music: [],
  texts: [],
  underSound: 0.15,
  output
})

const made = (name: string, output: FilmEdit['output']) => {
  const out = path.join(dir, name)
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...filmArgs({
        edit: film(output),
        sources: new Map([['a.mp4', { ...source, path: path.join(dir, 'a.mp4') }]]),
        music: new Map(),
        width: 320,
        height: 180,
        fonts: {},
        textFileOf: (id) => path.join(dir, `${id}.txt`),
        out
      })
    ],
    { stdio: 'pipe' }
  )
  return out
}

const probe = (file: string) =>
  JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v',
      '-show_entries',
      'stream=codec_name,codec_tag_string,r_frame_rate,color_space,color_primaries,color_transfer',
      '-of',
      'json',
      file
    ]).toString()
  ).streams[0] as { codec_name: string; codec_tag_string: string; r_frame_rate: string }

beforeEach(() => {
  dir = createTmpDir('skydock-output-')
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:r=25:d=3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    path.join(dir, 'a.mp4')
  ])
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the file that a render makes', () => {
  it('is H.264 at 30 frames a second when nothing is chosen', () => {
    expect(probe(made('plain.mp4', undefined))).toMatchObject({
      codec_name: 'h264',
      r_frame_rate: '30/1'
    })
  })

  it('says in the file that its colours are those of HD video, as Kdenlive does, in every format', async () => {
    for (const format of await availableFormats()) {
      expect(probe(made(`${format}-colours.mp4`, { format }))).toMatchObject({
        color_space: 'bt709',
        color_primaries: 'bt709',
        color_transfer: 'bt709'
      })
    }
  })

  it('has the frame rate that is chosen', () => {
    expect(probe(made('slow.mp4', { fps: 24 }))).toMatchObject({ r_frame_rate: '24/1' })
    expect(probe(made('fast.mp4', { fps: 60 }))).toMatchObject({ r_frame_rate: '60/1' })
  })

  it('is smaller when the quality number is higher, which is a lower quality', () => {
    const sharp = fs.statSync(made('sharp.mp4', { crf: 14 })).size
    const soft = fs.statSync(made('soft.mp4', { crf: 40 })).size

    expect(soft).toBeLessThan(sharp)
  })

  it('is in each format this computer can make, the H.265 one tagged hvc1', async () => {
    const formats = await availableFormats()
    for (const format of formats) {
      const file = probe(made(`${format}.mp4`, { format }))
      expect(file.codec_name).toBe({ h264: 'h264', h265: 'hevc', av1: 'av1' }[format])
      if (format === 'h265') expect(file.codec_tag_string).toBe('hvc1')
    }
  }, 60_000)
})
