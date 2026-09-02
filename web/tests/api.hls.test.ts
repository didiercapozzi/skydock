// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let tmpDir: string
let fakeFile: string

beforeEach(async () => {
  vi.resetModules()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-hls-test-'))
  fakeFile = path.join(tmpDir, 'test.MP4')
  fs.writeFileSync(fakeFile, Buffer.alloc(1024))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const setupMocks = async () => {
  const spawnMock = vi.fn()
  const loadManifestMock = vi.fn()
  const getOutputDirMock = vi.fn()

  vi.doMock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process')>()
    return { ...actual, spawn: spawnMock }
  })

  vi.doMock('@skydock/scripts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@skydock/scripts')>()
    return { ...actual, loadManifest: loadManifestMock, getOutputDir: getOutputDirMock }
  })

  getOutputDirMock.mockReturnValue(tmpDir)
  loadManifestMock.mockReturnValue(null)

  const { loader, buildHlsArgs, rewritePlaylist } = await import('../app/routes/api.hls')

  return { loader, buildHlsArgs, rewritePlaylist, spawnMock, getOutputDirMock }
}

const makeRequest = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString()
  return new Request(`http://localhost/api/hls?${qs}`)
}

describe('api.hls — buildHlsArgs', () => {
  it('includes HLS output format args', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    expect(args).toContain('-f')
    expect(args).toContain('hls')
    expect(args).toContain('-hls_time')
    expect(args).toContain('4')
    expect(args).toContain('-hls_list_size')
    expect(args).toContain('0')
  })

  it('includes standard encoding args', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
    expect(args).toContain('-preset')
    expect(args).toContain('ultrafast')
    expect(args).toContain('-tune')
    expect(args).toContain('zerolatency')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
  })

  it('passes -ss when seek > 0', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 120, hlsDir)

    expect(args).toContain('-ss')
    expect(args).toContain('120')
  })

  it('does not pass -ss when seek is 0', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    const ssIndex = args.indexOf('-ss')
    if (ssIndex !== -1) {
      expect(args[ssIndex + 1]).not.toBe('0')
    }
  })

  it('scales to 360 width', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    expect(args).toContain('-vf')
    expect(args).toContain('scale=360:-2')
  })

  it('sets segment filename in hlsDir', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    expect(args).toContain('-hls_segment_filename')
    const segIdx = args.indexOf('-hls_segment_filename')
    expect(args[segIdx + 1]).toContain(hlsDir)
    expect(args[segIdx + 1]).toContain('seg%03d.ts')
  })

  it('outputs playlist to hlsDir', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)

    const lastArg = args[args.length - 1]
    expect(lastArg).toBe(path.join(hlsDir, 'playlist.m3u8'))
  })
})

describe('api.hls — file validation', () => {
  it('returns 400 when path is missing', async () => {
    const { loader } = await setupMocks()
    const response = await loader({ request: makeRequest({}) })
    expect(response.status).toBe(400)
  })

  it('returns 404 when file does not exist', async () => {
    const { loader } = await setupMocks()
    const response = await loader({ request: makeRequest({ path: '/nonexistent/file.mp4' }) })
    expect(response.status).toBe(404)
  })
})

describe('api.hls — segment serving', () => {
  it('returns 404 for missing segment when no session exists', async () => {
    const { loader } = await setupMocks()

    const response = await loader({
      request: makeRequest({ path: fakeFile, segment: 'seg000.ts' })
    })

    expect(response.status).toBe(404)
  })
})

describe('api.hls — rewritePlaylist', () => {
  it('rewrites segXXX.ts references to absolute URLs', async () => {
    const { rewritePlaylist } = await setupMocks()
    const playlist =
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.000000,\nseg000.ts\n#EXTINF:4.000000,\nseg001.ts\n'
    const baseUrl = '/api/hls?path=%2Ftest%2Fvideo.MP4'

    const result = rewritePlaylist(playlist, baseUrl)

    expect(result).toContain('/api/hls?path=%2Ftest%2Fvideo.MP4&segment=seg000.ts')
    expect(result).toContain('/api/hls?path=%2Ftest%2Fvideo.MP4&segment=seg001.ts')
    expect(result).not.toContain('\nseg000.ts\n')
    expect(result).not.toContain('\nseg001.ts\n')
  })

  it('preserves non-segment lines unchanged', async () => {
    const { rewritePlaylist } = await setupMocks()
    const playlist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.000000,\nseg000.ts\n'
    const baseUrl = '/api/hls?path=test'

    const result = rewritePlaylist(playlist, baseUrl)

    expect(result).toContain('#EXTM3U')
    expect(result).toContain('#EXT-X-VERSION:3')
    expect(result).toContain('#EXTINF:4.000000,')
  })

  it('handles playlist with seek param in base URL', async () => {
    const { rewritePlaylist } = await setupMocks()
    const playlist = '#EXTM3U\n#EXTINF:4.000000,\nseg000.ts\n'
    const baseUrl = '/api/hls?path=%2Ftest%2Fvideo.MP4&seek=120'

    const result = rewritePlaylist(playlist, baseUrl)

    expect(result).toContain('/api/hls?path=%2Ftest%2Fvideo.MP4&seek=120&segment=seg000.ts')
  })

  it('handles empty playlist', async () => {
    const { rewritePlaylist } = await setupMocks()
    const result = rewritePlaylist('', '/api/hls?path=test')
    expect(result).toBe('')
  })

  it('handles playlist with no segments', async () => {
    const { rewritePlaylist } = await setupMocks()
    const playlist = '#EXTM3U\n#EXT-X-ENDLIST\n'
    const result = rewritePlaylist(playlist, '/api/hls?path=test')
    expect(result).toBe('#EXTM3U\n#EXT-X-ENDLIST\n')
  })
})
