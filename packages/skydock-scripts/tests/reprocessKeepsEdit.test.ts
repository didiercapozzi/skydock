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

/* Preparing a tandem again is the ordinary way of working: prepare it, look at it, correct a time
   or a name, prepare it again. So the second pass has to leave the folder as if it were the first —
   and leave the edit alone, because the footage can be copied again from originals that have not
   moved, the archives rebuilt, the film re-rendered, but the hours someone spent choosing cuts
   exist once.

   These go through the real pass rather than a helper. The bug worth catching is not "did the right
   function get called" but "what is in the folder afterwards", and asking the code which helper it
   uses is how a folder full of near-duplicates passes for correct. */

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

/* with its import proxy already built, because that is the state a jump is in by the time anyone
   prepares it — and the cut proxies are half of what a second pass has to tidy */
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
    destination: 'Tandems',
    passenger: PASSENGER,
    ...group,
    files
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-08',
    files,
    groups: [full],
    destinations: [{ name: 'Tandems' }, { name: 'Yverdon' }]
  }
  const manifestPath = path.join(outputDir, 'manifest.json')
  saveManifest(manifestPath, manifest)
  await processJumps({ manifestPath, outputDir })
}

const groupDir = () => path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')

const inside = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [])

/* everything under the output directory, so a copy moved somewhere out of the way still shows up */
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

describe('processing a tandem again', () => {
  it('leaves the edit, the film and the archives where they are', async () => {
    await prepare([clip('GX01.MP4', AT)])
    addEdit()

    await prepare([clip('GX01.MP4', AT)])

    expect(inside(groupDir())).toEqual(
      expect.arrayContaining(['luc_favre.kdenlive', 'luc_favre.mp4', 'luc_favre.photos.zip'])
    )
  })

  /* the reason for pruning: a corrected time renames the copy, and the old name is a file nobody
     expects that would be delivered anyway */
  it('is left with one copy per clip, not the old name as well', async () => {
    await prepare([clip('GX01.MP4', AT)])
    const first = inside(path.join(groupDir(), 'videos'))
    expect(first).toHaveLength(1)

    /* the same clip, its time corrected by a minute — which is a different name */
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

  /* what "no trash" means: the second pass writes over the first, and puts nothing aside */
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

  /* A dropzone folder is not one jump's to tidy: it holds every day ever shot there, while the
     manifest only knows what the last scan found. Pruning it by what was just written would take
     last week with it. */
  it('never prunes a dropzone folder, which holds days no scan can see', async () => {
    const flat = path.join(outputDir, 'processed', 'Yverdon')
    fs.mkdirSync(flat, { recursive: true })
    fs.writeFileSync(path.join(flat, 'Yverdon_2026-07-01_101010.mp4'), 'older day')

    await prepare([clip('GX01.MP4', AT)], { destination: 'Yverdon', passenger: undefined })

    expect(inside(flat)).toContain('Yverdon_2026-07-01_101010.mp4')
  })
})
