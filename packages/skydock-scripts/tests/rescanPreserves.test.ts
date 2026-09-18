// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
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
})
