// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifestAsync, saveManifest } from '../src/manifest'
import { copyFiles } from '../src/moveFiles'
import {
  cancelProcessing,
  processingAll,
  processingNow,
  processJumps,
  writeCutProxy
} from '../src/process'
import { getCutProxyDir, setProxyEncoder } from '../src/proxy'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, execSyncMock, fakeTools, tellTools, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

const tools = fakeTools({ height: 2160 })

const ffmpegCalls = () =>
  execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('ffmpeg'))

const DAY = '08.08.2026'

const AT = Math.floor(new Date(2026, 7, 8, 9, 9, 9).getTime() / 1000)

let outputDir: string

const clip = (name: string, offset: number): ManifestFile => {
  const source = path.join(outputDir, 'original_files', '2026-08-08', name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, Buffer.alloc(32, offset))
  return { path: source, size: 32, mtime: AT + offset, filename: name, id: `id${offset}` }
}

const write = async (group: Partial<ManifestGroup> & { files: ManifestFile[] }) => {
  const full: ManifestGroup = { id: 'g1', label: 'jump', day: DAY, ...group }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-08',
    files: full.files,
    groups: [full],
    destinations: [{ name: 'Passengers' }, { name: 'Yverdon' }]
  }
  const manifestPath = path.join(outputDir, 'manifest.json')
  await saveManifest(manifestPath, manifest)
  return { manifestPath, group: full }
}

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

describe('where a montage lands', () => {
  it('gives the passenger a folder of their name, with videos and photos apart', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Montages', 'Luc Favre', 'photos', 'luc_favre_20260808_090910.jpg'),
      path.join('Montages', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4')
    ])
  })

  it('folds accents and spaces out of the file names, not out of the folder', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Chloé', lastname: 'Perret' },
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Montages', 'Chloé Perret', 'videos', 'chloe_perret_20260808_090909.mp4')
    ])
  })

  it('gives a montage named by a single word a folder of its own', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Boogie', lastname: '' },
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Montages', 'Boogie', 'videos', 'boogie_20260808_090909.mp4')
    ])
  })

  it('treats a jump with nobody in it as a place, not a half montage', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909.mp4')])
  })

  it('keeps a passenger\u2019s other jump in their folder when one jump is processed on its own', async () => {
    const luc = { firstname: 'Luc', lastname: 'Favre' }
    const { manifestPath } = await write({
      id: 'g1',
      montageJump: true,
      passenger: luc,
      files: [clip('GX010001.MP4', 0)]
    })
    const manifest = (await loadManifestAsync(manifestPath))!
    const later = clip('GX010002.MP4', 3600)
    manifest.files = [...manifest.files, later]
    manifest.groups.push({
      id: 'g2',
      label: 'jump',
      day: DAY,
      montageJump: true,
      passenger: luc,
      files: [later]
    })
    await saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    await processJumps({ manifestPath, outputDir, groupIds: ['g2'] })

    expect(delivered()).toEqual([
      path.join('Montages', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4'),
      path.join('Montages', 'Luc Favre', 'videos', 'luc_favre_20260808_100909.mp4')
    ])
  })
})

describe('where a dropzone lands', () => {
  it('puts every file flat in the dropzone folder, named after the place and its own time', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Yverdon', 'yverdon_20260808_090909.mp4'),
      path.join('Yverdon', 'yverdon_20260808_090910.jpg')
    ])
  })

  it('never gives a new file the name of one freed to the storage', async () => {
    const taken = path.join(outputDir, 'processed', 'Yverdon', 'yverdon_20260808_090909.mp4')
    const gone: ManifestFile = {
      ...clip('GX010001.MP4', 0),
      id: 'gone',
      freed: true,
      processed: { path: taken, size: 5, at: 1, source: { id: 'gone', size: 32, mtime: AT } }
    }
    fs.rmSync(gone.path)
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('DJI_0002.MP4', 0)]
    })
    const manifest = (await loadManifestAsync(manifestPath))!
    manifest.files = [...manifest.files, gone]
    manifest.groups.push({
      id: 'freed',
      label: 'freed',
      day: DAY,
      destination: 'Yverdon',
      files: [gone],
      freed: { at: 1, bytes: 0 }
    })
    await saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([path.join('Yverdon', 'yverdon_20260808_090909_1.mp4')])
  })

  it('never gives a jump’s file the name a loose file of the same second already has', async () => {
    const lone: ManifestFile = { ...clip('DJI_0002.MP4', 0), id: 'lone', destination: 'Yverdon' }
    const { manifestPath } = await write({ id: 'g1', files: [clip('GX010001.MP4', 0)] })
    const manifest = (await loadManifestAsync(manifestPath))!
    manifest.files = [...manifest.files, lone]
    await saveManifest(manifestPath, manifest)
    await processJumps({ manifestPath, outputDir, destination: 'Yverdon' })
    const after = (await loadManifestAsync(manifestPath))!
    after.groups[0]!.destination = 'Yverdon'
    await saveManifest(manifestPath, after)

    await processJumps({ manifestPath, outputDir, groupIds: ['g1'] })

    expect(delivered()).toEqual([
      path.join('Yverdon', 'yverdon_20260808_090909.mp4'),
      path.join('Yverdon', 'yverdon_20260808_090909_1.mp4')
    ])
  })
})

