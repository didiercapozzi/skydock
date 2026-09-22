import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createTmpDir } from './fixtures'

const OUTPUT = createTmpDir('skydock-thumb-')

/* how many times a frame was actually cut, so "kept" can be told from "cut again" */
const runs = vi.hoisted(() => ({ ffmpeg: 0 }))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:child_process')
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      runs.ffmpeg += 1
      return actual.spawn(...args)
    }
  }
})

vi.mock('@skydock/scripts', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, getOutputDir: () => OUTPUT }
})

const { loader } = await import('../../app/routes/api.thumb.$')

/* a clip of a fifth of a second, as a camera's timelapse opens with */
const SHORT = 'original_files/short.mp4'

beforeAll(() => {
  fs.mkdirSync(path.join(OUTPUT, 'original_files'), { recursive: true })
  spawnSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=25:duration=0.2',
    '-pix_fmt',
    'yuv420p',
    path.join(OUTPUT, SHORT)
  ])
})

afterAll(() => {
  fs.rmSync(OUTPUT, { recursive: true, force: true })
})

const thumbnail = (splat: string, seek: number) =>
  loader({
    params: { '*': splat },
    request: new Request(`http://localhost/api/thumb/${splat}?seek=${seek}&width=160`)
  })

describe('a thumbnail', () => {
  test('of a clip shorter than the moment asked for is its first frame', async () => {
    const res = await thumbnail(SHORT, 0.5)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  test('of a file that is not there says so', async () => {
    const res = await thumbnail('original_files/nope.mp4', 0.5)
    expect(res.status).toBe(404)
  })
})

/* Every frame on the board is an ffmpeg run, and a browser asks for six at a time: a jump of
   sixteen clips was half a second of squares filling in, every time it was opened. Cut once and
   kept, it is a file read — and the proof that it is kept is that the frame still comes back when
   there is nothing left to cut it from. */
describe('a thumbnail already cut', () => {
  const KEPT = 'original_files/kept.mp4'

  test('is kept, and answers without cutting the clip again', async () => {
    const clip = path.join(OUTPUT, KEPT)
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=25:duration=1',
      '-pix_fmt',
      'yuv420p',
      clip
    ])
    const kept = () =>
      fs.existsSync(path.join(OUTPUT, '.thumbs'))
        ? fs.readdirSync(path.join(OUTPUT, '.thumbs')).length
        : 0
    const before = kept()

    runs.ffmpeg = 0
    const first = Buffer.from(await (await thumbnail(KEPT, 0.5)).arrayBuffer())

    expect(first.byteLength).toBeGreaterThan(0)
    /* more than once is fair: a clip whose only keyframe is its first is cut from there instead */
    expect(runs.ffmpeg).toBeGreaterThan(0)
    expect(kept()).toBe(before + 1)

    runs.ffmpeg = 0
    const again = Buffer.from(await (await thumbnail(KEPT, 0.5)).arrayBuffer())

    expect(again.equals(first)).toBe(true)
    expect(runs.ffmpeg).toBe(0)
  })

  test('is cut again when the file it is of has changed', async () => {
    const clip = path.join(OUTPUT, 'original_files/changed.mp4')
    const cut = (pattern: string) =>
      spawnSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `${pattern}=size=320x240:rate=25:duration=1`,
        '-pix_fmt',
        'yuv420p',
        clip
      ])

    cut('testsrc')
    const before = Buffer.from(
      await (await thumbnail('original_files/changed.mp4', 0.5)).arrayBuffer()
    )
    cut('smptebars')
    runs.ffmpeg = 0
    const after = Buffer.from(
      await (await thumbnail('original_files/changed.mp4', 0.5)).arrayBuffer()
    )

    expect(after.equals(before)).toBe(false)
    expect(runs.ffmpeg).toBeGreaterThan(0)
  })
})
