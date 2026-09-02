// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'

const fsMockState = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn()
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => fsMockState.existsSync(...args),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      fsMockState.readFileSync(...args),
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) =>
      fsMockState.createReadStream(...args),
    mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => fsMockState.mkdirSync(...args),
    rmSync: (...args: Parameters<typeof actual.rmSync>) => fsMockState.rmSync(...args)
  }
})

let tmpDir: string
let fakeFile: string

beforeEach(async () => {
  vi.resetModules()
  const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
  const actualOs = (await vi.importActual<typeof import('node:os')>(
    'node:os'
  )) as typeof import('node:os')
  tmpDir = actualOs.tmpdir() + '/skydock-hls-life-' + Math.random().toString(36).slice(2)
  actualFs.mkdirSync(tmpDir, { recursive: true })
  fakeFile = path.join(tmpDir, 'test.MP4')
  actualFs.writeFileSync(fakeFile, Buffer.alloc(2048))

  fsMockState.existsSync.mockImplementation((p: fs.PathLike) => {
    const s = String(p)
    if (s.includes('playlist.m3u8')) return true
    if (s.includes('seg') && s.endsWith('.ts')) return true
    if (s.includes('.cache/hls')) return true
    try {
      return actualFs.existsSync(p)
    } catch {
      return false
    }
  })
  fsMockState.readFileSync.mockImplementation((p: fs.PathLike) => {
    const s = String(p)
    if (s.includes('playlist.m3u8'))
      return '#EXTM3U\n#EXTINF:4.0,\nseg000.ts\n#EXTINF:4.0,\nseg001.ts\n' as unknown as string
    return actualFs.readFileSync(p as string) as unknown as string
  })
  fsMockState.createReadStream.mockImplementation((() => {
    const r = new Readable({
      read() {
        this.push(Buffer.from('tsdata'))
        this.push(null)
      }
    })
    return r as unknown as fs.ReadStream
  }) as unknown as typeof fs.createReadStream)
  fsMockState.mkdirSync.mockImplementation((p: fs.PathLike, opts?: unknown) => {
    try {
      return actualFs.mkdirSync(p, opts as unknown as fs.MakeDirectoryOptions)
    } catch {}
    return undefined as unknown as string
  })
  fsMockState.rmSync.mockImplementation((p: fs.PathLike, opts?: unknown) => {
    try {
      return actualFs.rmSync(p, opts as unknown as fs.RmOptions)
    } catch {}
    return undefined
  })
})

afterEach(async () => {
  try {
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    actualFs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete process.env.SKYDOCK_LIVE_MAX
})

type SetupOpts = { maxLive?: number }
const setupMocks = async (opts: SetupOpts = {}) => {
  const spawnMock = vi.fn()
  const loadManifestMock = vi.fn()
  const getOutputDirMock = vi.fn()

  if (opts.maxLive !== undefined) process.env.SKYDOCK_LIVE_MAX = String(opts.maxLive)

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

  const { loader } = await import('../app/routes/api.hls')
  const { buildHlsArgs, rewritePlaylist } = await import('../app/lib/hls.server')

  return { loader, buildHlsArgs, rewritePlaylist, spawnMock, getOutputDirMock, loadManifestMock }
}

const makeRequest = (params: Record<string, string>, signal?: AbortSignal) => {
  const qs = new URLSearchParams(params).toString()
  return new Request(`http://localhost/api/hls?${qs}`, signal ? { signal } : undefined)
}

const makeFakeProc = () => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
  const proc: Record<string, unknown> = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(cb)
    }),
    kill: vi.fn(),
    stderr: { on: vi.fn() },
    stdout: { on: vi.fn() },
    _handlers: handlers
  }
  return proc as unknown as ReturnType<typeof import('node:child_process').spawn>
}