describe('particular files of a dropzone', () => {
  it('prepares only those, and leaves what is up there alone', async () => {
    const first = clip('DJI_0001.MP4', 0)
    const second = clip('DJI_0002.MP4', 60)
    const { manifestPath } = await write({ destination: 'Yverdon', files: [first, second] })
    await processJumps({ manifestPath, outputDir })
    const done = (await loadManifestAsync(manifestPath))!
    const copy = done.files.find((f) => f.id === first.id)!
    copy.uploaded = {
      remotePath: '/n/a.mp4',
      md5: 'x',
      size: 5,
      localPath: copy.processed!.path,
      at: 1
    }
    done.groups[0]!.files = done.groups[0]!.files.map((f) => (f.id === first.id ? copy : f))
    const target = done.files.find((f) => f.id === second.id)!
    fs.rmSync(target.processed!.path)
    delete target.processed
    await saveManifest(manifestPath, done)
    execSyncMock.mockClear()

    await processJumps({ manifestPath, outputDir, destination: 'Yverdon', fileIds: [second.id!] })

    const after = (await loadManifestAsync(manifestPath))!
    expect(after.files.find((f) => f.id === second.id)!.processed).toBeDefined()
    expect(after.files.find((f) => f.id === first.id)!.uploaded).toBeDefined()
    expect(ffmpegCalls().length).toBeLessThanOrEqual(1)
  })

  it('prepares only the loose files asked for', async () => {
    const lone: ManifestFile = { ...clip('DJI_0003.MP4', 0), id: 'lone', destination: 'Yverdon' }
    const other: ManifestFile = { ...clip('DJI_0004.MP4', 90), id: 'other', destination: 'Yverdon' }
    const { manifestPath } = await write({ id: 'g9', files: [clip('GX010009.MP4', 300)] })
    const manifest = (await loadManifestAsync(manifestPath))!
    manifest.files = [...manifest.files, lone, other]
    await saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir, destination: 'Yverdon', fileIds: ['other'] })

    const after = (await loadManifestAsync(manifestPath))!
    expect(after.files.find((f) => f.id === 'other')!.processed).toBeDefined()
    expect(after.files.find((f) => f.id === 'lone')!.processed).toBeUndefined()
  })
})

describe('cropping the frame', () => {
  const framed = { x: 0.1, y: 0, width: 0.9, height: 0.9 }

  it('cuts the rectangle and comes back out at the size the clip came at', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('crop=3456:1944:384:0')
    expect(cmd).toContain('scale=3840:2160')
  })

  it('encodes again rather than copying, because the picture changed', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).not.toContain('-c copy')
    expect(cmd).toMatch(/-c:v (libx264|h264_nvenc|h264_vaapi)/)
  })

  it('still copies the stream when only the ends were trimmed', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 1, cropEnd: 4 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-ss')) ?? ''
    expect(cmd).toContain('-c copy')
    expect(cmd).not.toContain('crop=')
  })

  it('leaves the project, the film and the archives where they are when it prepares again', async () => {
    const { manifestPath, group } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    await processJumps({ manifestPath, outputDir })
    const folder = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
    const beside = [
      'luc_favre_20260808.kdenlive',
      'luc_favre_20260808.mp4',
      'luc_favre_20260808.rushes.zip'
    ]
    for (const name of beside) fs.writeFileSync(path.join(folder, name), 'kept')
    fs.writeFileSync(path.join(folder, 'videos', 'left_over.mp4'), 'stale')

    await processJumps({ manifestPath, outputDir, groupIds: [group.id] })

    for (const name of beside) expect(fs.existsSync(path.join(folder, name))).toBe(true)
    expect(fs.existsSync(path.join(folder, 'videos', 'left_over.mp4'))).toBe(false)
  })

  it('cuts a clip trimmed at its end only', async () => {
    const { manifestPath } = await write({
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
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('-ss')) ?? ''
    expect(cmd).toContain('-ss 2')
    expect(cmd).not.toContain('-t ')
  })

  it('does both at once when both were set', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: framed, cropStart: 1, cropEnd: 4 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('crop=')) ?? ''
    expect(cmd).toContain('-ss 1')
    expect(cmd).toContain('-t 3.000000')
    expect(cmd).toContain('crop=3456:1944:384:0')
  })

  it('copies the file untouched when the rectangle covers everything', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), frame: { x: 0, y: 0, width: 1, height: 1 } }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })

  it('leaves a photo alone — a frame crop is for clips', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), frame: framed }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(false)
  })
})

