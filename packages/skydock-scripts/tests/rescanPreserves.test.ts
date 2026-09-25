// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
import { copyFiles } from '../src/moveFiles'
import { scanMedia } from '../src/scan'
import { createTmpDir, execSyncMock, makeFfmpegMock, tellTools, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

describe('a scan keeps the work already done', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = createTmpDir('skydock-rescan-')
    tellTools(['exiftool'])
    execSyncMock.mockImplementation(makeFfmpegMock())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  /* a scan keeps what SkyDock decided about every file and reads only what the disk measures */
  it('keeps where a file is filed, its crop and what was made from it, when a new file is found', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const first = loadManifest(manifestPath)!
    const file = first.files[0]
    file.destination = 'Yverdon'
    file.cropStart = 1.5
    file.cropEnd = 8.25
    file.processed = {
      path: '/out/processed/Yverdon/yverdon_x.mp4',
      size: 42,
      at: 10,
      source: {
        id: file.id,
        size: file.size,
        mtime: file.mtime,
        cropStart: 1.5,
        cropEnd: 8.25
      }
    }
    file.uploaded = {
      remotePath: '/home/Yverdon/yverdon_x.mp4',
      md5: 'abc',
      size: 42,
      localPath: '/out/processed/Yverdon/yverdon_x.mp4',
      at: 11
    }
    saveManifest(manifestPath, first)

    /* a scan that really does change something — the short-circuit path is not what broke */
    writeTempFile(origDir, 'DJI_0002.MP4')
    const result = await scanMedia({ outputDir })
    expect(result.added).toBe(1)

    const after = loadManifest(manifestPath)!
    const kept = after.files.find((f) => f.filename === 'DJI_0001.MP4')!
    expect(kept.destination).toBe('Yverdon')
    expect(kept.cropStart).toBe(1.5)
    expect(kept.processed?.path).toBe('/out/processed/Yverdon/yverdon_x.mp4')
    expect(kept.uploaded?.md5).toBe('abc')
  })

  it('lets the disk win on what the disk measures', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const target = writeTempFile(origDir, 'DJI_0001.MP4')
    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const first = loadManifest(manifestPath)!
    const originalSize = first.files[0].size
    first.files[0].destination = 'Yverdon'
    saveManifest(manifestPath, first)

    fs.writeFileSync(target, Buffer.alloc(originalSize + 500, 7))
    writeTempFile(origDir, 'DJI_0002.MP4')
    await scanMedia({ outputDir })

    const after = loadManifest(manifestPath)!
    const kept = after.files.find((f) => f.filename === 'DJI_0001.MP4')!
    expect(kept.size).toBe(originalSize + 500)
    expect(kept.destination).toBe('Yverdon')
  })

  /* A scan that finds new files leaves every jump already on the board as it is (RULES, Jumps): the
     new files are grouped among themselves, and join only a jump still being sorted. */
  describe('the jumps already on the board', () => {
    const origDir = () => path.join(outputDir, 'original_files')
    const manifestPath = () => path.join(outputDir, 'manifest.json')
    let fill = 0
    const shoot = (name: string, minutes: number) => {
      const target = writeTempFile(origDir(), name, Buffer.alloc(512, ++fill))
      const when = new Date(2026, 7, 1, 10, minutes, 0)
      fs.utimesSync(target, when, when)
    }
    const jumpOf = (name: string) =>
      loadManifest(manifestPath())!.groups.find((g) => g.files.some((f) => f.filename === name))

    /* two jumps two hours apart, read in once */
    const twoJumps = async () => {
      shoot('A1.MP4', 0)
      shoot('A2.MP4', 1)
      shoot('B1.MP4', 120)
      shoot('B2.MP4', 121)
      await scanMedia({ outputDir })
      return loadManifest(manifestPath())!
    }

    it('keeps a jump merged by hand, and a time corrected by hand, when new files are found', async () => {
      const manifest = await twoJumps()
      const [a, b] = manifest.groups
      a!.files = [...a!.files, ...b!.files]
      manifest.groups = [a!]
      const corrected = new Map(a!.files.map((f) => [f.id, f.mtime + 3600]))
      for (const f of manifest.files) f.mtime = corrected.get(f.id) ?? f.mtime
      saveManifest(manifestPath(), manifest)

      shoot('C1.MP4', 400)
      shoot('C2.MP4', 401)
      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath())!
      expect(
        jumpOf('A1.MP4')
          ?.files.map((f) => f.filename)
          .sort()
      ).toEqual(['A1.MP4', 'A2.MP4', 'B1.MP4', 'B2.MP4'])
      for (const f of after.files.filter((f) => corrected.has(f.id)))
        expect(f.mtime).toBe(corrected.get(f.id))
      expect(jumpOf('C1.MP4')?.files.map((f) => f.filename)).toEqual(['C1.MP4', 'C2.MP4'])
    })

    it('keeps what a montage went through — its upload, its montage, its freeing', async () => {
      const manifest = await twoJumps()
      const montage = manifest.groups[0]!
      Object.assign(montage, {
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, shareUrl: 'https://nas/sharing/luc' },
        montage: {
          projectPath: '/p.kdenlive',
          filmPath: '/f.mp4',
          template: 'epco',
          clips: 2,
          at: 1
        },
        freed: { at: 2, bytes: 10 }
      })
      saveManifest(manifestPath(), manifest)

      shoot('C1.MP4', 400)
      shoot('C2.MP4', 401)
      await scanMedia({ outputDir })

      expect(jumpOf('A1.MP4')).toMatchObject({
        uploaded: { shareUrl: 'https://nas/sharing/luc' },
        montage: { template: 'epco' },
        freed: { bytes: 10 }
      })
    })

    it('puts new files shot close to a jump still being sorted into that jump', async () => {
      await twoJumps()
      shoot('A3.MP4', 5)

      await scanMedia({ outputDir })

      expect(jumpOf('A3.MP4')?.files.map((f) => f.filename)).toEqual(['A1.MP4', 'A2.MP4', 'A3.MP4'])
    })

    it('never adds a new file to a jump that is already filed', async () => {
      const manifest = await twoJumps()
      manifest.groups[0]!.destination = 'Yverdon'
      saveManifest(manifestPath(), manifest)
      shoot('A3.MP4', 5)

      await scanMedia({ outputDir })

      expect(jumpOf('A1.MP4')?.files.map((f) => f.filename)).toEqual(['A1.MP4', 'A2.MP4'])
      expect(jumpOf('A3.MP4')).toBeUndefined()
    })

    it('leaves a new file with no neighbours loose', async () => {
      await twoJumps()
      shoot('LONE.MP4', 600)

      await scanMedia({ outputDir })

      expect(jumpOf('LONE.MP4')).toBeUndefined()
      expect(loadManifest(manifestPath())!.files.some((f) => f.filename === 'LONE.MP4')).toBe(true)
    })
  })

  /* Being freed is the file not being here, never a mark a file carries about. */
  describe('a file that was freed', () => {
    /* a second file, so the scan has something to report and does not stop at "no changes" */
    const board = async (freedName: string) => {
      const origDir = path.join(outputDir, 'original_files')
      writeTempFile(origDir, 'DJI_0001.MP4')
      writeTempFile(origDir, 'DJI_0002.MP4', Buffer.alloc(512, 7))
      await scanMedia({ outputDir })
      const manifestPath = path.join(outputDir, 'manifest.json')
      const manifest = loadManifest(manifestPath)!
      manifest.files = manifest.files.map((f) =>
        f.filename === freedName ? { ...f, freed: true } : f
      )
      saveManifest(manifestPath, manifest)
      return { manifestPath, origDir }
    }

    it('stops saying a file lives on the storage only once it is back on this machine', async () => {
      const { manifestPath, origDir } = await board('DJI_0001.MP4')
      writeTempFile(origDir, 'DJI_0003.MP4', Buffer.alloc(512, 9))

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      expect(after.files.find((f) => f.filename === 'DJI_0001.MP4')?.freed).toBeUndefined()
    })

    it('keeps a freed file as freed while there is nothing of it here', async () => {
      const { manifestPath, origDir } = await board('DJI_0001.MP4')
      fs.rmSync(path.join(origDir, 'DJI_0001.MP4'))
      writeTempFile(origDir, 'DJI_0003.MP4', Buffer.alloc(512, 9))

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      expect(after.files.find((f) => f.filename === 'DJI_0001.MP4')?.freed).toBe(true)
    })
  })

  /* A copy is an entry of its own for a file that is on the disk once. A scan reads the file's
     identity off its contents, which is the original's — so the copy has to keep its own, stay in
     its jump, and follow the original when that is moved. */
  describe('a file copied into another jump', () => {
    /* two jumps two hours apart, distinct contents so each file has an identity of its own */
    const twoJumps = async () => {
      const origDir = path.join(outputDir, 'original_files')
      const at = (name: string, fill: number, minutes: number) => {
        const target = writeTempFile(origDir, name, Buffer.alloc(512, fill))
        const when = new Date(2026, 7, 1, 10, minutes, 0)
        fs.utimesSync(target, when, when)
      }
      at('A1.MP4', 1, 0)
      at('A2.MP4', 2, 1)
      at('B1.MP4', 3, 120)
      at('B2.MP4', 4, 121)
      await scanMedia({ outputDir })
      const manifestPath = path.join(outputDir, 'manifest.json')
      const manifest = loadManifest(manifestPath)!
      const [first, second] = manifest.groups
      const shared = first!.files[0]!
      copyFiles(manifest, new Set([shared.id!]), second!.id)
      saveManifest(manifestPath, manifest)
      return { manifestPath, origDir, shared, target: second!.id, at }
    }

    it('keeps its own identity and its jump when a scan finds a new file', async () => {
      const { manifestPath, shared, target, at } = await twoJumps()
      at('C1.MP4', 5, 300)

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      const copy = after.groups.find((g) => g.id === target)?.files.find((f) => f.copyOf)
      expect(copy).toMatchObject({ id: `${shared.id}~1`, copyOf: shared.id, path: shared.path })
      /* and the original is still once, in the jump it was in */
      expect(after.files.filter((f) => f.path === shared.path)).toHaveLength(2)
    })

    it('stops saying a copy lives on the storage only once the file it points at is back', async () => {
      const { manifestPath, shared, at } = await twoJumps()
      const manifest = loadManifest(manifestPath)!
      manifest.files = manifest.files.map((f) =>
        f.copyOf === shared.id || f.id === shared.id ? { ...f, freed: true } : f
      )
      saveManifest(manifestPath, manifest)
      at('C1.MP4', 5, 300)

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      expect(after.files.filter((f) => f.path === shared.path).some((f) => f.freed)).toBe(false)
    })

    it('follows its original when the file is moved on the disk', async () => {
      const { manifestPath, origDir, shared, target } = await twoJumps()
      const moved = path.join(origDir, 'renamed', 'A1-renamed.MP4')
      fs.mkdirSync(path.dirname(moved), { recursive: true })
      fs.renameSync(shared.path, moved)

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      const copy = after.groups.find((g) => g.id === target)?.files.find((f) => f.copyOf)
      expect(copy?.path).toBe(moved)
    })

    it('goes when its original is gone from the disk', async () => {
      const { manifestPath, shared } = await twoJumps()
      fs.rmSync(shared.path)

      await scanMedia({ outputDir })

      const after = loadManifest(manifestPath)!
      expect(after.files.some((f) => f.copyOf)).toBe(false)
    })
  })
})
