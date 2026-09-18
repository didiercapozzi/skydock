// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { saveManifest } from '../src/manifest'
import { lookAtTandems } from '../src/tandemWatch'
import type { Manifest } from '../src/types'
import { createTmpDir, execSyncMock } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

/* The film is rendered by the editor, and nothing tells SkyDock when it is done. While a board is
   open the tandems' folders are looked at again and again, and what one holds is said once it has
   stopped changing — so the Rendered step ticks by itself. Each `look` here is one of those. */

let outputDir: string
let folder: string
let heard: LiveEvent[]
let stop: () => void

/* whether ffprobe can read the film yet: one still being written has no length to give */
let readable = true

const film = () => path.join(folder, 'luc_favre_20260801.mp4')
const look = (times = 1) => {
  for (let i = 0; i < times; i++) lookAtTandems(outputDir)
}
const tandemsTold = () => heard.flatMap((e) => (e.kind === 'tandem' ? [e] : []))

beforeEach(() => {
  outputDir = createTmpDir('skydock-watch-')
  folder = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'luc_favre_20260801.kdenlive'), '<mlt/>')
  const at = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
  const files = [{ id: 'v1', path: '/o/GX01.MP4', filename: 'GX01.MP4', size: 1, mtime: at }]
  const manifest: Manifest = {
    version: 1,
    createdAt: 'x',
    files,
    groups: [
      {
        id: 'g1',
        label: 'g1',
        day: '01.08.2026',
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files
      }
    ]
  }
  saveManifest(path.join(outputDir, 'manifest.json'), manifest)
  readable = true
  execSyncMock.mockImplementation((cmd: string | Buffer) => {
    const line = String(cmd)
    if (line.startsWith('ffprobe')) {
      if (!readable) throw new Error('moov atom not found')
      return '312.4\n'
    }
    return Buffer.from('/usr/bin/x')
  })
  globalThis.skydockTandemWatch = undefined
  globalThis.skydockLive = undefined
  heard = []
  stop = subscribe((event) => heard.push(event))
})

afterEach(() => {
  stop()
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('a film rendered by the editor', () => {
  it('is told to the board once it has stopped being written', () => {
    look(3)
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    look()
    expect(tandemsTold().at(-1)?.fact.film).toBeNull()

    look(2)
    const told = tandemsTold().at(-1)
    expect(told).toMatchObject({ groupId: 'g1', who: 'Luc Favre', rendered: true })
    expect(told?.fact.film).toMatchObject({ size: 64, seconds: 312 })
  })

  /* it grows at every look while the editor writes it, and that is not a film yet */
  it('is not told while it is still growing', () => {
    look(3)
    const before = tandemsTold().length
    for (const size of [10, 20, 30, 40]) {
      fs.writeFileSync(film(), Buffer.alloc(size, 1))
      look()
    }
    expect(tandemsTold()).toHaveLength(before)
  })

  /* size alone can stand still in the middle of a render; a film with no length is not finished */
  it('is not told while it cannot be read, however still it sits', () => {
    look(3)
    const before = tandemsTold().length
    readable = false
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    look(5)

    expect(tandemsTold()).toHaveLength(before)
  })

  it('is told once, not at every look', () => {
    look(3)
    fs.writeFileSync(film(), Buffer.alloc(64, 1))
    look(8)

    expect(tandemsTold().filter((e) => e.rendered)).toHaveLength(1)
  })

  /* The board was drawn from a look of its own a moment before this began, so the first telling is
     where every tandem stands — said plainly, not as news. */
  it('first says where the tandem stands, without calling a film already there a new render', () => {
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    look(3)

    expect(tandemsTold()).toHaveLength(1)
    expect(tandemsTold()[0]).toMatchObject({ rendered: false })
    expect(tandemsTold()[0]?.fact).toMatchObject({ project: true })
  })
})