describe('while a processing is running', () => {
  it('keeps an edit saved in the meantime', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    const meanwhile = (await loadManifestAsync(manifestPath))!
    execSyncMock.mockImplementation(async (cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('exiftool')) {
        meanwhile.destinations = [...(meanwhile.destinations ?? []), { name: 'Colombier' }]
        await saveManifest(manifestPath, meanwhile)
      }
      return tools(cmd, opts)
    })

    await processJumps({ manifestPath, outputDir })

    const after = (await loadManifestAsync(manifestPath))!
    expect(after.destinations?.map((d) => d.name)).toContain('Colombier')
    expect(after.groups[0]?.processed).toBe(true)
    expect(after.files[0]?.processed?.path).toMatch(/luc_favre_20260808_090909\.mp4$/)
  })

  it('does not call a jump processed when it was changed while its copies were written', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    const meanwhile = (await loadManifestAsync(manifestPath))!
    execSyncMock.mockImplementation(async (cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('exiftool')) {
        meanwhile.groups[0]!.files[0]!.cropStart = 1
        meanwhile.groups[0]!.files[0]!.cropEnd = 3
        await saveManifest(manifestPath, meanwhile)
      }
      return tools(cmd, opts)
    })

    await processJumps({ manifestPath, outputDir })

    expect((await loadManifestAsync(manifestPath))!.groups[0]?.processed).not.toBe(true)
  })

  it('says what it is working on, and a second one asked for waits for it, then runs', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })

    const first = processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    expect(processingNow()).toEqual({ groupIds: ['g1'], destinations: [] })
    const second = processJumps({ manifestPath, outputDir })
    expect(processingAll()).toHaveLength(2)
    expect(processingNow()).toEqual({ groupIds: ['g1'], destinations: [] })
    await first
    await expect(second).resolves.toMatchObject({ processedGroups: 1 })

    expect(processingNow()).toBeNull()
  })

  it('takes the same run asked for again while it waits as the one already waiting', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })

    const first = processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    const second = processJumps({ manifestPath, outputDir })
    const again = processJumps({ manifestPath, outputDir })
    expect(processingAll()).toHaveLength(2)
    await Promise.all([first, second, again])
  })

  it('is followed in the corner from the moment it is asked for, saying it waits for the one before it', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    const seen: LiveEvent[] = []
    const stop = subscribe((event) => seen.push(event))

    const first = processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    const second = processJumps({ manifestPath, outputDir, destination: 'Yverdon' })
    const last = new Map(
      seen.flatMap((event) =>
        event.kind === 'job' && event.type === 'process' ? [[event.id, event] as const] : []
      )
    )
    const [going, next] = [...last.values()]
    expect(last.size).toBe(2)
    expect(going).toMatchObject({ groupIds: ['g1'], destinations: [] })
    expect(next).toMatchObject({ destinations: ['Yverdon'], phase: 'waiting' })
    await Promise.all([first, second])
    stop()
  })
})

describe('what a delivered file says it came from', () => {
  const tagged = () =>
    execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('skydock:from='))

  it('is the original it was made from, written into the copy itself', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(tagged().some((l) => l.includes('skydock:from=id0'))).toBe(true)
  })

  it('is written into a photo the same way', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('G0010002.JPG', 1)]
    })

    await processJumps({ manifestPath, outputDir })

    expect(tagged().some((l) => l.includes('skydock:from='))).toBe(true)
  })
})

