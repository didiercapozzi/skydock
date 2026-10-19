// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { createTmpDir } from './fixtures'

let dir: string

const clip = (name: string, color: string, seconds: number) => {
  const file = path.join(dir, name)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=320x180:r=25:d=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=f=440:d=${seconds}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    file
  ])
  return { name, path: file, play: file, seconds, sound: true, marks: [] } satisfies EditSource
}

const film = (change: Partial<FilmEdit>): FilmEdit => ({
  version: 1,
  clips: [
    { id: 'clip-1', name: 'red.mp4', start: 0, end: 2, sound: true },
    { id: 'clip-2', name: 'blue.mp4', start: 0, end: 2, sound: true, gap: 1.5 }
  ],
  music: [],
  texts: [],
  underSound: 0.15,
  ...change
})

const render = (
  edit: FilmEdit,
  music = new Map<string, { name: string; path: string; seconds: number }>()
) => {
  const out = path.join(dir, 'film.mp4')
  const sources = new Map(
    [clip('red.mp4', 'red', 3), clip('blue.mp4', 'blue', 3)].map((one) => [one.name, one])
  )
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...filmArgs({
        edit,
        sources,
        music,
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

const seconds = (file: string) =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file
    ])
      .toString()
      .trim()
  )

const colourAt = (file: string, at: number) => {
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
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  if (Math.max(r, g, b) < 40) return 'black'
  return r > b ? 'red' : 'blue'
}

const meanDb = (file: string, from: number, to: number) => {
  const ran = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-ss',
      String(from),
      '-t',
      String(to - from),
      '-i',
      file,
      '-af',
      'volumedetect',
      '-vn',
      '-f',
      'null',
      '-'
    ],
    { encoding: 'utf-8' }
  )
  return Number(/mean_volume: (-?[\d.]+|-inf) dB/.exec(ran.stderr)?.[1] ?? Number.NEGATIVE_INFINITY)
}

beforeEach(() => {
  dir = createTmpDir('skydock-gap-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('rendering a film with a gap', () => {
  it('shows black in the gap and the clip colours around it, over the whole length', () => {
    const file = render(film({}))

    expect(seconds(file)).toBeCloseTo(5.5, 0)
    expect(colourAt(file, 1)).toBe('red')
    expect(colourAt(file, 2.75)).toBe('black')
    expect(colourAt(file, 4.5)).toBe('blue')
  })

  it('is silent in the gap, and the camera sound is there around it', () => {
    const file = render(film({}))

    expect(meanDb(file, 2.1, 3.4)).toBeLessThan(-60)
    expect(meanDb(file, 0.2, 1.8)).toBeGreaterThan(-40)
    expect(meanDb(file, 4, 5.4)).toBeGreaterThan(-40)
  })

  it('runs on in black to the end of a text that goes past the last video', () => {
    fs.writeFileSync(path.join(dir, 'text-1.txt'), 'Fin')
    const file = render(
      film({
        texts: [
          {
            id: 'text-1',
            text: 'Fin',
            at: 6,
            seconds: 1.5,
            effect: 'fade',
            font: 'clean',
            x: 0.5,
            y: 0.5,
            size: 0.1,
            colour: '#ffffff'
          }
        ]
      })
    )

    expect(seconds(file)).toBeCloseTo(7.5, 0)
    expect(colourAt(file, 5.2)).toBe('blue')
    expect(colourAt(file, 6.8)).toBe('black')
  })

  it('runs on to the end of the music, which plays over the black', () => {
    const song = path.join(dir, 'song.mp3')
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=f=220:d=8',
      song
    ])
    const file = render(
      film({ music: [{ id: 'music-1', name: 'song.mp3', at: 1, start: 0, end: 7, volume: 1 }] }),
      new Map([['song.mp3', { name: 'song.mp3', path: song, seconds: 8 }]])
    )

    expect(seconds(file)).toBeCloseTo(8, 0)
    expect(colourAt(file, 7)).toBe('black')
    expect(meanDb(file, 6, 7.5)).toBeGreaterThan(-40)
  })

  it('does not change the length of a film that has no gap and nothing after its last video', () => {
    const file = render(film({ clips: film({}).clips.map((one) => ({ ...one, gap: undefined })) }))

    expect(seconds(file)).toBeCloseTo(4, 0)
  })
})
