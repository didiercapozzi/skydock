// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifest, saveManifest } from '../src/manifest'
import { copyFiles } from '../src/moveFiles'
import { cancelProcessing, processingNow, processJumps } from '../src/process'
import { setProxyEncoder } from '../src/proxy'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, execSyncMock, tellTools } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

/* Where a file ends up is the whole of what SkyDock does, and nothing tested it. A tandem was
   delivered as though it were a dropzone — flat, every file named after the word "Tandems" — and
   151 passing tests had nothing to say about it, because they all built their own paths instead of
   asking what processing actually wrote. These ask. */

const tools = (cmd: string | Buffer, opts?: { encoding?: string }) => {
  const line = String(cmd)
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
  tellTools()
  execSyncMock.mockImplementation(tools)
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('where a tandem lands', () => {
  it('gives the passenger a folder of their name, with videos and photos apart', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Luc Favre', 'photos', 'luc_favre_20260808_090910.jpg'),
      path.join('Tandems', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4')
    ])
  })

  it('folds accents and spaces out of the file names, not out of the folder', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Chloé', lastname: 'Perret' },
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Chloé Perret', 'videos', 'chloe_perret_20260808_090909.mp4')
    ])
  })

  /* half a name is neither a person nor a place, and a place is what the folder rule would make of it */
  it('refuses a tandem with only half a name rather than filing it as a place', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: '' },
      files: [clip('GX010001.MP4', 0)]
    })

    await expect(processJumps({ manifestPath, outputDir })).rejects.toThrow(/first and last name/)
    expect(delivered()).toEqual([])
  })

  /* Nobody is in it yet, so it is a place as far as the folder rule is concerned. That is right:
     what makes a jump a tandem is a passenger, not which column it is sitting in — the board is
     what asks for the name before it offers to process. */
  it('treats a jump with nobody in it as a place, not a half tandem', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909.mp4')])
  })

  /* one passenger, one folder: processing one of their jumps leaves the other's copies alone */
  it('keeps a passenger\u2019s other jump in their folder when one jump is processed on its own', async () => {
    const luc = { firstname: 'Luc', lastname: 'Favre' }
    const { manifestPath } = write({
      id: 'g1',
      destination: 'Tandems',
      passenger: luc,
      files: [clip('GX010001.MP4', 0)]
    })
    const manifest = loadManifest(manifestPath)!
    const later = clip('GX010002.MP4', 3600)
    manifest.files = [...manifest.files, later]
    manifest.groups.push({
      id: 'g2',
      label: 'jump',
      day: DAY,
      destination: 'Tandems',
      passenger: luc,
      files: [later]
    })
    saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    await processJumps({ manifestPath, outputDir, groupIds: ['g2'] })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4'),
      path.join('Tandems', 'Luc Favre', 'videos', 'luc_favre_20260808_100909.mp4')
    ])
  })

  /* a file named after the Tandems folder is what a half-named tandem filed as a place would be called */
  it('never writes a file named after the Tandems folder itself', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered().some((f) => path.basename(f).startsWith('tandems_'))).toBe(false)
  })
})

describe('where a dropzone lands', () => {
  it('puts every file flat in the dropzone folder, named after the place and its own time', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Yverdon', 'yverdon_20260808_090909.mp4'),
      path.join('Yverdon', 'yverdon_20260808_090910.jpg')
    ])
  })

  /* a dropzone folder is shared by every day ever shot there, so it never gains a sub-folder */
  it('keeps a dropzone flat — no videos or photos folders', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered().some((f) => f.includes('videos') || f.includes('photos'))).toBe(false)
  })

  /* the freed copy is on the storage under its name, and a new copy of that name would be sent
     over the top of it */
  it('never gives a new file the name of one freed to the storage', async () => {
    const taken = path.join(outputDir, 'processed', 'Yverdon', 'yverdon_20260808_090909.mp4')
    const gone: ManifestFile = {
      ...clip('GX010001.MP4', 0),
      id: 'gone',
      freed: true,
      processed: { path: taken, size: 5, at: 1, source: { id: 'gone', size: 32, mtime: AT } }
    }
    fs.rmSync(gone.path)
    const { manifestPath } = write({ destination: 'Yverdon', files: [clip('DJI_0002.MP4', 0)] })
    const manifest = loadManifest(manifestPath)!
    manifest.files = [...manifest.files, gone]
    manifest.groups.push({
      id: 'freed',
      label: 'freed',
      day: DAY,
      destination: 'Yverdon',
      files: [gone],
      freed: { at: 1, bytes: 0 }
    })
    saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909_1.mp4')])
  })

  /* the loose file and the jump's file were shot in the same second: whichever is processed second
     must be given a name of its own rather than written over the first */
  it('never gives a jump’s file the name a loose file of the same second already has', async () => {
    const lone: ManifestFile = { ...clip('DJI_0002.MP4', 0), id: 'lone', destination: 'Yverdon' }
    /* the jump is not filed yet, so the first pass is the loose file on its own */
    const { manifestPath } = write({ id: 'g1', files: [clip('GX010001.MP4', 0)] })
    const manifest = loadManifest(manifestPath)!
    manifest.files = [...manifest.files, lone]
    saveManifest(manifestPath, manifest)
    await processJumps({ manifestPath, outputDir, destination: 'Yverdon' })
    const after = loadManifest(manifestPath)!
    after.groups[0]!.destination = 'Yverdon'
    saveManifest(manifestPath, after)

    /* then the jump, on its own */
    await processJumps({ manifestPath, outputDir, groupIds: ['g1'] })

    expect(delivered()).toEqual([
      path.join('Yverdon', 'yverdon_20260808_090909.mp4'),
      path.join('Yverdon', 'yverdon_20260808_090909_1.mp4')
    ])
  })
})

