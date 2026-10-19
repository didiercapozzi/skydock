// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { filmEditSchema, timelineEnd } from '../src/filmEditShape'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { createTmpDir } from './fixtures'

let dir: string

const film = (layers: FilmEdit['layers']): FilmEdit => ({
  version: 1,
  clips: [{ id: 'clip-1', name: 'a.mp4', start: 0, end: 4, sound: false }],
  music: [],
  texts: [],
  underSound: 0.15,
  ...(layers ? { layers } : {})
})

const layer = (over: Record<string, unknown>) => ({
  id: 'layer-1',
  at: 1,
  seconds: 1,
  x: 0.5,
  y: 0.5,
  width: 0.5,
  ...over
})

const render = (edit: FilmEdit) => {
  const out = path.join(dir, 'film.mp4')
  const source: EditSource = {
    name: 'a.mp4',
    path: path.join(dir, 'a.mp4'),
    play: '',
    seconds: 4,
    sound: false,
    marks: []
  }
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...filmArgs({
        edit,
        sources: new Map([['a.mp4', source]]),
        images: new Map([
          ['dot.png', { name: 'dot.png', path: path.join(dir, 'dot.png'), width: 100, height: 100 }]
        ]),
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

const red = (got: { r: number; g: number; b: number }) => got.r > 240 && got.g < 10 && got.b < 10

const colourAt = (file: string, at: number, x: number, y: number) => {
  const [r = 0, g = 0, b = 0] = execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-ss',
    String(at),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `crop=2:2:${x}:${y}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  return { r, g, b }
}

beforeEach(() => {
  dir = createTmpDir('skydock-layers-')
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=320x180:r=25:d=4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    path.join(dir, 'a.mp4')
  ])
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=lime:s=100x100',
    '-frames:v',
    '1',
    path.join(dir, 'dot.png')
  ])
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the layers of a film', () => {
  it('are a picture from the images folder or a colour, with a place on the frame, and never both or neither', () => {
    expect(filmEditSchema.safeParse(film([layer({ name: 'dot.png' })])).success).toBe(true)
    expect(filmEditSchema.safeParse(film([layer({ colour: '#ffffff' })])).success).toBe(true)
    expect(filmEditSchema.safeParse(film([layer({})])).success).toBe(false)
    expect(
      filmEditSchema.safeParse(film([layer({ name: 'dot.png', colour: '#ffffff' })])).success
    ).toBe(false)
    expect(filmEditSchema.safeParse(film([layer({ colour: 'white' })])).success).toBe(false)
    expect(filmEditSchema.safeParse({ ...film(undefined) }).success).toBe(true)
  })

  it('count in the end of the timeline', () => {
    expect(timelineEnd(film([layer({ colour: '#000000', at: 3, seconds: 5 })]))).toBe(8)
  })

  it('cover the whole picture while a colour is on, and only then', () => {
    const file = render(film([layer({ colour: '#ffffff' })]))

    expect(red(colourAt(file, 0.5, 160, 90))).toBe(true)
    const on = colourAt(file, 1.5, 160, 90)
    expect(on.g).toBeGreaterThan(200)
    expect(colourAt(file, 1.5, 4, 4).g).toBeGreaterThan(200)
    expect(red(colourAt(file, 2.5, 160, 90))).toBe(true)
  })

  it('find their picture when a colour is listed before it', () => {
    const file = render(
      film([
        layer({ id: 'layer-1', colour: '#ffffff', at: 0, seconds: 1 }),
        layer({ id: 'layer-2', name: 'dot.png', x: 0.5, y: 0.5, width: 0.25, at: 2, seconds: 1 })
      ])
    )

    expect(colourAt(file, 2.5, 160, 90).r).toBeLessThan(250)
  })

  it('draw a picture where it is put, as wide as asked, over the film', () => {
    const file = render(film([layer({ name: 'dot.png', x: 0.25, y: 0.5, width: 0.25 })]))

    expect(colourAt(file, 1.5, 80, 90).g).toBeGreaterThan(200)
    expect(red(colourAt(file, 1.5, 240, 90))).toBe(true)
    expect(red(colourAt(file, 0.5, 80, 90))).toBe(true)
  })

  it('fade in and out over the film', () => {
    const file = render(
      film([layer({ colour: '#ffffff', at: 1, seconds: 2, fadeIn: 1, fadeOut: 1 })])
    )

    const early = colourAt(file, 1.1, 160, 90)
    const full = colourAt(file, 2, 160, 90)
    const late = colourAt(file, 2.9, 160, 90)
    expect(early.g).toBeLessThan(120)
    expect(full.g).toBeGreaterThan(200)
    expect(late.g).toBeLessThan(120)
  })
})
