import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createTmpDir } from './fixtures'

const OUTPUT = createTmpDir('skydock-track-')

vi.mock('@skydock/scripts', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, getOutputDir: () => OUTPUT }
})

const { loader } = await import('../../app/routes/api.track.$')

/* a clip made here, which no camera measured anything about */
const PLAIN = 'original_files/plain.mp4'

beforeAll(() => {
  fs.mkdirSync(path.join(OUTPUT, 'original_files'), { recursive: true })
  spawnSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=25:duration=1',
    '-pix_fmt',
    'yuv420p',
    path.join(OUTPUT, PLAIN)
  ])
})

afterAll(() => {
  fs.rmSync(OUTPUT, { recursive: true, force: true })
})

const asked = async (splat: string) => {
  const answer = await loader({ params: { '*': splat } })
  return { status: answer.status, body: (await answer.json()) as { track: unknown } }
}

/* The graph's numbers, read off the original when a clip is opened (RULES, The jump on a graph). */
describe('a clip asked what it measured', () => {
  /* Most clips have nothing in them to draw: ground footage, a phone, a camera that measures
     nothing. Saying so is the answer, and the graph shows nothing rather than an empty frame. */
  test('answers with nothing when its camera measured nothing', async () => {
    const { status, body } = await asked(PLAIN)
    expect(status).toBe(200)
    expect(body.track).toBeNull()
  })

  test('is not found when there is no such clip', async () => {
    const answer = await loader({ params: { '*': 'original_files/never-was.mp4' } })
    expect(answer.status).toBe(404)
  })
})
