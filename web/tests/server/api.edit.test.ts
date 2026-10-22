// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveManifest } from '@skydock/scripts'
import { loader } from '../../app/routes/api.edit'
import { createTmpDir, routeArgs } from './fixtures'

let dir: string
let was: string | undefined

const clip = () => {
  const file = path.join(dir, 'original_files', 'GX010001.MP4')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=160x90:r=25:d=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    file
  ])
  return file
}

const board = (over: Record<string, unknown> = {}) => {
  const files = [
    { path: clip(), size: 1, mtime: 1_788_000_000, filename: 'GX010001.MP4', id: 'v1' }
  ]
  return saveManifest(path.join(dir, 'manifest.json'), {
    version: 1,
    createdAt: '2026-09-06',
    files,
    groups: [
      {
        id: 'g1',
        label: 'luc',
        day: '06.09.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files,
        ...over
      }
    ],
    destinations: []
  })
}

const open = async (groupId = 'g1') =>
  (await (
    (await loader(
      routeArgs(
        new Request(
          `http://localhost/api/edit?q=${encodeURIComponent(JSON.stringify({ groupId }))}`
        )
      )
    )) as Response
  ).json()) as {
    ok: boolean
    reason?: string
    sources: { name: string; seconds: number }[]
    waiting: unknown[]
    edit: { clips: { name: string }[] }
    members: string[]
  }

beforeEach(() => {
  dir = createTmpDir('skydock-api-edit-')
  was = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = dir
  process.env.SKYDOCK_CONFIG_DIR = dir
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = was
})

describe('opening the film editor on a montage', () => {
  it('needs nothing processed: its clips are there, laid end to end', async () => {
    await board()

    const opened = await open()

    expect(opened.ok).toBe(true)
    expect(opened.sources).toHaveLength(1)
    expect(opened.sources[0]?.seconds).toBeCloseTo(2, 0)
    expect(opened.edit.clips.map((c) => c.name)).toEqual([opened.sources[0]?.name])
    expect(opened.members).toEqual(['v1'])
    expect(fs.existsSync(path.join(dir, 'processed'))).toBe(false)
  })

  it('is refused for a montage that has no name, and for one that was freed', async () => {
    await board({ passenger: undefined })
    expect(await open()).toMatchObject({ ok: false, reason: expect.stringContaining('name') })

    await board({ freed: { at: 1, bytes: 1 } })
    expect(await open()).toMatchObject({ ok: false, reason: expect.stringContaining('freed') })
  })

  it('lists apart a clip changed on the board, until its small copy is made', async () => {
    await board({
      files: [
        {
          path: path.join(dir, 'original_files', 'GX010001.MP4'),
          size: 1,
          mtime: 1_788_000_000,
          filename: 'GX010001.MP4',
          id: 'v1',
          cropStart: 0.5
        }
      ]
    })

    const opened = await open()

    expect(opened.sources).toEqual([])
    expect(opened.waiting).toEqual([{ key: 'v1', name: 'GX010001.MP4' }])
  })
})
