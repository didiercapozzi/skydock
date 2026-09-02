// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let tmpDir: string
let fakeFile: string

beforeEach(async () => {
  vi.resetModules()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-stream-test-'))
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

  const { loader } = await import('../app/routes/api.stream')

  return { loader, spawnMock }
}

const makeFakeProc = () => {
  const handlers: Record<string, (...args: unknown[]) => void> = {}
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb
    }),
    kill: vi.fn(),
    _handlers: handlers
  }
}

const makeRequest = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString()
  return new Request(`http://localhost/api/stream?${qs}`)
}

const getSpawnArgs = (spawnMock: ReturnType<typeof vi.fn>): string[] => {
  const call = spawnMock.mock.calls[0]
  return (call?.[1] as string[]) ?? []
}

describe('api.stream — seek parameter', () => {
  it('passes -ss to ffmpeg when seek > 0', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: '120' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-ss')
    expect(args).toContain('120')
  })

  it('does not pass -ss when seek is 0', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: '0' }) })

    const args = getSpawnArgs(spawnMock)
    const ssIndex = args.indexOf('-ss')
    if (ssIndex !== -1) {
      expect(args[ssIndex + 1]).not.toBe('0')
    }
  })

  it('does not pass -ss when seek is not provided', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).not.toContain('-ss')
  })

  it('does not pass -ss when seek is NaN', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: 'abc' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).not.toContain('-ss')
  })

  it('does not pass -ss when seek is negative', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: '-5' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).not.toContain('-ss')
  })

  it('does not pass -ss when seek is Infinity', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: 'Infinity' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).not.toContain('-ss')
  })
})

describe('api.stream — seek + width', () => {
  it('passes both -ss and scale filter together', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, seek: '60', w: '480' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-ss')
    expect(args).toContain('60')
    expect(args).toContain('-vf')
    expect(args).toContain('scale=480:-2')
  })
})

describe('api.stream — thumb mode', () => {
  it('does not use seek param in thumb mode (uses t param instead)', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, thumb: '1', seek: '120', t: '1' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-ss')
    expect(args).toContain('1')
    expect(args).not.toContain('120')
  })
})

describe('api.stream — file validation', () => {
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

describe('api.stream — ffmpeg args', () => {
  it('includes standard encoding args', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
    expect(args).toContain('-preset')
    expect(args).toContain('ultrafast')
    expect(args).toContain('-tune')
    expect(args).toContain('zerolatency')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
    expect(args).toContain('-f')
    expect(args).toContain('mp4')
  })

  it('scale filter uses requested width', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, w: '480' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-vf')
    expect(args).toContain('scale=480:-2')
  })

  it('defaults to 360 width when w is not provided', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-vf')
    expect(args).toContain('scale=360:-2')
  })

  it('clamps width to max 720', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, w: '1080' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-vf')
    expect(args).toContain('scale=720:-2')
  })

  it('clamps width to min 16', async () => {
    const { loader, spawnMock } = await setupMocks()
    const proc = makeFakeProc()
    spawnMock.mockReturnValueOnce(proc)

    await loader({ request: makeRequest({ path: fakeFile, w: '5' }) })

    const args = getSpawnArgs(spawnMock)
    expect(args).toContain('-vf')
    expect(args).toContain('scale=16:-2')
  })
})
