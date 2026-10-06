// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { saveManifest } from '../src/manifest'
import { processJumps } from '../src/process'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, execSyncMock, tellTools } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

const tools = (cmd: string | Buffer, opts?: { encoding?: string }) => {
  const line = String(cmd)
  if (line.startsWith('ffprobe')) {
    const shape = 'width=3840\nheight=2160\n'
    return opts?.encoding ? shape : Buffer.from(shape)
  }
  if (line.startsWith('ffmpeg')) {
    const out = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]).pop()
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('media'))
    }
  }
  return Buffer.from('')
}

const AT = Math.floor(new Date(2026, 7, 8, 9, 9, 9).getTime() / 1000)
const PASSENGER = { firstname: 'Luc', lastname: 'Favre' }

let outputDir: string

const clip = (name: string, at: number): ManifestFile => {
  const source = path.join(outputDir, 'original_files', '2026-08-08', name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, Buffer.alloc(32, 7))
  const proxy = path.join(outputDir, 'proxies', `${name}.mp4`)
  fs.mkdirSync(path.dirname(proxy), { recursive: true })
  fs.writeFileSync(proxy, Buffer.from('proxy'))
  return { path: source, size: 32, mtime: at, filename: name, id: name, proxy }
}

const prepare = async (files: ManifestFile[], group?: Partial<ManifestGroup>) => {
  const full: ManifestGroup = {
    id: 'g1',
    label: 'jump',
    day: '08.08.2026',
    montageJump: true,
    passenger: PASSENGER,
    ...group,
    files
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-08',
    files,
    groups: [full],
    destinations: [{ name: 'Passengers' }, { name: 'Yverdon' }]
  }
  const manifestPath = path.join(outputDir, 'manifest.json')
  saveManifest(manifestPath, manifest)
  await processJumps({ manifestPath, outputDir })
}

const groupDir = () => path.join(outputDir, 'processed', 'Montages', 'Luc Favre')

const inside = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [])

const everything = () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name)
      return e.isDirectory() ? walk(full) : [path.relative(outputDir, full)]
    })
  return walk(outputDir).sort()
}

const addEdit = () => {
  fs.writeFileSync(path.join(groupDir(), 'luc_favre.kdenlive'), '<mlt/>')
  fs.writeFileSync(path.join(groupDir(), 'luc_favre.mp4'), 'film')
  fs.writeFileSync(path.join(groupDir(), 'luc_favre.photos.zip'), 'zip')
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-reprocess-')
  tellTools()
  execSyncMock.mockImplementation(tools)
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('processing a montage again', () => {
  it('leaves the edit, the film and the archives where they are', async () => {
    await prepare([clip('GX01.MP4', AT)])
    addEdit()

    await prepare([clip('GX01.MP4', AT)])

    expect(inside(groupDir())).toEqual(
      expect.arrayContaining(['luc_favre.kdenlive', 'luc_favre.mp4', 'luc_favre.photos.zip'])
    )
  })

  it('is left with one copy per clip, not the old name as well', async () => {
    await prepare([clip('GX01.MP4', AT)])
    const first = inside(path.join(groupDir(), 'videos'))
    expect(first).toHaveLength(1)

    await prepare([clip('GX01.MP4', AT + 60)])

    const second = inside(path.join(groupDir(), 'videos'))
    expect(second).toHaveLength(1)
    expect(second).not.toEqual(first)
  })

  it('does the same for the cut proxies, which are named after the copies', async () => {
    await prepare([clip('GX01.MP4', AT)])
    await prepare([clip('GX01.MP4', AT + 60)])

    expect(inside(path.join(outputDir, 'proxies', 'cut', 'g1'))).toHaveLength(1)
  })

  it('keeps nothing aside — no bin, no copy of the copy', async () => {
    await prepare([clip('GX01.MP4', AT), clip('GX02.MP4', AT + 5)])
    addEdit()
    const after = everything()

    await prepare([clip('GX01.MP4', AT), clip('GX02.MP4', AT + 5)])

    expect(everything()).toEqual(after)
    expect(fs.existsSync(path.join(outputDir, '.trash'))).toBe(false)
  })

  it('takes a clip that was removed from the jump out of the folder', async () => {
    await prepare([clip('GX01.MP4', AT), clip('GX02.MP4', AT + 5)])
    expect(inside(path.join(groupDir(), 'videos'))).toHaveLength(2)

    await prepare([clip('GX01.MP4', AT)])

    expect(inside(path.join(groupDir(), 'videos'))).toHaveLength(1)
  })

  it('never prunes a dropzone folder, which holds days no scan can see', async () => {
    const flat = path.join(outputDir, 'processed', 'Yverdon')
    fs.mkdirSync(flat, { recursive: true })
    fs.writeFileSync(path.join(flat, 'Yverdon_2026-07-01_101010.mp4'), 'older day')

    await prepare([clip('GX01.MP4', AT)], { destination: 'Yverdon', passenger: undefined })

    expect(inside(flat)).toContain('Yverdon_2026-07-01_101010.mp4')
  })
})
