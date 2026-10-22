// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { saveManifest, loadManifestAsync } from '../src/manifest'
import { cutProxiesOf, montageClips } from '../src/montageClips'
import { processJumps } from '../src/process'
import { getCutProxyDir } from '../src/proxy'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, execSyncMock, fakeTools, tellTools } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

const tools = fakeTools({ height: 2160 })

const ffmpegCalls = () =>
  execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('ffmpeg'))

const AT = Math.floor(new Date(2026, 7, 8, 9, 9, 9).getTime() / 1000)

let outputDir: string

const clip = (name: string, offset: number, over: Partial<ManifestFile> = {}): ManifestFile => {
  const source = path.join(outputDir, 'original_files', '2026-08-08', name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, Buffer.alloc(32, offset))
  return { path: source, size: 32, mtime: AT + offset, filename: name, id: `id${offset}`, ...over }
}

const withProxy = (file: ManifestFile): ManifestFile => {
  const proxy = path.join(outputDir, 'proxies', `${file.id}.mp4`)
  fs.mkdirSync(path.dirname(proxy), { recursive: true })
  fs.writeFileSync(proxy, 'proxy')
  return { ...file, proxy }
}

const montage = (files: ManifestFile[]): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '08.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files
})

const board = (group: ManifestGroup): Manifest => ({
  version: 1,
  createdAt: '2026-08-08',
  files: group.files,
  groups: [group],
  destinations: []
})

beforeEach(() => {
  outputDir = createTmpDir('skydock-montage-clips-')
  tellTools()
  execSyncMock.mockImplementation(tools)
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('the clips of a montage, named before they are processed', () => {
  it('are called by the names processing then gives them', async () => {
    const group = montage([
      clip('GX010001.MP4', 0),
      clip('GX010002.MP4', 0, { id: 'other' }),
      clip('G0010003.JPG', 5)
    ])
    const manifestPath = path.join(outputDir, 'manifest.json')
    await saveManifest(manifestPath, board(group))
    const planned = montageClips(group, outputDir).map((c) => c.name)

    await processJumps({ manifestPath, outputDir })

    const after = (await loadManifestAsync(manifestPath))!
    expect(after.groups[0]?.files.map((f) => path.basename(f.processed!.path))).toEqual(planned)
    expect(new Set(planned).size).toBe(3)
  })

  it('keep the name of a copy they have, whatever was done to the clip since', () => {
    const group = montage([
      clip('GX010001.MP4', 0, {
        cropStart: 4,
        processed: {
          path: path.join(
            outputDir,
            'processed',
            'Montages',
            'Luc Favre',
            'videos',
            'old_name.mp4'
          ),
          size: 1,
          at: 1,
          source: { id: 'id0', size: 32, mtime: AT }
        }
      })
    ])

    expect(montageClips(group, outputDir).map((c) => c.name)).toEqual(['old_name.mp4'])
  })
})

describe('the small copy a clip changed on the board is edited on', () => {
  it('is none for a clip the board left as it is', () => {
    expect(montageClips(montage([clip('GX010001.MP4', 0)]), outputDir)[0]?.cut).toBeNull()
  })

  it('is named by what was done, so that a clip changed again has another', () => {
    const trimmed = (cropStart: number) =>
      montageClips(montage([clip('GX010001.MP4', 0, { cropStart })]), outputDir)[0]?.cut

    expect(trimmed(4)).toMatch(/~[0-9a-f]{8}\.mp4$/)
    expect(trimmed(4)).toBe(trimmed(4))
    expect(trimmed(4)).not.toBe(trimmed(5))
  })

  it('is cut from the proxy, turned and kept under the output folder', async () => {
    const group = montage([withProxy(clip('GX010001.MP4', 0, { rotation: 90 }))])

    expect(await cutProxiesOf(board(group), outputDir)).toBe(1)

    const [cut] = montageClips(group, outputDir).map((c) => c.cut)
    expect(cut?.startsWith(getCutProxyDir(outputDir, 'g1'))).toBe(true)
    expect(fs.existsSync(cut!)).toBe(true)
    expect(ffmpegCalls().some((l) => l.includes('transpose=1') && l.includes(cut!))).toBe(true)
  })

  it('is cut to the frame', async () => {
    const group = montage([
      withProxy(clip('GX010001.MP4', 0, { frame: { x: 0.1, y: 0, width: 0.9, height: 0.9 } }))
    ])

    await cutProxiesOf(board(group), outputDir)

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(true)
  })

  it('is cut once, and again only when the clip is changed again', async () => {
    const group = montage([withProxy(clip('GX010001.MP4', 0, { cropStart: 3 }))])
    expect(await cutProxiesOf(board(group), outputDir)).toBe(1)
    expect(await cutProxiesOf(board(group), outputDir)).toBe(0)

    const [first] = montageClips(group, outputDir).map((c) => c.cut)
    group.files[0]!.cropStart = 5
    expect(await cutProxiesOf(board(group), outputDir)).toBe(1)

    expect(fs.existsSync(first!)).toBe(false)
  })

  it('waits for the proxy of the clip, and is not made from nothing', async () => {
    const group = montage([clip('GX010001.MP4', 0, { cropStart: 3 })])

    expect(await cutProxiesOf(board(group), outputDir)).toBe(0)
  })

  it('is a copy of a photo turned by its orientation tag', async () => {
    const group = montage([clip('G0010002.JPG', 1, { rotation: 90 })])

    expect(await cutProxiesOf(board(group), outputDir)).toBe(1)

    const [cut] = montageClips(group, outputDir).map((c) => c.cut)
    expect(cut).toMatch(/\.JPG$|\.jpg$/i)
    expect(fs.existsSync(cut!)).toBe(true)
  })

  it('is not made for a montage that has been freed', async () => {
    const group = {
      ...montage([withProxy(clip('GX010001.MP4', 0, { cropStart: 3 }))]),
      freed: { at: 1, bytes: 1 }
    }

    expect(await cutProxiesOf(board(group), outputDir)).toBe(0)
  })
})