describe('turning a file', () => {
  const exiftoolCalls = () =>
    execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('exiftool -n'))

  it('encodes a turned clip again, turned, rather than copying it', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    const cmd = ffmpegCalls().find((l) => l.includes('transpose')) ?? ''
    expect(cmd).toContain('-vf transpose=1')
    expect(cmd).not.toContain('-c copy')
  })

  it('cuts the proxy of a montage clip to match, from the proxy itself', async () => {
    const proxy = writeTempFile(outputDir, 'proxies/id0.mp4')
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90, proxy }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls().some((l) => l.includes(proxy) && l.includes('transpose'))).toBe(true)
    expect(
      fs.existsSync(path.join(outputDir, 'proxies', 'cut', 'g1', 'luc_favre_20260808_090909.mp4'))
    ).toBe(true)
  })

  it('turns a photo by its orientation tag, without encoding it', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), rotation: 90 }]
    })

    await processJumps({ manifestPath, outputDir })

    expect(ffmpegCalls()).toEqual([])
    expect(exiftoolCalls().some((l) => l.includes('-Orientation=6'))).toBe(true)
  })

  it('stamps the copy with the turn it was made with', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('G0010002.JPG', 1), rotation: 180 }]
    })

    await processJumps({ manifestPath, outputDir })

    expect((await loadManifestAsync(manifestPath))!.files[0]?.processed?.source.rotation).toBe(180)
  })
})

describe('the proxy the editor opens on', () => {
  const withProxy = (over: Partial<ManifestFile>): ManifestFile => {
    const file = clip('GX010001.MP4', 0)
    const proxy = path.join(outputDir, 'proxies', 'id0.mp4')
    fs.mkdirSync(path.dirname(proxy), { recursive: true })
    fs.writeFileSync(proxy, Buffer.from('proxy'))
    return { ...file, proxy, ...over }
  }

  it('is cut and turned to match, and kept under the output folder', async () => {
    const dest = path.join(outputDir, 'processed', 'Montages', 'luc_favre_20260808_090909.mp4')

    const cut = await writeCutProxy(withProxy({ rotation: 90 }), dest, outputDir, 'group_1')

    expect(cut).toBe(
      path.join(getCutProxyDir(outputDir, 'group_1'), 'luc_favre_20260808_090909.mp4')
    )
    expect(fs.existsSync(cut!)).toBe(true)
    expect(ffmpegCalls().some((l) => l.includes('transpose=1') && l.includes(cut!))).toBe(true)
  })

  it('is cut to the frame', async () => {
    const dest = path.join(outputDir, 'processed', 'Montages', 'luc_favre_20260808_090909.mp4')

    const cut = await writeCutProxy(
      withProxy({ frame: { x: 0.1, y: 0, width: 0.9, height: 0.9 } }),
      dest,
      outputDir,
      'group_1'
    )

    expect(cut?.startsWith(path.join(outputDir, 'proxies', 'cut', 'group_1'))).toBe(true)
    expect(ffmpegCalls().some((l) => l.includes('crop='))).toBe(true)
  })
})

describe('changing the picture on an Intel or AMD card', () => {
  afterEach(() => setProxyEncoder(null))

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
    const { manifestPath } = await write({
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

  it('says why a file could not be cropped or turned', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('ffmpeg') && String(cmd).includes('transpose')) {
        const failure = new Error('ffmpeg exited') as Error & { stderr: string }
        failure.stderr =
          "Impossible to convert between the formats supported by the filter 'transpose'\nConversion failed!\n"
        throw failure
      }
      return tools(cmd, opts)
    })
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [{ ...clip('GX010001.MP4', 0), rotation: 90 }]
    })

    await expect(processJumps({ manifestPath, outputDir })).rejects.toThrow(
      /could not crop or turn GX010001\.MP4: Impossible to convert/
    )
  })
})