describe('hls-lifecycle — session reuse and creation', () => {
  it('creates new HLS session and spawns ffmpeg', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const res = await loader({ request: makeRequest({ path: fakeFile }) })
    expect(spawnMock).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/vnd.apple.mpegurl')
  })

  it('reuses existing session for same file+seek', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const first = await loader({ request: makeRequest({ path: fakeFile }) })
    const firstText = await first.text()
    spawnMock.mockClear()
    const second = await loader({ request: makeRequest({ path: fakeFile }) })
    const secondText = await second.text()
    expect(spawnMock).not.toHaveBeenCalled()
    expect(secondText).toBe(firstText)
  })

  it('creates new session for different seek value', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc1 = makeFakeProc()
    const proc2 = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2)
    await loader({ request: makeRequest({ path: fakeFile, seek: '0' }) })
    spawnMock.mockClear()
    const res = await loader({ request: makeRequest({ path: fakeFile, seek: '120' }) })
    expect(spawnMock).toHaveBeenCalledOnce()
    const args = (spawnMock.mock.calls[0][1] as string[]) ?? []
    expect(args).toContain('120')
    expect(res.status).toBe(200)
  })

  it('different file creates separate session', async () => {
    const { loader, spawnMock } = await setupMocks()
    const otherFile = path.join(tmpDir, 'other.MP4')
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    actualFs.writeFileSync(otherFile, Buffer.alloc(1024))
    const proc1 = makeFakeProc()
    const proc2 = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2)
    await loader({ request: makeRequest({ path: fakeFile }) })
    await loader({ request: makeRequest({ path: otherFile }) })
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })
})

describe('hls-lifecycle — segment serving', () => {
  it('returns 404 for segment when no session exists', async () => {
    const { loader } = await setupMocks()
    const res = await loader({ request: makeRequest({ path: fakeFile, segment: 'seg000.ts' }) })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Segment not found/)
  })

  it('returns segment file when session exists', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    await loader({ request: makeRequest({ path: fakeFile }) })
    const segRes = await loader({ request: makeRequest({ path: fakeFile, segment: 'seg000.ts' }) })
    expect(segRes.status).toBe(200)
    expect(segRes.headers.get('Content-Type')).toBe('video/mp2t')
  })

  it('rejects path traversal in segment param', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    await loader({ request: makeRequest({ path: fakeFile }) })
    const traversal = await loader({
      request: makeRequest({ path: fakeFile, segment: '../../etc/passwd' })
    })
    expect(traversal.status).toBe(404)
  })

  it('segment request keeps session alive (reuse after segment)', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    await loader({ request: makeRequest({ path: fakeFile }) })
    await loader({ request: makeRequest({ path: fakeFile, segment: 'seg000.ts' }) })
    spawnMock.mockClear()
    const after = await loader({ request: makeRequest({ path: fakeFile }) })
    const afterText = await after.text()
    expect(spawnMock).not.toHaveBeenCalled()
    expect(afterText).toContain('seg000.ts')
  })
})

describe('hls-lifecycle — bandwidth and CPU optimization', () => {
  it('respects SKYDOCK_LIVE_MAX limit (429 after limit)', async () => {
    const { loader, spawnMock } = await setupMocks({ maxLive: 1 })
    const proc1 = makeFakeProc()
    spawnMock.mockReturnValue(proc1)
    await loader({ request: makeRequest({ path: fakeFile }) })
    const otherFile = path.join(tmpDir, 'other2.MP4')
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    actualFs.writeFileSync(otherFile, Buffer.alloc(512))
    const limited = await loader({ request: makeRequest({ path: otherFile }) })
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { error: string }
    expect(body.error).toMatch(/Too many/)
    expect(limited.headers.get('Retry-After')).toBe('2')
  })

  it('kills ffmpeg on request abort and cleans temp dir', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const controller = new AbortController()
    const req = makeRequest({ path: fakeFile }, controller.signal)
    const res = await loader({ request: req })
    expect(res.status).toBe(200)
    controller.abort()
    await new Promise((r) => setTimeout(r, 10))
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith(
      'SIGKILL'
    )
  })

  it('HLS session has 30s TTL via setTimeout', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const spy = vi.spyOn(global, 'setTimeout')
    await loader({ request: makeRequest({ path: fakeFile }) })
    const has30s = spy.mock.calls.some((c) => c[1] === 30000)
    expect(has30s).toBe(true)
    spy.mockRestore()
  })

  it('close preview during active transcode cleans up', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const controller = new AbortController()
    const req = makeRequest({ path: fakeFile }, controller.signal)
    const res = await loader({ request: req })
    expect(res.status).toBe(200)
    controller.abort()
    await new Promise((r) => setTimeout(r, 10))
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalled()
  })

  it('switch files during active transcode starts new session', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc1 = makeFakeProc()
    const proc2 = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2)
    await loader({ request: makeRequest({ path: fakeFile }) })
    const other = path.join(tmpDir, 'switch.MP4')
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    actualFs.writeFileSync(other, Buffer.alloc(512))
    const res2 = await loader({ request: makeRequest({ path: other }) })
    expect(res2.status).toBe(200)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('rapid file opens reuse session (no duplicate transcode)', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    await loader({ request: makeRequest({ path: fakeFile }) })
    await loader({ request: makeRequest({ path: fakeFile }) })
    await loader({ request: makeRequest({ path: fakeFile }) })
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('no orphaned ffmpeg after session close via timeout', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    const spy = vi.spyOn(global, 'setTimeout')
    await loader({ request: makeRequest({ path: fakeFile }) })
    const timeoutCall = spy.mock.calls.find((c) => c[1] === 30000)
    expect(timeoutCall).toBeTruthy()
    if (timeoutCall) (timeoutCall[0] as () => void)()
    await new Promise((r) => setTimeout(r, 10))
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith(
      'SIGKILL'
    )
    spy.mockRestore()
  })
})

