// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Manifest } from '../src/types'

const execSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: execSyncMock
  }
})

const { scanMedia } = await import('../src/scan')
const { loadManifest, saveManifest } = await import('../src/manifest')

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-scan-test-'))

const writeTempFile = (dir: string, name: string, content?: Buffer): string => {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content || Buffer.alloc(1024, 1))
  return filePath
}

const makeFfmpegMock = () => {
  return (cmd: string | Buffer): Buffer => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v exiftool')) {
      throw new Error('command not found')
    }
    return Buffer.from('')
  }
}

const toLocalExifTag = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  const offsetMs = d.getTime() - d.getTimezoneOffset() * 60_000
  const local = new Date(offsetMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${local.getUTCFullYear()}:${pad(local.getUTCMonth() + 1)}:${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
}

const makeExiftoolMock = (timeMap: Map<string, string>) => {
  return (cmd: string | Buffer, opts?: { encoding?: string }): string | Buffer => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v exiftool')) {
      return Buffer.from('/usr/bin/exiftool')
    }
    if (cmdStr.includes('exiftool')) {
      if (opts?.encoding === 'utf-8') {
        const lines = ['SourceFile,DateTimeOriginal,CreateDate,MediaCreateDate']
        for (const [file, tag] of timeMap) {
          const exifDate = tag.replace(/-/g, ':').replace(' ', ' ')
          lines.push(`"${file}","${exifDate}","${exifDate}","${exifDate}"`)
        }
        return lines.join('\n')
      }
      return Buffer.from('')
    }
    return Buffer.from('')
  }
}

