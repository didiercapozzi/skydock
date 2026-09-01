// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Manifest, ManifestFile } from '../src/types'

const { loadManifest: loadManifestForTest } = await import('../src/manifest')

const execSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: execSyncMock
  }
})

const { generateProxies } = await import('../src/proxies')

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-proxies-test-'))

const writeTempFile = (dir: string, name: string, content = Buffer.alloc(1024, 1)): string => {
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

const buildManifest = (files: ManifestFile[]): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-27',
  startDatetime: '2026-08-27T09:00:00Z',
  createdAt: new Date().toISOString(),
  theory: [],
  files,
  jumps: [
    {
      id: 'jump_1',
      label: 'Jump 1',
      confirmed: false,
      files
    }
  ]
})

const makeFfmpegMock = (opts?: { ffmpegAvailable?: boolean }) => {
  return (cmd: string | Buffer): Buffer => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v')) {
      if (opts?.ffmpegAvailable === false) throw new Error('command not found')
      return Buffer.from('')
    }
    if (cmdStr.includes('ffprobe')) {
      return Buffer.from(JSON.stringify({ frames: [{ key_frame: 1, pkt_pts_time: '0.000000' }] }))
    }
    if (cmdStr.includes('-i ') && cmdStr.includes('2>/dev/null')) {
      if (cmdStr.includes('fps=1,scale=160')) {
        const outMatch = cmdStr.match(/"([^"]+%04d\.jpg)"/)
        if (outMatch) {
          const pattern = outMatch[1]
          const dir = path.dirname(pattern)
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, '0001.jpg'), Buffer.from('filmstrip'))
          fs.writeFileSync(path.join(dir, '0002.jpg'), Buffer.from('filmstrip'))
        }
        return Buffer.from('')
      }
      const outMatch = cmdStr.match(/"([^"]+)"\s*2>\/dev\/null$/)
      if (outMatch) {
        const outPath = outMatch[1]
        if (outPath.includes('%04d.jpg')) {
          const dir = path.dirname(outPath)
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, '0001.jpg'), Buffer.from('filmstrip'))
        } else {
          fs.mkdirSync(path.dirname(outPath), { recursive: true })
          fs.writeFileSync(outPath, Buffer.from('thumb'))
        }
      }
      return Buffer.from('')
    }
    return Buffer.from('')
  }
}