describe('processing, said as it happens', () => {
  const listening = () => {
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind !== 'job' && heard.push(event))
    return { heard, stop }
  }

  it('says of every file that it began, and that it ended well', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0), clip('G0010002.JPG', 1)]
    })
    const { heard, stop } = listening()

    await processJumps({ manifestPath, outputDir })
    stop()

    const said = heard.map((e) =>
      e.kind === 'file-done'
        ? `file-done ${e.fileId} ${e.ok}`
        : e.kind === 'file'
          ? `file ${e.fileId}`
          : e.kind
    )
    expect(said.filter((one, at) => one !== said[at - 1])).toEqual([
      'file id0',
      'file-done id0 true',
      'file id1',
      'file-done id1 true'
    ])
  })

  it('says how far a clip being written has got', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2, cropEnd: 8 }]
    })
    const { heard, stop } = listening()

    await processJumps({ manifestPath, outputDir })
    stop()

    expect(heard[0]).toEqual({ kind: 'file', work: 'process', fileId: 'id0', percent: 0 })
    expect(heard.at(-1)).toEqual({ kind: 'file-done', work: 'process', fileId: 'id0', ok: true })
  })

  it('says so when a file could not be processed, and nothing is left reading as under way', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      if (String(cmd).startsWith('ffmpeg')) throw new Error('ffmpeg exited with code 1')
      return tools(cmd, opts)
    })
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [{ ...clip('GX010001.MP4', 0), cropStart: 2, cropEnd: 8 }]
    })
    const { heard, stop } = listening()

    await processJumps({ manifestPath, outputDir }).catch(() => undefined)
    stop()

    expect(heard.at(-1)).toEqual({ kind: 'file-done', work: 'process', fileId: 'id0', ok: false })
    const late = listening()
    late.stop()
    expect(late.heard).toEqual([])
  })
})

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
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [plane]
        },
        {
          id: 'g2',
          label: 'g2',
          day: DAY,
          montageJump: true,
          passenger: { firstname: 'Ana', lastname: 'Roth' },
          files: [ana]
        }
      ],
      destinations: [{ name: 'Passengers' }]
    }
    copyFiles(manifest, new Set(['id0']), 'g2')
    const manifestPath = path.join(outputDir, 'manifest.json')
    await saveManifest(manifestPath, manifest)

    await processJumps({ manifestPath, outputDir })

    expect(delivered()).toEqual([
      path.join('Montages', 'Ana Roth', 'videos', 'ana_roth_20260808_090909.mp4'),
      path.join('Montages', 'Ana Roth', 'videos', 'ana_roth_20260808_110909.mp4'),
      path.join('Montages', 'Luc Favre', 'videos', 'luc_favre_20260808_090909.mp4')
    ])
    const after = (await loadManifestAsync(manifestPath))!
    const recorded = after.files
      .filter((f) => f.path === plane.path)
      .map((f) => path.basename(path.dirname(path.dirname(f.processed?.path ?? ''))))
    expect(recorded.sort()).toEqual(['Ana Roth', 'Luc Favre'])
  })
})

describe('cancelling what is being processed', () => {
  it('stops the run, leaves no half-written copy, and records nothing as processed', async () => {
    const { manifestPath } = await write({
      destination: 'Yverdon',
      files: [clip('GX010001.MP4', 0), clip('GX010002.MP4', 1)]
    })

    const run = processJumps({ manifestPath, outputDir })
    expect(cancelProcessing()).toBe(true)

    await expect(run).rejects.toThrow(/cancelled/)
    expect(delivered()).toEqual([])
    expect((await loadManifestAsync(manifestPath))?.groups[0]?.processed).toBeFalsy()
    expect(processingNow()).toBeNull()
  })

  it('stops one run by the id of its task, and leaves the others going', async () => {
    const { manifestPath } = await write({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [clip('GX010001.MP4', 0)]
    })
    const seen: LiveEvent[] = []
    const stop = subscribe((event) => seen.push(event))

    const first = processJumps({ manifestPath, outputDir, groupIds: ['g1'] })
    const waiting = processJumps({ manifestPath, outputDir, destination: 'Yverdon' })
    const ids = [
      ...new Set(
        seen.flatMap((event) =>
          event.kind === 'job' && event.type === 'process' ? [event.id] : []
        )
      )
    ]
    expect(cancelProcessing(ids[1])).toBe(true)

    await expect(waiting).rejects.toThrow(/cancelled/)
    await expect(first).resolves.toMatchObject({ processedGroups: 1 })
    stop()
  })

  it('says there is nothing to stop when nothing is being processed', () => {
    expect(cancelProcessing()).toBe(false)
  })
})
