// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
import { copyFiles } from '../src/moveFiles'
import { scanMedia } from '../src/scan'
import { createTmpDir, execSyncMock, makeFfmpegMock, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

describe('rescan preserves what the registry knows', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = createTmpDir('skydock-rescan-')
    execSyncMock.mockImplementation(makeFfmpegMock())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  /* a scan keeps what SkyDock decided about every file and reads only what the disk measures */
  it('keeps destination, crop and the processed record when a new file appears', async () => {
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