describe('a jump filed nowhere', () => {
  it('gets a folder of its own, named after the jump and its date', async () => {
    const { manifestPath } = write({
      label: 'jump',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('jump_20260808', 'videos', 'jump_20260808_090909.mp4')])
  })
})

/* Cutting a mount out of the corner of the frame. The rectangle is held as fractions so it means
   the same on the 640-wide proxy it is drawn on and on the 4K clip it is cut from, and what comes
   out keeps the shape and the size the clip came at. */
describe('cropping the frame', () => {
  const framed = { x: 0.1, y: 0, width: 0.9, height: 0.9 }

  it('cuts the rectangle and comes back out at the size the clip came at', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('crop=3456:1944:384:0')
    expect(cmd).toContain('scale=3840:2160')
  })

  /* the picture itself changes, so a stream copy cannot do it — this is the one thing in
     processing that costs real time, and saying so out loud is the point of the test */
  it('encodes again rather than copying, because the picture changed', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).not.toContain('-c copy')
    expect(cmd).toMatch(/-c:v (libx264|h264_nvenc|h264_vaapi)/)
  })

  /* trimming the ends still moves no pixels, so it still copies */
  it('still copies the stream when only the ends were trimmed', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 1, cropEnd: 4 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-ss')) ?? ''
    expect(cmd).toContain('-c copy')
    expect(cmd).not.toContain('crop=')
  })

  /* A tandem is prepared again while its edit is open — a trim corrected after the montage was made
     is no use until the copies are made again — so what processing writes over has to be the media
     and nothing else (RULES, Montage). */
  it('leaves the project, the film and the archives where they are when it prepares again', async () => {
    const { manifestPath, group } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    await processJumps({ manifestPath, outputDir })
    const folder = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
    const beside = [
      'luc_favre_20260808.kdenlive',
      'luc_favre_20260808.mp4',
      'luc_favre_20260808.rushes.zip'
    ]
    for (const name of beside) fs.writeFileSync(path.join(folder, name), 'kept')
    /* and something under the media that no clip produces any more, which does go */
    fs.writeFileSync(path.join(folder, 'videos', 'left_over.mp4'), 'stale')

    await processJumps({ manifestPath, outputDir, groupIds: [group.id] })

    for (const name of beside) expect(fs.existsSync(path.join(folder, name))).toBe(true)
    expect(fs.existsSync(path.join(folder, 'videos', 'left_over.mp4'))).toBe(false)
  })

  /* A trim is two ends and either of them on its own is a trim: dragging the right handle alone says
     "up to here", and the clip still starts where it starts. Asking for both left a one-ended trim
     doing nothing at all — the copy came out whole while the board, the record of what was processed
     and the editing project all said it had been cut. */
  it('cuts a clip trimmed at its end only', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropEnd: 4 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-t ')) ?? ''
    expect(cmd).toContain('-t 4.000000')
    expect(cmd).toContain('-c copy')
    expect(cmd).not.toContain('-ss')
  })

  it('cuts a clip trimmed at its start only, and lets it run to its end', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-ss')) ?? ''
    expect(cmd).toContain('-ss 2')
    expect(cmd).not.toContain('-t ')
  })

  it('does both at once when both were set', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed, cropStart: 1, cropEnd: 4 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('-ss 1')
    expect(cmd).toContain('-t 3.000000')
    expect(cmd).toContain('crop=3456:1944:384:0')
  })

  /* a rectangle covering the whole frame is not a crop: the file is copied untouched */
  it('copies the file untouched when the rectangle covers everything', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: { x: 0, y: 0, width: 1, height: 1 } }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })

  it('leaves a photo alone — a frame crop is for clips', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })
})

