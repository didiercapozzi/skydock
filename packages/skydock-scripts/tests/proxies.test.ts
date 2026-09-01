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

const makeFfmpegMock = (opts?: { failEncoder?: string; ffmpegAvailable?: boolean }) => {
  return (cmd: string | Buffer): Buffer => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v')) {
      if (opts?.ffmpegAvailable === false) throw new Error('command not found')
      return Buffer.from('')
    }
    if (cmdStr.includes('ffmpeg -encoders')) {
      return Buffer.from('V..... h264_nvenc      NVIDIA NVENC H.264 Encoder')
    }
    if (cmdStr.includes('-i ') && cmdStr.includes('2>/dev/null')) {
      if (opts?.failEncoder && cmdStr.includes(opts.failEncoder)) {
        throw new Error(`${opts.failEncoder} failed`)
      }
      const outMatch = cmdStr.match(/"([^"]+)"\s*2>\/dev\/null$/)
      if (outMatch) {
        const outPath = outMatch[1]
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, Buffer.from('proxy'))
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

  it('generates thumbnails and proxies for video files', async () => {
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
    const proxyDir = path.join(outputDir, '.cache', 'proxies')
    expect(fs.existsSync(path.join(thumbDir, 'vid123.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(proxyDir, 'vid123.mp4'))).toBe(true)
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

  it('skips existing proxies that are newer than source', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: 1000, filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    const proxyDir = path.join(outputDir, '.cache', 'proxies')
    fs.mkdirSync(proxyDir, { recursive: true })
    const proxyPath = path.join(proxyDir, 'vid123.mp4')
    fs.writeFileSync(proxyPath, Buffer.from('existing'))
    const futureTime = Date.now() + 100000
    fs.utimesSync(proxyPath, futureTime / 1000, futureTime / 1000)

    const result = await generateProxies({ outputDir, jobs: 1 })

    expect(result.proxies).toBe(1)
    expect(execSyncMock.mock.calls.some((call) => String(call[0]).includes('scale=-2:'))).toBe(
      false
    )
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

  it('updates manifest with thumbPath and proxyPath', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    const manifestPath = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    await generateProxies({ outputDir, jobs: 1 })

    const updated = loadManifestForTest(manifestPath) as Manifest
    expect(updated.files[0].thumbPath).toContain('vid123.jpg')
    expect(updated.files[0].proxyPath).toContain('vid123.mp4')
    expect(updated.jumps[0].files[0].thumbPath).toContain('vid123.jpg')
    expect(updated.jumps[0].files[0].proxyPath).toContain('vid123.mp4')
  })

  it('removes thumbPath and proxyPath for non-video files', async () => {
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
          proxyPath: '/stale/proxy.mp4'
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
              proxyPath: '/stale/proxy.mp4'
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
    expect(updated.files[0].proxyPath).toBeUndefined()
    expect(updated.jumps[0].files[0].thumbPath).toBeUndefined()
    expect(updated.jumps[0].files[0].proxyPath).toBeUndefined()
  })

  it('uses h264_nvenc encoder with fallback to libx264', async () => {
    execSyncMock.mockImplementation(makeFfmpegMock({ failEncoder: 'h264_nvenc' }))

    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    await generateProxies({ outputDir, jobs: 1 })

    const calls = execSyncMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('h264_nvenc'))).toBe(true)
    expect(calls.some((c) => c.includes('libx264'))).toBe(true)
  })

  it('generates unique proxies for files with identical content but different paths', async () => {
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
    const proxyDir = path.join(outputDir, '.cache', 'proxies')
    expect(fs.existsSync(path.join(thumbDir, 'file1.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(thumbDir, 'file2.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(thumbDir, 'file3.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(proxyDir, 'file1.mp4'))).toBe(true)
    expect(fs.existsSync(path.join(proxyDir, 'file2.mp4'))).toBe(true)
    expect(fs.existsSync(path.join(proxyDir, 'file3.mp4'))).toBe(true)
  })

  it('reports accurate new vs existing counts for identical-content files', async () => {
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
    const proxyDir = path.join(outputDir, '.cache', 'proxies')
    expect(fs.readdirSync(thumbDir).filter((f) => f.endsWith('.jpg')).length).toBe(2)
    expect(fs.readdirSync(proxyDir).filter((f) => f.endsWith('.mp4')).length).toBe(2)
  })

  it('generates separate proxies for files with different ids', async () => {
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
    const proxyDir = path.join(outputDir, '.cache', 'proxies')
    const thumbFiles = fs.readdirSync(thumbDir).filter((f) => f.endsWith('.jpg'))
    const proxyFiles = fs.readdirSync(proxyDir).filter((f) => f.endsWith('.mp4'))
    expect(thumbFiles.length).toBe(2)
    expect(proxyFiles.length).toBe(2)

    const thumbIds = thumbFiles.map((f) => path.basename(f, '.jpg'))
    const proxyIds = proxyFiles.map((f) => path.basename(f, '.mp4'))
    expect(thumbIds[0]).not.toBe(thumbIds[1])
    expect(proxyIds[0]).not.toBe(proxyIds[1])
    expect(thumbIds).toEqual(proxyIds)
  })

  it('respects custom proxy options', async () => {
    const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
    const manifest = buildManifest([
      { path: videoPath, size: 1024, mtime: Date.now(), filename: 'DJI_0001.MP4', id: 'vid123' }
    ])
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest))

    await generateProxies({
      outputDir,
      jobs: 1,
      scale: 240,
      crf: 28,
      fps: 24,
      preset: 'fast',
      audio: true
    })

    const proxyCalls = execSyncMock.mock.calls
      .map((c) => String(c[0]))
      .filter((c) => c.includes('scale=-2:'))

    expect(proxyCalls.length).toBeGreaterThan(0)
    expect(proxyCalls[0]).toContain('scale=-2:240')
    expect(proxyCalls[0]).toContain('fps=24')
    expect(proxyCalls[0]).toContain('-cq 28')
    expect(proxyCalls[0]).toContain('-c:a aac')
  })
})
