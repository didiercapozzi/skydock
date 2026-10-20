// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { durationOf, rgbAt } from './ffmpegFixtures'
import { createTmpDir } from './fixtures'

let dir: string

const colourAt = (file: string, at: number) => rgbAt(file, { at, filter: 'crop=2:2:30:30' })

beforeEach(() => {
  dir = createTmpDir('skydock-seek-')
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=64x64:r=25:d=2',
    '-f',
    'lavfi',
    '-i',
    'color=c=lime:s=64x64:r=25:d=2',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=64x64:r=25:d=2',
    '-filter_complex',
    '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-g',
    '250',
    '-pix_fmt',
    'yuv420p',
    path.join(dir, 'strips.mp4')
  ])
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('a clip taken from the middle of a file', () => {
  it('shows what the file shows at the start of the part and not what comes before it, and has the length asked', () => {
    const edit: FilmEdit = {
      version: 1,
      clips: [{ id: 'clip-1', name: 'strips.mp4', start: 3, end: 5, sound: false, speed: 2 }],
      music: [],
      texts: [],
      underSound: 0.15
    }
    const source: EditSource = {
      name: 'strips.mp4',
      path: path.join(dir, 'strips.mp4'),
      play: '',
      seconds: 6,
      sound: false,
      marks: []
    }
    const out = path.join(dir, 'film.mp4')
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      ...filmArgs({
        edit,
        sources: new Map([['strips.mp4', source]]),
        music: new Map(),
        width: 64,
        height: 64,
        fonts: {},
        textFileOf: () => '/tmp/none.txt',
        out
      })
    ])

    const length = durationOf(out)
    expect(length).toBeCloseTo(1, 0)
    expect(colourAt(out, 0.1).g).toBeGreaterThan(200)
    expect(colourAt(out, 0.1).r).toBeLessThan(60)
    expect(colourAt(out, 0.9).b).toBeGreaterThan(200)
  })
})
