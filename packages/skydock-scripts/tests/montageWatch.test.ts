// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { saveManifest } from '../src/manifest'
import { forgetWatched, lookAtMontages } from '../src/montageWatch'
import type { Manifest } from '../src/types'
import { createTmpDir, execSyncMock, tellTools } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

let outputDir: string
let folder: string
let heard: LiveEvent[]
let stop: () => void

let readable = true

const film = () => path.join(folder, 'luc_favre_20260801.mp4')
const look = async (times = 1) => {
  for (let i = 0; i < times; i++) {
    await lookAtMontages(outputDir)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
const montagesTold = () => heard.flatMap((e) => (e.kind === 'montage' ? [e] : []))

beforeEach(async () => {
  outputDir = createTmpDir('skydock-watch-')
  folder = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'luc_favre_20260801.edit.json'), '<mlt/>')
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
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files
      }
    ]
  }
  await saveManifest(path.join(outputDir, 'manifest.json'), manifest)
  readable = true
  tellTools()
  execSyncMock.mockImplementation((cmd: string | Buffer) => {
    const line = String(cmd)
    if (line.startsWith('ffprobe')) {
      if (!readable) throw new Error('moov atom not found')
      return '312.4\n'
    }
    return Buffer.from('/usr/bin/x')
  })
  globalThis.skydockMontageWatch = undefined
  globalThis.skydockLive = undefined
  heard = []
  stop = subscribe((event) => heard.push(event))
})

afterEach(() => {
  stop()
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('a film rendered by the editor', () => {
  it('is told to the board once it has stopped being written', async () => {
    await look(3)
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    await look()
    expect(montagesTold().at(-1)?.fact.film).toBeNull()

    await look(2)
    const told = montagesTold().at(-1)
    expect(told).toMatchObject({ groupId: 'g1', who: 'Luc Favre', rendered: true })
    expect(told?.fact.film).toMatchObject({ size: 64, seconds: 312 })
  })

  it('is not told while it is still growing', async () => {
    await look(3)
    const before = montagesTold().length
    for (const size of [10, 20, 30, 40]) {
      fs.writeFileSync(film(), Buffer.alloc(size, 1))
      await look()
    }
    expect(montagesTold()).toHaveLength(before)
  })

  it('is not told while it cannot be read, however still it sits', async () => {
    await look(3)
    const before = montagesTold().length
    readable = false
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    await look(5)

    expect(montagesTold()).toHaveLength(before)
  })

  it('is told once, not at every look', async () => {
    await look(3)
    fs.writeFileSync(film(), Buffer.alloc(64, 1))
    await look(8)

    expect(montagesTold().filter((e) => e.rendered)).toHaveLength(1)
  })

  it('first says where the montage stands, without calling a film already there a new render', async () => {
    fs.writeFileSync(film(), Buffer.alloc(64, 1))

    await look(3)

    expect(montagesTold()).toHaveLength(1)
    expect(montagesTold()[0]).toMatchObject({ rendered: false })
    expect(montagesTold()[0]?.fact).toMatchObject({ edit: true })
  })

  it('tells again of an edit that comes back, even when the change away from it was never settled enough to tell', async () => {
    await look(3)
    expect(montagesTold().map((e) => e.fact.edit)).toEqual([true])
    fs.rmSync(path.join(folder, 'luc_favre_20260801.edit.json'))
    await look(1)

    fs.writeFileSync(path.join(folder, 'luc_favre_20260801.edit.json'), '<mlt/>')
    await look(3)

    expect(montagesTold().map((e) => e.fact.edit)).toEqual([true, true])
  })

  it('tells again of a montage taken back, whatever it was found to be before', async () => {
    await look(3)
    expect(montagesTold()).toHaveLength(1)

    forgetWatched(['g1'])
    await look(3)

    expect(montagesTold()).toHaveLength(2)
  })
})
