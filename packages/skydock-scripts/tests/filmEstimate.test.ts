// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  estimateKey,
  estimatedBytes,
  sampleWindows,
  sizeAtCrf,
  sizeWords
} from '../src/filmEditShape'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { measureFilm } from '../src/filmEstimate'
import { filmArgs } from '../src/filmRender'
import { createTmpDir } from './fixtures'

const clip = (id: string, name: string, start: number, end: number) => ({
  id,
  name,
  start,
  end,
  sound: false
})

const film = (clips: FilmEdit['clips'], output?: FilmEdit['output']): FilmEdit => ({
  version: 1,
  clips,
  music: [],
  texts: [],
  underSound: 0.15,
  ...(output ? { output } : {})
})

describe('where a film is sampled to guess its size', () => {
  const sources = new Map<string, { still?: boolean }>([
    ['a.mp4', {}],
    ['b.mp4', {}],
    ['c.mp4', {}],
    ['d.mp4', {}],
    ['photo.jpg', { still: true }]
  ])

  it('is a few seconds from the middle of each of up to three videos spread along the film', () => {
    const edit = film([
      clip('1', 'a.mp4', 0, 20),
      clip('2', 'b.mp4', 10, 40),
      clip('3', 'c.mp4', 0, 30),
      clip('4', 'd.mp4', 5, 15)
    ])

    const windows = sampleWindows(edit, sources)

    expect(windows).toHaveLength(3)
    expect(new Set(windows.map((one) => one.clipId)).size).toBe(3)
    for (const one of windows) {
      const made = edit.clips.find((c) => c.id === one.clipId)!
      expect(one.end - one.start).toBeCloseTo(3)
      expect(one.start).toBeGreaterThanOrEqual(made.start)
      expect(one.end).toBeLessThanOrEqual(made.end)
    }
    expect(windows[0]!.clipId).not.toBe(windows[2]!.clipId)
  })

  it('is the whole clip when it is shorter than that, skips photos, and is nothing without a video', () => {
    expect(sampleWindows(film([clip('1', 'a.mp4', 2, 3.5)]), sources)).toEqual([
      { clipId: '1', start: 2, end: 3.5 }
    ])
    expect(
      sampleWindows(film([clip('1', 'photo.jpg', 0, 5), clip('2', 'a.mp4', 0, 10)]), sources).map(
        (one) => one.clipId
      )
    ).toEqual(['2'])
    expect(sampleWindows(film([clip('1', 'photo.jpg', 0, 5)]), sources)).toEqual([])
    expect(sampleWindows(film([]), sources)).toEqual([])
  })
})

describe('the size guessed between two measures', () => {
  const points = [
    { crf: 12, bytesPerSecond: 5_000_000 },
    { crf: 40, bytesPerSecond: 200_000 }
  ]

  it('is the measure at each end, and in between falls as steadily as the quality number rises', () => {
    expect(sizeAtCrf(points, 12)).toBeCloseTo(5_000_000)
    expect(sizeAtCrf(points, 40)).toBeCloseTo(200_000)
    expect(sizeAtCrf(points, 26)).toBeCloseTo(Math.sqrt(5_000_000 * 200_000), -2)
    expect(sizeAtCrf(points, 20)).toBeGreaterThan(sizeAtCrf(points, 30))
  })

  it('is the bytes of the film, with sound as well when anything is heard', () => {
    expect(estimatedBytes(points, 12, 100, false)).toBeCloseTo(500_000_000)
    expect(estimatedBytes(points, 12, 100, true)).toBeCloseTo(502_400_000)
  })

  it('is said in megabytes under a gigabyte and in gigabytes above', () => {
    expect(sizeWords(640_000_000)).toBe('640 MB')
    expect(sizeWords(3_009_810_463)).toBe('3.0 GB')
    expect(sizeWords(1_460_000_000)).toBe('1.5 GB')
    expect(sizeWords(0)).toBe('0 MB')
  })
})

describe('what makes a measure be made again', () => {
  const base = film([clip('1', 'a.mp4', 0, 10)], { format: 'h264', fps: 60, crf: 20 })

  it('is the clips, the format and the frame rate, and not the quality asked, the texts or the music', () => {
    const key = estimateKey('g1', base)

    expect(estimateKey('g1', { ...base, output: { ...base.output, crf: 35 } })).toBe(key)
    expect(
      estimateKey('g1', {
        ...base,
        music: [{ id: 'm', name: 'x.mp3', at: 0, start: 0, end: 9, volume: 1 }]
      })
    ).toBe(key)
    expect(estimateKey('g2', base)).not.toBe(key)
    expect(estimateKey('g1', { ...base, output: { ...base.output, fps: 30 } })).not.toBe(key)
    expect(estimateKey('g1', { ...base, output: { ...base.output, format: 'h265' } })).not.toBe(key)
    expect(estimateKey('g1', film([clip('1', 'a.mp4', 0, 11)], base.output))).not.toBe(key)
  })
})

describe('measuring a film', () => {
  let dir: string
  beforeEach(() => {
    dir = createTmpDir('skydock-estimate-')
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=640x360:r=30:d=12',
      '-c:v',
      'libx264',
      '-crf',
      '10',
      '-pix_fmt',
      'yuv420p',
      path.join(dir, 'a.mp4')
    ])
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  const source: EditSource = {
    name: 'a.mp4',
    path: '',
    play: '',
    seconds: 12,
    sound: false,
    marks: []
  }

  it('finds a size for the quality that follows the real one, and a bigger one for a better quality', async () => {
    const sources = new Map([['a.mp4', { ...source, path: path.join(dir, 'a.mp4') }]])
    const edit = film([clip('1', 'a.mp4', 0, 12)], { fps: 30 })

    const points = await measureFilm({ edit, sources, width: 640, height: 360 })

    expect(points).not.toBeNull()
    expect(points![0]!.bytesPerSecond).toBeGreaterThan(points![1]!.bytesPerSecond)

    const out = path.join(dir, 'real.mp4')
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      ...filmArgs({
        edit: { ...edit, output: { fps: 30, crf: 23 } },
        sources,
        music: new Map(),
        width: 640,
        height: 360,
        fonts: {},
        textFileOf: () => '/tmp/none.txt',
        out
      })
    ])
    const real = fs.statSync(out).size
    const guessed = estimatedBytes(points!, 23, 12, false)
    expect(guessed).toBeGreaterThan(real * 0.65)
    expect(guessed).toBeLessThan(real * 1.35)
  })

  it('has nothing to measure when the film has no video', async () => {
    expect(
      await measureFilm({
        edit: film([clip('1', 'photo.jpg', 0, 5)]),
        sources: new Map([['photo.jpg', { ...source, name: 'photo.jpg', still: true }]]),
        width: 640,
        height: 360
      })
    ).toBeNull()
  })
})
