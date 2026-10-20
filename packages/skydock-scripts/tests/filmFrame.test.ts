// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { filmEditSchema } from '../src/filmEditShape'
import type { EditClip, EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { rgbAt } from './ffmpegFixtures'
import { createTmpDir } from './fixtures'

let dir: string

const source = (): EditSource => ({
  name: 'a.mp4',
  path: path.join(dir, 'a.mp4'),
  play: '',
  seconds: 3,
  sound: false,
  marks: []
})

const film = (clip: Partial<EditClip>): FilmEdit => ({
  version: 1,
  clips: [{ id: 'clip-1', name: 'a.mp4', start: 0, end: 2, sound: false, ...clip }],
  music: [],
  texts: [],
  underSound: 0.15
})

const render = (edit: FilmEdit, name = 'film.mp4') => {
  const out = path.join(dir, name)
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...filmArgs({
        edit,
        sources: new Map([['a.mp4', source()]]),
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

const colourAt = (file: string, x: number, y: number) => {
  const { r, b } = rgbAt(file, { filter: `crop=2:2:${x}:${y}` })
  return r + b < 60 ? 'black' : r > b ? 'red' : 'blue'
}

beforeEach(() => {
  dir = createTmpDir('skydock-frame-')
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=160x100:r=25:d=3',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=160x100:r=25:d=3',
    '-filter_complex',
    'hstack',
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

describe('the frame of a clip', () => {
  it('is read back as a crop of the picture and a quarter turn, and nothing else', () => {
    const frame = { x: 0.5, y: 0, width: 0.5, height: 1 }
    expect(filmEditSchema.safeParse(film({ frame, rotation: 90 })).success).toBe(true)
    expect(filmEditSchema.safeParse(film({ rotation: 45 as never })).success).toBe(false)
    expect(
      filmEditSchema.parse(film({ frame: { ...frame, width: 2 } })).clips[0]!.frame?.width
    ).toBe(1)
  })

  it('is not in the picture graph of a clip that has none', () => {
    const graph = filmArgs({
      edit: film({}),
      sources: new Map([['a.mp4', source()]]),
      music: new Map(),
      width: 320,
      height: 180,
      fonts: {},
      textFileOf: () => '',
      out: 'x'
    }).join(' ')
    expect(graph).not.toContain('transpose')
    expect(graph).not.toContain('crop=')
  })

  it('shows only what is cropped to, scaled to the frame of the film', () => {
    const file = render(film({ frame: { x: 0.5, y: 0, width: 0.5, height: 1 } }))

    expect(colourAt(file, 160, 90)).toBe('blue')
    expect(colourAt(file, 100, 90)).toBe('blue')
    expect(colourAt(file, 160, 2)).toBe('blue')
    expect(colourAt(file, 160, 176)).toBe('blue')
  })

  it('keeps the whole crop in the frame, as large as the frame allows, with black where it does not reach', () => {
    const tall = render(film({ frame: { x: 0.25, y: 0, width: 0.25, height: 1 } }), 'tall.mp4')

    expect(colourAt(tall, 160, 2)).toBe('red')
    expect(colourAt(tall, 160, 176)).toBe('red')
    expect(colourAt(tall, 2, 90)).toBe('black')
    expect(colourAt(tall, 316, 90)).toBe('black')
  })

  it('turns the picture a quarter turn before it is cropped, and fits it in the frame', () => {
    const file = render(film({ rotation: 90 }))

    expect(colourAt(file, 160, 20)).toBe('red')
    expect(colourAt(file, 160, 160)).toBe('blue')
    expect(colourAt(file, 5, 90)).toBe('black')
  })

  it('crops what was turned, and not what was shot', () => {
    const file = render(film({ rotation: 90, frame: { x: 0, y: 0.5, width: 1, height: 0.5 } }))

    expect(colourAt(file, 160, 20)).toBe('blue')
    expect(colourAt(file, 160, 160)).toBe('blue')
  })
})