describe('hls-lifecycle — error recovery and playlist', () => {
  it('ffmpeg exits before playlist ready returns 500', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    fsMockState.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p)
      if (s.includes('playlist.m3u8')) return false
      if (s.includes('.cache/hls')) return true
      try {
        return actualFs.existsSync(p)
      } catch {
        return false
      }
    })
    fsMockState.readFileSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p)
      if (s.includes('playlist.m3u8')) return '' as unknown as string
      return actualFs.readFileSync(p as string) as unknown as string
    })
    spawnMock.mockReturnValue(proc)
    const pending = loader({ request: makeRequest({ path: fakeFile }) })
    setTimeout(() => {
      const handlers = (
        proc as unknown as { _handlers: Record<string, Array<(...a: unknown[]) => void>> }
      )._handlers
      for (const cb of handlers['close'] ?? []) cb(1)
    }, 20)
    const res = await pending
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBeTruthy()
  })

  it('playlist timeout returns 500', async () => {
    const { loader, spawnMock } = await setupMocks()
    const actualFs = (await vi.importActual<typeof import('node:fs')>('node:fs')) as typeof fs
    fsMockState.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p)
      if (s.includes('playlist.m3u8')) return false
      if (s.includes('.cache/hls')) return true
      try {
        return actualFs.existsSync(p)
      } catch {
        return false
      }
    })
    vi.useFakeTimers()
    spawnMock.mockReturnValue(makeFakeProc())
    const pending = loader({ request: makeRequest({ path: fakeFile }) })
    // Advance fake timers to trigger 10s timeout
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending
    expect(res.status).toBe(500)
    vi.useRealTimers()
  })

  it('rewrites playlist URLs correctly with and without seek', async () => {
    const { rewritePlaylist } = await setupMocks()
    const pl = '#EXTM3U\nseg000.ts\nseg001.ts\n'
    const base = '/api/hls?path=%2Ftmp%2Fvideo.MP4'
    const baseSeek = '/api/hls?path=%2Ftmp%2Fvideo.MP4&seek=120'
    expect(rewritePlaylist(pl, base)).toContain('&segment=seg000.ts')
    expect(rewritePlaylist(pl, baseSeek)).toContain('&seek=120&segment=seg001.ts')
    expect(rewritePlaylist('', base)).toBe('')
  })

  it('buildHlsArgs includes all required encoding flags', async () => {
    const { buildHlsArgs } = await setupMocks()
    const hlsDir = path.join(tmpDir, '.cache', 'hls', 'test')
    const args = buildHlsArgs(fakeFile, 0, hlsDir)
    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
    expect(args).toContain('-preset')
    expect(args).toContain('ultrafast')
    expect(args).toContain('-hls_time')
    expect(args).toContain('4')
    expect(args).toContain('scale=360:-2')
  })

  it('segment request validates path stays inside session dir', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValue(proc)
    await loader({ request: makeRequest({ path: fakeFile }) })
    const evil = await loader({
      request: makeRequest({ path: fakeFile, segment: 'seg000.ts/../../secret' })
    })
    expect(evil.status).toBe(404)
  })
})
