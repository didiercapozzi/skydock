// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { saveManifest } from '../src/manifest'
import { processJumps } from '../src/process'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, execSyncMock } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

/* Where a file ends up is the whole of what SkyDock does, and nothing tested it. A tandem was
   delivered as though it were a dropzone — flat, every file named after the word "Tandems" — and
   151 passing tests had nothing to say about it, because they all built their own paths instead of
   asking what processing actually wrote. These ask. */

const tools = (cmd: string | Buffer, opts?: { encoding?: string }) => {
  const line = String(cmd)
  if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
  /* a 4K 16:9 clip, which is what the crop arithmetic is measured against */
  if (line.startsWith('ffprobe')) {
    const shape = 'width=3840\nheight=2160\n'
    return opts?.encoding ? shape : Buffer.from(shape)
  }
  /* whatever ffmpeg is asked to write, it writes — the command itself is what is asserted on */
  if (line.startsWith('ffmpeg')) {
    const out = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]).pop()
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('media'))
    }
  }
  return Buffer.from('')
}

/* every ffmpeg the pass ran, so what it asked for is visible rather than inferred */
const ffmpegCalls = () =>
  execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('ffmpeg'))

const DAY = '08.08.2026'

/* 08.08.2026 09:09:09 local, so the names below are readable rather than arithmetic */
const AT = Math.floor(new Date(2026, 7, 8, 9, 9, 9).getTime() / 1000)

let outputDir: string

const clip = (name: string, offset: number): ManifestFile => {
  const source = path.join(outputDir, 'original_files', '2026-08-08', name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, Buffer.alloc(32, offset))
  return { path: source, size: 32, mtime: AT + offset, filename: name, id: `id${offset}` }
}

const write = (group: Partial<ManifestGroup> & { files: ManifestFile[] }) => {
  const full: ManifestGroup = { id: 'g1', label: 'jump', day: DAY, ...group }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-08',
    files: full.files,
    groups: [full],
    destinations: [{ name: 'Tandems' }, { name: 'Yverdon' }]
  }
  const manifestPath = path.join(outputDir, 'manifest.json')
  saveManifest(manifestPath, manifest)
  return { manifestPath, group: full }
}

/* every file under processed/, relative, so the layout is what is asserted rather than one path */
const delivered = () => {
  const root = path.join(outputDir, 'processed')
  const walk = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const full = path.join(dir, e.name)
          return e.isDirectory() ? walk(full) : [path.relative(root, full)]
        })
      : []
  return walk(root).sort()
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-process-')
  execSyncMock.mockImplementation(tools)
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('where a tandem lands', () => {
  it('gives the passenger a folder of their name, with videos and photos apart', () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Luc Favre', 'photos', 'luc_favre_20260808_090910.jpg'),
      path.join('Tandems', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4')
    ])
  })

  it('folds accents and spaces out of the file names, not out of the folder', () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Chloé', lastname: 'Perret' },
      files: [clip('GX010001.MP4', 0)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Chloé Perret', 'videos', 'chloe_perret_20260808_090909.mp4')
    ])
  })

  /* the regression, exactly as it happened: a first name typed, the last name never reached */
  it('refuses a tandem with only half a name rather than delivering it as a place', () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: '' },
      files: [clip('GX010001.MP4', 0)]
    })

    expect(() => processJumps({ manifestPath, outputDir })).toThrow(/first and last name/)
    expect(delivered()).toEqual([])
  })

  /* Nobody is in it yet, so it is a place as far as the folder rule is concerned. That is right:
     what makes a jump a tandem is a passenger, not which column it is sitting in — the board is
     what asks for the name before it offers to process. */
  it('treats a jump with nobody in it as a place, not a half tandem', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909.mp4')])
  })

  /* what the bug produced, named so it can never come back unnoticed */
  it('never writes a file named after the Tandems folder itself', () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered().some((f) => path.basename(f).startsWith('tandems_'))).toBe(false)
  })
})

describe('where a dropzone lands', () => {
  it('puts every file flat in the dropzone folder, named after the place and its own time', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Yverdon', 'yverdon_20260808_090909.mp4'),
      path.join('Yverdon', 'yverdon_20260808_090910.jpg')
    ])
  })

  /* a dropzone folder is shared by every day ever shot there, so it never gains a sub-folder */
  it('keeps a dropzone flat — no videos or photos folders', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered().some((f) => f.includes('videos') || f.includes('photos'))).toBe(false)
  })
})

describe('a jump filed nowhere', () => {
  it('gets a folder of its own, named after the jump and its date', () => {
    const { manifestPath } = write({
      label: 'jump',
      files: [clip('GX010001.MP4', 0)]
    })

    processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('jump_20260808', 'videos', 'jump_20260808_090909.mp4')])
  })
})

/* Cutting a mount out of the corner of the frame. The rectangle is held as fractions so it means
   the same on the 640-wide proxy it is drawn on and on the 4K clip it is cut from, and what comes
   out keeps the shape and the size the clip came at. */
describe('cropping the frame', () => {
  const framed = { x: 0.1, y: 0, width: 0.9, height: 0.9 }

  it('cuts the rectangle and comes back out at the size the clip came at', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('crop=3456:1944:384:0')
    expect(cmd).toContain('scale=3840:2160')
  })

  /* the picture itself changes, so a stream copy cannot do it — this is the one thing in
     processing that costs real time, and saying so out loud is the point of the test */
  it('encodes again rather than copying, because the picture changed', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).not.toContain('-c copy')
    expect(cmd).toMatch(/-c:v (libx264|h264_nvenc|h264_vaapi)/)
  })

  /* trimming the ends still moves no pixels, so it still copies */
  it('still copies the stream when only the ends were trimmed', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 1, cropEnd: 4 }]
    })

    processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-ss')) ?? ''
    expect(cmd).toContain('-c copy')
    expect(cmd).not.toContain('crop=')
  })

  it('does both at once when both were set', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed, cropStart: 1, cropEnd: 4 }]
    })

    processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('-ss 1')
    expect(cmd).toContain('-t 3.000000')
    expect(cmd).toContain('crop=3456:1944:384:0')
  })

  /* a rectangle covering the whole frame is not a crop: the file is copied untouched */
  it('copies the file untouched when the rectangle covers everything', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: { x: 0, y: 0, width: 1, height: 1 } }]
    })

    processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })

  it('leaves a photo alone — a frame crop is for clips', () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), frame: framed }]
    })

    processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })
})