/* Preparing takes minutes, and the board is not frozen while it runs: the page can be refreshed,
   and edits go on being saved. So the pass has to be something that can be waited on, and what it
   saves at the end has to be added to the manifest as it is then — not the one it read at the
   start, written back over everything done since. */
describe('while a processing is running', () => {
  it('keeps an edit saved in the meantime', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    /* the moment the copies are stamped is the last moment anything else could have been saved */
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('exiftool')) {
        const meanwhile = loadManifest(manifestPath)!
        meanwhile.destinations = [...(meanwhile.destinations ?? []), { name: 'Colombier' }]
        saveManifest(manifestPath, meanwhile)
      }
      return tools(cmd, opts)
    })

    await processJumps({ manifestPath, outputDir })

    const after = loadManifest(manifestPath)!
    expect(after.destinations?.map((d) => d.name)).toContain('Colombier')
    expect(after.groups[0]?.processed).toBe(true)
    expect(after.files[0]?.processed?.path).toMatch(/luc_favre_20260808_090909\.mp4$/)
  })

  it('does not call a jump processed when it was changed while its copies were written', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('exiftool')) {
        const meanwhile = loadManifest(manifestPath)!
        meanwhile.groups[0]!.files[0]!.cropStart = 1
        meanwhile.groups[0]!.files[0]!.cropEnd = 3
        saveManifest(manifestPath, meanwhile)
      }
      return tools(cmd, opts)
    })

    await processJumps({ manifestPath, outputDir })

    expect(loadManifest(manifestPath)!.groups[0]?.processed).not.toBe(true)
  })

  it('says what it is working on, and refuses to start a second one on top of it', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })

    const first = processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    expect(processingNow()).toEqual({ groupIds: ['g1'], destinations: [] })
    await expect(processJumps({ manifestPath, outputDir })).rejects.toThrow(/Already processing/)
    await first

    expect(processingNow()).toBeNull()
  })
})

/* Every name changes on the way out, so a delivered file says inside itself what it was made from
   — the original's content id — and can still say it wherever it ends up (RULES, Network storage). */
describe('what a delivered file says it came from', () => {
  const tagged = () =>
    execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('skydock:from='))

  it('is the original it was made from, written into the copy itself', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(tagged().some((l) => l.includes('skydock:from=id0'))).toBe(true)
  })

  it('is written into a photo the same way', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(tagged().some((l) => l.includes('skydock:from='))).toBe(true)
  })
})

/* Turning: a clip is encoded again, turned; a photo keeps its pixels and gets its orientation tag. */
describe('turning a file', () => {
  const exiftoolCalls = () =>
    execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('exiftool -n'))

  it('encodes a turned clip again, turned, rather than copying it', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('transpose')) ?? ''
    expect(cmd).toContain('-vf transpose=1')
    expect(cmd).not.toContain('-c copy')
  })

  it('turns a photo by its orientation tag, without encoding it', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls()).toEqual([])
    expect(exiftoolCalls().some((l) => l.includes('-Orientation=6'))).toBe(true)
  })

  it('stamps the copy with the turn it was made with', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), rotation: 180 }]
    })

    await processJumps({ manifestPath, outputDir })

    const { loadManifest } = await import('../src/manifest')
    expect(loadManifest(manifestPath)!.files[0]?.processed?.source.rotation).toBe(180)
  })
})

/* An Intel or AMD card's encoder takes only frames that are on the card, so a picture changed in
   ordinary memory is handed back up first — and when ffmpeg does fail, it is ffmpeg's reason that is
   said, not "install ffmpeg". */
describe('changing the picture on an Intel or AMD card', () => {
  afterEach(() => setProxyEncoder(null))

  it('hands the turned frames back to the card before encoding them', async () => {
    setProxyEncoder('vaapi')
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('transpose')) ?? ''
    expect(cmd).toContain('-vaapi_device')
    expect(cmd).toContain('-vf transpose=1,format=nv12,hwupload')
    expect(cmd).toContain('h264_vaapi')
  })

  /* any card, any driver, any clip: what the card cannot do, the processor does */
  it('does the clip on the processor when the graphics card cannot', async () => {
    setProxyEncoder('vaapi')
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).includes('h264_vaapi')) {
        const failure = new Error('ffmpeg exited') as Error & { stderr: string }
        failure.stderr = 'Failed to initialise VAAPI connection: -1 (unknown libva error).\n'
        throw failure
      }
      return tools(cmd, opts)
    })
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    const turned = ffmpegCalls().filter((l) => l.includes('transpose'))
    expect(turned).toHaveLength(2)
    expect(turned[1]).toContain('libx264')
    expect(turned[1]).not.toContain('hwupload')
    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909.mp4')])
  })

  it('says what ffmpeg said when it fails', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('ffmpeg') && String(cmd).includes('transpose')) {
        const failure = new Error('ffmpeg exited') as Error & { stderr: string }
        failure.stderr =
          "Impossible to convert between the formats supported by the filter 'transpose'\nConversion failed!\n"
        throw failure
      }
      return tools(cmd, opts)
    })
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await expect(processJumps({ manifestPath, outputDir })).rejects.toThrow(
      /could not crop or turn GX010001\.MP4: Impossible to convert/
    )
  })
})