describe('generateProxies', () => {
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

  it('returns zeros when manifest does not exist', async () => {
    const result = await generateProxies({ outputDir })
    expect(result).toEqual({ thumbs: 0, proxies: 0, total: 0 })
  })

  it('returns zeros when ffmpeg is not available', async () => {
    execSyncMock.mockImplementation(makeFfmpegMock({ ffmpegAvailable: false }))

    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'test123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result = await generateProxies({ outputDir })
    expect(result).toEqual({ thumbs: 0, proxies: 0, total: 0 })
  })

  it('returns zeros when manifest has no video files', async () => {
    const photoPath = writeTempFile(tmpDir, 'DJI_0001.JPG')
    const manifest = buildManifest([
      { path: photoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.JPG', id: 'test123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result = await generateProxies({ outputDir })
    expect(result).toEqual({ thumbs: 0, proxies: 0, total: 0 })
  })

  it('generates thumbnails and filmstrips for video files', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.total).toBe(1)
    expect(result.thumbs).toBe(1)
    expect(result.proxies).toBe(1)

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    const filmstripDir = path.join(outputDir, '.cache', 'filmstrip', 'vid123')
    expect(fs.existsSync(path.join(thumbDir, 'vid123.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(filmstripDir, '0001.jpg'))).toBe(true)
  })

  it('skips existing thumbnails that are newer than source', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: 1000, filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    fs.mkdirSync(thumbDir, { recursive: true })
    const thumbPath = path.join(thumbDir, 'vid123.jpg')
    fs.writeFileSync(thumbPath, Buffer.from('existing'))
    const futureTime = Date.now() + 100000
    fs.utimesSync(thumbPath, futureTime / 1000, futureTime / 1000)

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.thumbs).toBe(1)
    expect(execSyncMock.mock.calls.some((call) => String(call[0]).includes('vframes 1'))).toBe(
      false
    )
  })

  it('skips existing filmstrips that are newer than source', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: 1000, filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const filmstripDir = path.join(outputDir, '.cache', 'filmstrip', 'vid123')
    fs.mkdirSync(filmstripDir, { recursive: true })
    const probe = path.join(filmstripDir, '0001.jpg')
    fs.writeFileSync(probe, Buffer.from('existing'))
    const futureTime = Date.now() + 100000
    fs.utimesSync(probe, futureTime / 1000, futureTime / 1000)

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.proxies).toBe(1)
    expect(
      execSyncMock.mock.calls.some((call) => String(call[0]).includes('fps=1,scale=160'))
    ).toBe(false)
  })

  it('cleans up stale thumbnails not in manifest', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'new_vid' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    fs.mkdirSync(thumbDir, { recursive: true })
    fs.writeFileSync(path.join(thumbDir, 'old_stale.jpg'), Buffer.from('stale'))

    await generateProxies({ outputDir, jobs: 1 })

    expect(fs.existsSync(path.join(thumbDir, 'old_stale.jpg'))).toBe(false)
    expect(fs.existsSync(path.join(thumbDir, 'new_vid.jpg'))).toBe(true)
  })

  it('updates manifest with thumbPath and filmstripDir', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    const manifestPath = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    await generateProxies({ outputDir, jobs: 1 })

    const updated = loadManifestForTest(manifestPath) as Manifest
    expect(updated.files[0].thumbPath).toContain('vid123.jpg')
    expect(updated.files[0].filmstripDir).toContain('vid123')
    expect(updated.jumps[0].files[0].thumbPath).toContain('vid123.jpg')
    expect(updated.jumps[0].files[0].filmstripDir).toContain('vid123')
  })

  it('removes thumbPath and filmstripDir for non-video files', async () => {
    const photoPath = writeTempFile(tmpDir, 'DJI_0001.JPG')
    const videoPath = writeTempFile(tmpDir, 'DJI_0002.MP4')
    const manifest: Manifest = {
      version: 1,
      status: 'proposed',
      date: '2026-08-27',
      startDatetime: '2026-08-27T09:00:00Z',
      createdAt: new Date().toISOString(),
      theory: [],
      files: [
        {
          path: photoPath,
          size: 1024,
          mtime: Date.now(),
          filename: 'DJI_0001.JPG',
          id: 'photo1',
          thumbPath: '/stale/thumb.jpg',
          filmstripDir: '/stale/filmstrip'
        },
        { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0002.MP4', id: 'vid1' }
      ],
      jumps: [
        {
          id: 'jump_1',
          label: 'Jump 1',
          confirmed: false,
          files: [
            {
              path: photoPath,
              size: 1024,
              mtime: Date.now(),
              filename: 'DJI_0001.JPG',
              id: 'photo1',
              thumbPath: '/stale/thumb.jpg',
              filmstripDir: '/stale/filmstrip'
            },
            { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0002.MP4', id: 'vid1' }
          ]
        }
      ]
    }
    const manifestPath = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    await generateProxies({ outputDir, jobs: 1 })

    const updated = loadManifestForTest(manifestPath) as Manifest
    expect(updated.files[0].thumbPath).toBeUndefined()
    expect(updated.files[0].filmstripDir).toBeUndefined()
    expect(updated.jumps[0].files[0].thumbPath).toBeUndefined()
    expect(updated.jumps[0].files[0].filmstripDir).toBeUndefined()
  })

  it('generates unique filmstrips for files with different ids', async () => {
    const content = Buffer.alloc(1024, 42)
    const videoPath1 = writeTempFile(tmpDir, 'DJI_0001.MP4', content)
    const videoPath2 = writeTempFile(tmpDir, 'DJI_0002.MP4', content)
    const videoPath3 = writeTempFile(tmpDir, 'DJI_0003.MP4', content)
    const manifest = buildManifest([
      {
        path: videoPath1,
        size: content.length,
        mtime: 1000,
        filename: 'DJI_0001.MP4',
        id: 'file1'
      },
      {
        path: videoPath2,
        size: content.length,
        mtime: 1015,
        filename: 'DJI_0002.MP4',
        id: 'file2'
      },
      {
        path: videoPath3,
        size: content.length,
        mtime: 1030,
        filename: 'DJI_0003.MP4',
        id: 'file3'
      }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.total).toBe(3)
    expect(result.thumbs).toBe(3)
    expect(result.proxies).toBe(3)

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    const baseDir = path.join(outputDir, '.cache', 'filmstrip')
    expect(fs.existsSync(path.join(thumbDir, 'file1.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(thumbDir, 'file2.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(thumbDir, 'file3.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(baseDir, 'file1', '0001.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(baseDir, 'file2', '0001.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(baseDir, 'file3', '0001.jpg'))).toBe(true)
  })

  it('reports accurate new vs existing counts', async () => {
    const content = Buffer.alloc(1024, 99)
    const videoPath1 = writeTempFile(tmpDir, 'DJI_0001.MP4', content)
    const videoPath2 = writeTempFile(tmpDir, 'DJI_0002.MP4', content)
    const manifest = buildManifest([
      {
        path: videoPath1,
        size: content.length,
        mtime: 2000,
        filename: 'DJI_0001.MP4',
        id: 'vid_a'
      },
      {
        path: videoPath2,
        size: content.length,
        mtime: 2015,
        filename: 'DJI_0002.MP4',
        id: 'vid_b'
      }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result1 = await generateProxies({ outputDir, jobs: 1 })
    expect(result1.thumbs).toBe(2)
    expect(result1.proxies).toBe(2)

    const result2 = await generateProxies({ outputDir, jobs: 1 })
    expect(result2.thumbs).toBe(2)
    expect(result2.proxies).toBe(2)

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    const baseDir = path.join(outputDir, '.cache', 'filmstrip')
    expect(fs.readdirSync(thumbDir).filter((f) => f.endsWith('.jpg')).length).toBe(2)
    expect(fs.readdirSync(baseDir).length).toBe(2)
  })

  it('generates separate filmstrips for files with different ids', async () => {
    const content = Buffer.alloc(512, 7)
    const videoPath1 = writeTempFile(tmpDir, 'CAM_A.MP4', content)
    const videoPath2 = writeTempFile(tmpDir, 'CAM_B.MP4', content)
    const manifest = buildManifest([
      {
        path: videoPath1,
        size: content.length,
        mtime: 3000,
        filename: 'CAM_A.MP4',
        id: 'cam_a_id'
      },
      { path: videoPath2, size: content.length, mtime: 3015, filename: 'CAM_B.MP4', id: 'cam_b_id' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.total).toBe(2)
    expect(result.thumbs).toBe(2)
    expect(result.proxies).toBe(2)

    const thumbDir = path.join(outputDir, '.cache', 'thumbs')
    const baseDir = path.join(outputDir, '.cache', 'filmstrip')
    const thumbFiles = fs.readdirSync(thumbDir).filter((f) => f.endsWith('.jpg'))
    const stripDirs = fs.readdirSync(baseDir)
    expect(thumbFiles.length).toBe(2)
    expect(stripDirs.length).toBe(2)

    expect(stripDirs[0]).not.toBe(stripDirs[1])
  })
})