describe('scanMedia', () => {
  let tmpDir: string
  let outputDir: string

  beforeEach(() => {
    tmpDir = createTmpDir()
    outputDir = path.join(tmpDir, 'output')
    fs.mkdirSync(outputDir, { recursive: true })
    execSyncMock.mockReset()
    execSyncMock.mockImplementation(makeFfmpegMock())
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns zeros when original_files does not exist', async () => {
    const result = await scanMedia({ outputDir })
    expect(result).toEqual({ added: 0, removed: 0, unchanged: true, fileCount: 0, jumpCount: 0 })
  })

  it('returns zeros when no media files found', async () => {
    fs.mkdirSync(path.join(outputDir, 'original_files'), { recursive: true })
    const result = await scanMedia({ outputDir })
    expect(result).toEqual({ added: 0, removed: 0, unchanged: true, fileCount: 0, jumpCount: 0 })
  })

  it('creates fresh manifest with video files and computes id', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const videoPath = writeTempFile(origDir, 'DJI_0001.MP4')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(1)
    expect(result.removed).toBe(0)
    expect(result.unchanged).toBe(false)
    expect(result.fileCount).toBe(1)
    expect(result.jumpCount).toBe(1)

    const manifestPath = path.join(outputDir, 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.version).toBe(1)
    expect(manifest.status).toBe('proposed')
    expect(manifest.files).toHaveLength(1)
    expect(manifest.files[0].path).toBe(videoPath)
    expect(manifest.files[0].filename).toBe('DJI_0001.MP4')
    expect(manifest.files[0].id).toBeDefined()
    expect(typeof manifest.files[0].id).toBe('string')
    expect(manifest.files[0].id.length).toBe(16)
    expect(manifest.jumps).toHaveLength(1)
  })

  it('creates fresh manifest with photo files', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.JPG')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(1)
    expect(result.fileCount).toBe(1)
  })

  it('creates fresh manifest with mixed media types', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    writeTempFile(origDir, 'DJI_0002.JPG')
    writeTempFile(origDir, 'DJI_0003.MP4')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(3)
    expect(result.fileCount).toBe(3)
    expect(result.jumpCount).toBe(1)
  })

  it('ignores non-media files', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    writeTempFile(origDir, 'README.txt')
    writeTempFile(origDir, 'data.csv')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(1)
    expect(result.fileCount).toBe(1)
  })

  it('reports unchanged when no changes on rescan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')

    await scanMedia({ outputDir })
    const result = await scanMedia({ outputDir })

    expect(result.unchanged).toBe(true)
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
  })

  it('detects new files on rescan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')

    await scanMedia({ outputDir })

    writeTempFile(origDir, 'DJI_0002.MP4')
    const result = await scanMedia({ outputDir })

    expect(result.unchanged).toBe(false)
    expect(result.added).toBe(1)
    expect(result.removed).toBe(0)
    expect(result.fileCount).toBe(2)
  })

  it('detects removed files on rescan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const videoPath = writeTempFile(origDir, 'DJI_0001.MP4')

    await scanMedia({ outputDir })

    fs.unlinkSync(videoPath)
    const result = await scanMedia({ outputDir })

    expect(result.unchanged).toBe(false)
    expect(result.added).toBe(0)
    expect(result.removed).toBe(1)
    expect(result.fileCount).toBe(0)
  })

  it('detects both added and removed files on rescan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const video1 = writeTempFile(origDir, 'DJI_0001.MP4')
    writeTempFile(origDir, 'DJI_0002.MP4')

    await scanMedia({ outputDir })

    fs.unlinkSync(video1)
    writeTempFile(origDir, 'DJI_0003.MP4')
    const result = await scanMedia({ outputDir })

    expect(result.unchanged).toBe(false)
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
    expect(result.fileCount).toBe(2)
  })

  it('preserves user edits on rescan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    writeTempFile(origDir, 'DJI_0002.MP4')

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    manifest.jumps[0].label = 'My Custom Jump'
    manifest.jumps[0].confirmed = true
    saveManifest(manifestPath, manifest)

    const result = await scanMedia({ outputDir })

    expect(result.unchanged).toBe(true)
    const updated = loadManifest(manifestPath) as Manifest
    expect(updated.jumps[0].label).toBe('My Custom Jump')
    expect(updated.jumps[0].confirmed).toBe(true)
  })

  it('sorts files by mtime', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const video1 = writeTempFile(origDir, 'DJI_0001.MP4')
    writeTempFile(origDir, 'DJI_0002.MP4')

    const future = Date.now() + 100000
    fs.utimesSync(video1, future / 1000, future / 1000)

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files[0].filename).toBe('DJI_0002.MP4')
    expect(manifest.files[1].filename).toBe('DJI_0001.MP4')
  })

  it('clusters files into jumps by time gap', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const video1 = writeTempFile(origDir, 'DJI_0001.MP4')
    const video2 = writeTempFile(origDir, 'DJI_0002.MP4')
    const video3 = writeTempFile(origDir, 'DJI_0003.MP4')

    const baseEpoch = Math.floor(Date.now() / 1000)
    fs.utimesSync(video1, baseEpoch, baseEpoch)
    fs.utimesSync(video2, baseEpoch, baseEpoch + 60)
    fs.utimesSync(video3, baseEpoch, baseEpoch + 2000)

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.jumps).toHaveLength(2)
    expect(manifest.jumps[0].files).toHaveLength(2)
    expect(manifest.jumps[1].files).toHaveLength(1)
  })

  it('creates subdirectories in original_files', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'subdir/DJI_0001.MP4')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(1)
    expect(result.fileCount).toBe(1)
  })

  it('uses mtime as capture epoch when exiftool not available', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const videoPath = writeTempFile(origDir, 'DJI_0001.MP4')
    const targetEpoch = 1700000000
    fs.utimesSync(videoPath, targetEpoch, targetEpoch)

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files[0].mtime).toBe(targetEpoch)
  })

  it('uses exiftool time when available', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const videoPath = writeTempFile(origDir, 'DJI_0001.MP4')
    const fsEpoch = 1700000000
    fs.utimesSync(videoPath, fsEpoch, fsEpoch)

    const exifEpoch = 1600000000
    const tag = toLocalExifTag(exifEpoch)

    const timeMap = new Map([[videoPath, tag]])
    execSyncMock.mockImplementation(makeExiftoolMock(timeMap))

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files[0].mtime).toBe(exifEpoch)
  })

  it('handles multiple files with different exif times', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const video1 = writeTempFile(origDir, 'DJI_0001.MP4')
    const video2 = writeTempFile(origDir, 'DJI_0002.MP4')

    const baseEpoch = 1700000000
    fs.utimesSync(video1, baseEpoch, baseEpoch)
    fs.utimesSync(video2, baseEpoch, baseEpoch)

    const tag1 = toLocalExifTag(baseEpoch)
    const tag2 = toLocalExifTag(baseEpoch + 60)
    const timeMap = new Map([
      [video1, tag1],
      [video2, tag2]
    ])
    execSyncMock.mockImplementation(makeExiftoolMock(timeMap))

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files[0].mtime).toBe(baseEpoch)
    expect(manifest.files[1].mtime).toBe(baseEpoch + 60)
  })

  it('creates manifest with correct structure after fresh scan', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.version).toBe(1)
    expect(manifest.status).toBe('proposed')
    expect(manifest.files).toHaveLength(1)
    expect(manifest.jumps).toHaveLength(1)
    expect(manifest.jumps[0].confirmed).toBe(false)
  })

  it('updates manifest correctly after merge with new files', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    await scanMedia({ outputDir })

    writeTempFile(origDir, 'DJI_0002.MP4')
    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files).toHaveLength(2)
  })

  it('does not overwrite manifest when unchanged', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')
    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const firstRead = fs.readFileSync(manifestPath, 'utf-8')

    await scanMedia({ outputDir })

    const secondRead = fs.readFileSync(manifestPath, 'utf-8')
    expect(firstRead).toBe(secondRead)
  })

  it('writes status files', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4')

    await scanMedia({ outputDir })

    const statusDir = path.join(outputDir, '.status')
    expect(fs.existsSync(path.join(statusDir, 'scan.json'))).toBe(true)
    const status = JSON.parse(fs.readFileSync(path.join(statusDir, 'scan.json'), 'utf-8'))
    expect(status.state).toBe('done')
  })

  it('handles empty original_files directory', async () => {
    const origDir = path.join(outputDir, 'original_files')
    fs.mkdirSync(path.join(origDir, 'empty_subdir'), { recursive: true })

    const result = await scanMedia({ outputDir })

    expect(result).toEqual({ added: 0, removed: 0, unchanged: true, fileCount: 0, jumpCount: 0 })
  })

  it('supports video extensions mp4 and mov', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'video.MP4')
    writeTempFile(origDir, 'video2.MOV')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(2)
    expect(result.fileCount).toBe(2)
  })

  it('supports photo extensions jpg, jpeg, and dng', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'photo.JPG')
    writeTempFile(origDir, 'photo2.JPEG')
    writeTempFile(origDir, 'photo3.DNG')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(3)
    expect(result.fileCount).toBe(3)
  })

  it('ignores unsupported extensions', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'video.TXT')
    writeTempFile(origDir, 'video2.CSV')
    writeTempFile(origDir, 'photo.JSON')
    writeTempFile(origDir, 'photo2.PDF')

    const result = await scanMedia({ outputDir })

    expect(result.added).toBe(0)
    expect(result.fileCount).toBe(0)
  })

  it('computes deterministic id for same file content', async () => {
    const origDir = path.join(outputDir, 'original_files')
    const content = Buffer.alloc(1024, 42)
    writeTempFile(origDir, 'DJI_0001.MP4', content)

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    const firstId = manifest.files[0].id

    fs.rmSync(outputDir, { recursive: true, force: true })
    fs.mkdirSync(outputDir, { recursive: true })
    writeTempFile(origDir, 'DJI_0001.MP4', content)

    await scanMedia({ outputDir })

    const manifest2 = loadManifest(manifestPath) as Manifest
    expect(manifest2.files[0].id).toBe(firstId)
  })

  it('computes different ids for different file content', async () => {
    const origDir = path.join(outputDir, 'original_files')
    writeTempFile(origDir, 'DJI_0001.MP4', Buffer.alloc(1024, 1))
    writeTempFile(origDir, 'DJI_0002.MP4', Buffer.alloc(1024, 2))

    await scanMedia({ outputDir })

    const manifestPath = path.join(outputDir, 'manifest.json')
    const manifest = loadManifest(manifestPath) as Manifest
    expect(manifest.files[0].id).not.toBe(manifest.files[1].id)
  })
})