/* While a jump is processed, each of its files says so as it happens — that it began and how it
   ended, with how far through in between — so the board shows it on the file without asking. */
describe('processing, said as it happens', () => {
  const listening = () => {
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => heard.push(event))
    return { heard, stop }
  }

  it('says of every file that it began, and that it ended well', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })
    const { heard, stop } = listening()

    await processJumps({ manifestPath, outputDir })
    stop()

    /* one after the other, never two at once: a file ends before the next begins */
    expect(
      heard.map((e) => `${e.kind} ${e.fileId}${e.kind === 'file-done' ? ` ${e.ok}` : ''}`)
    ).toEqual(['file id0', 'file-done id0 true', 'file id1', 'file-done id1 true'])
  })

  it('asks ffmpeg to say where it is, on the clips it has to write itself', async () => {
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2, cropEnd: 8 }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls()[0]).toContain('-progress pipe:1 -nostats')
  })

  it('says so when a file could not be processed, and nothing is left reading as under way', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('ffmpeg')) throw new Error('ffmpeg exited with code 1')
      return tools(cmd, opts)
    })
    const { manifestPath } = write({
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2, cropEnd: 8 }]
    })
    const { heard, stop } = listening()

    await processJumps({ manifestPath, outputDir }).catch(() => undefined)
    stop()

    expect(heard.at(-1)).toEqual({ kind: 'file-done', work: 'process', fileId: 'id0', ok: false })
    /* whoever starts listening now hears of nothing under way */
    const late = listening()
    late.stop()
    expect(late.heard).toEqual([])
  })
})

/* A clip two passengers share is copied into the second's jump, and each of them is handed it under
   their own name: one original on the disk, two processed copies, each with a record of its own. */
describe('processing a clip that two jumps hold', () => {
  it('writes each passenger a copy under their own name, and records both', async () => {
    const plane = clip('GX010001.MP4', 0)
    const ana = clip('GX010009.MP4', 7200)
    const manifest: Manifest = {
      version: 1,
      createdAt: '2026-08-08',
      files: [plane, ana],
      groups: [
        {
          id: 'g1',
          label: 'g1',
          day: DAY,
          destination: 'Tandems',
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [plane]
        },
        {
          id: 'g2',
          label: 'g2',
          day: DAY,
          destination: 'Tandems',
          passenger: { firstname: 'Ana', lastname: 'Roth' },
          files: [ana]
        }
      ],
      destinations: [{ name: 'Tandems' }]
    }
    copyFiles(manifest, new Set(['id0']), 'g2')
    const manifestPath = path.join(outputDir, 'manifest.json')
    saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Tandems', 'Ana Roth', 'videos', 'ana_roth_20260808_090909.mp4'),
      path.join('Tandems', 'Ana Roth', 'videos', 'ana_roth_20260808_110909.mp4'),
      path.join('Tandems', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4')
    ])
    const after = loadManifest(manifestPath)!
    const recorded = after.files
      .filter((f) => f.path === plane.path)
      .map((f) => path.basename(path.dirname(path.dirname(f.processed?.path ?? ''))))
    expect(recorded.sort()).toEqual(['Ana Roth', 'Luc Favre'])
  })
})

/* What is being processed can be stopped (RULES, Acting): the file under way is dropped rather than
   left half written, nothing more is started, and the run records nothing as processed. */
describe('cancelling what is being processed', () => {
  it('stops the run, leaves no half-written copy, and records nothing as processed', async () => {
    const { manifestPath } = write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0), clip('GX010002.MP4', 1)]
    })

    const run = processJumps({ manifestPath, outputDir })
    expect(cancelProcessing()).toBe(true)

    await expect(run).rejects.toThrow(/cancelled/)
    expect(delivered()).toEqual([])
    expect(loadManifest(manifestPath)?.groups[0]?.processed).toBeFalsy()
    expect(processingNow()).toBeNull()
  })

  it('says there is nothing to stop when nothing is being processed', () => {
    expect(cancelProcessing()).toBe(false)
  })
})
