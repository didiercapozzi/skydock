import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createTmpDir } from './fixtures'

const OUTPUT = createTmpDir('skydock-thumb-')

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
