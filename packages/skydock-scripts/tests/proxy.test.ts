// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildMissingProxies,
  ensureProxies,
  getProxyPath,
  needsProxy,
  resumeProxies,
  setProxyEncoder,
  statProxies
} from '../src/proxy'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifestAsync, saveManifest } from '../src/manifest'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, execSyncMock, fakeTools, tellTools, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

const manifestOf = (files: ManifestFile[]): Manifest => ({
  version: 1,
  createdAt: new Date().toISOString(),
  files,
  groups: []
})

const fileEntry = (filePath: string, id: string): ManifestFile => ({
  path: filePath,
  size: 1024,
  mtime: 1_754_000_000,
  filename: path.basename(filePath),
  id
})

describe('proxies', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    tellTools()
    outputDir = createTmpDir('skydock-proxy-')
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    setProxyEncoder(null)
  })

  it('is for clips, not pictures', () => {
    expect(needsProxy(fileEntry('/a/GX010023.MP4', 'v1'))).toBe(true)
    expect(needsProxy(fileEntry('/a/GOPR1100.JPG', 'p1'))).toBe(false)
  })

  it('names a proxy after what the clip is, not where it sits', () => {
    const proxy = getProxyPath(fileEntry('/anywhere/GX010023.MP4', 'abc123'), outputDir)
    expect(proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
  })

  it('makes a small copy of every clip and marks the clip as having one', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = await ensureProxies(manifest, outputDir)

    expect(report.built).toBe(1)
    expect(manifest.files[0].proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
    expect(fs.existsSync(manifest.files[0].proxy!)).toBe(true)
  })

  it('says as it happens that a proxy is being made, and what the clip plays once it lands', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind !== 'job' && heard.push(event))

    await ensureProxies(manifest, outputDir)
    stop()

    expect(heard).toEqual([
      { kind: 'file', work: 'proxy', fileId: 'abc123', percent: 0 },
      {
        kind: 'file-done',
        work: 'proxy',
        fileId: 'abc123',
        ok: true,
        proxy: {
          path: src,
          fact: { state: 'ready', play: path.join(outputDir, 'proxies', 'abc123.mp4') }
        }
      }
    ])
  })

  it('are finished by the next server, what was left half written cleared first', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    await saveManifest(
      path.join(outputDir, 'manifest.json'),
      manifestOf([fileEntry(src, 'abc123')])
    )
    const stale = writeTempFile(outputDir, 'proxies/abc123.mp4.part')
    globalThis.skydockProxiesResumed = undefined

    resumeProxies(outputDir)

    await expect
      .poll(() => fs.existsSync(path.join(outputDir, 'proxies', 'abc123.mp4')), { timeout: 10_000 })
      .toBe(true)
    expect(fs.existsSync(stale)).toBe(false)
  })

  it('are made again when they were taken from under a running server', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    await saveManifest(
      path.join(outputDir, 'manifest.json'),
      manifestOf([fileEntry(src, 'abc123')])
    )
    globalThis.skydockProxiesResumed = true

    resumeProxies(outputDir)

    await expect
      .poll(() => fs.existsSync(path.join(outputDir, 'proxies', 'abc123.mp4')), { timeout: 10_000 })
      .toBe(true)
  })

  it('clears what was left half written once per server, not each time a board connects', () => {
    const stale = writeTempFile(outputDir, 'proxies/abc123.mp4.part')
    globalThis.skydockProxiesResumed = true

    resumeProxies(outputDir)

    expect(fs.existsSync(stale)).toBe(true)
  })

  it('passes over a clip that already has one', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    await ensureProxies(manifest, outputDir)
    execSyncMock.mockClear()

    const again = await ensureProxies(manifest, outputDir)

    expect(again.built).toBe(0)
    expect(again.skipped).toBe(1)
    expect(execSyncMock.mock.calls.filter((c) => String(c[0]).startsWith('ffmpeg'))).toHaveLength(0)
  })

  it('leaves a clip that is already small alone, and says it is its own proxy', async () => {
    execSyncMock.mockImplementation(fakeTools({ width: 640 }))
    const src = writeTempFile(outputDir, 'original_files/small.mp4')
    const manifest = manifestOf([fileEntry(src, 'small1')])

    await ensureProxies(manifest, outputDir)

    expect(manifest.files[0].proxy).toBe(src)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'small1.mp4'))).toBe(false)
  })

  it('says the moment a clip is found to be its own proxy, so the board stops waiting for it', async () => {
    execSyncMock.mockImplementation(fakeTools({ width: 640 }))
    const src = writeTempFile(outputDir, 'original_files/small.mp4')
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind === 'file-done' && heard.push(event))

    await ensureProxies(manifestOf([fileEntry(src, 'small1')]), outputDir)
    stop()

    expect(heard).toEqual([
      {
        kind: 'file-done',
        work: 'proxy',
        fileId: 'small1',
        ok: true,
        proxy: { path: src, fact: { state: 'own', play: src } }
      }
    ])
  })

  it('does nothing and complains about nothing when the machine cannot encode video', async () => {
    tellTools(['ffmpeg', 'ffprobe', 'exiftool'])
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = await ensureProxies(manifest, outputDir)

    expect(report).toEqual({ built: 0, skipped: 0, failed: [] })
    expect(manifest.files[0].proxy).toBeUndefined()
  })

  it('says why a clip failed, not just that it did', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const failure = new Error('ffmpeg exited with code 1') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from('some noise about the input\nNo space left on device\n')
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = await ensureProxies(manifest, outputDir)

    expect(report.failed).toEqual(['GX010023.MP4'])
    expect(report.reason).toBe('No space left on device')
    expect(manifest.files[0].proxy).toBeUndefined()
  })

  it('tells the board a clip whose proxy failed, with the reason, until it is made', async () => {
    globalThis.skydockProxyFailures = undefined
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const failure = new Error('ffmpeg exited with code 1') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from('No space left on device\n')
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    await ensureProxies(manifest, outputDir)
    expect((await statProxies(manifest, outputDir))[src]).toMatchObject({
      state: 'none',
      reason: 'No space left on device'
    })

    execSyncMock.mockImplementation(fakeTools())
    await ensureProxies(manifest, outputDir)
    expect((await statProxies(manifest, outputDir))[src]).toMatchObject({ state: 'ready' })
    expect((await statProxies(manifest, outputDir))[src]?.reason).toBeUndefined()
  })

  it('says as it happens that a proxy could not be made, and why', async () => {
    globalThis.skydockProxyFailures = undefined
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const failure = new Error('ffmpeg exited with code 1') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from('No space left on device\n')
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind !== 'job' && heard.push(event))

    await ensureProxies(manifest, outputDir)
    stop()

    expect(heard.at(-1)).toEqual({
      kind: 'file-done',
      work: 'proxy',
      fileId: 'abc123',
      ok: false,
      proxy: { path: src, fact: { state: 'none', play: src, reason: 'No space left on device' } }
    })
  })

  it('leaves nothing behind when a build fails', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const out = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]).pop()!
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('half'))
      throw new Error('interrupted')
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    await ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)

    expect(fs.readdirSync(path.join(outputDir, 'proxies'))).toEqual([])
  })
})

describe('proxies stay out of what gets delivered', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-delivery-')
    execSyncMock.mockImplementation(fakeTools())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('keeps the proxies out of what is handed over', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    await ensureProxies(manifest, outputDir)

    expect(manifest.files[0].proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
    expect(fs.existsSync(path.join(outputDir, 'processed'))).toBe(false)
  })
})

describe('what the board is told about each proxy', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-facts-')
    execSyncMock.mockImplementation(fakeTools())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('marks a clip that has one, and says nothing about pictures', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123'), fileEntry('/a/GOPR1100.JPG', 'pic1')])
    await ensureProxies(manifest, outputDir)

    expect(await statProxies(manifest, outputDir)).toEqual({
      [src]: { state: 'ready', play: path.join(outputDir, 'proxies', 'abc123.mp4') }
    })
  })

  it('says why a clip whose original is not here has none, so it is not left waiting', async () => {
    const src = path.join(outputDir, 'original_files', 'GONE.MP4')
    const manifest = manifestOf([fileEntry(src, 'gone1')])

    expect((await statProxies(manifest, outputDir))[src]).toMatchObject({
      state: 'none',
      reason: 'The original is not on this machine'
    })
  })

  it('marks a clip that has none yet', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    expect(await statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'none', play: src } })
  })

  it('tells a clip that is its own proxy from one still waiting', async () => {
    execSyncMock.mockImplementation(fakeTools({ width: 640 }))
    const src = writeTempFile(outputDir, 'original_files/small.mp4')
    const manifest = manifestOf([fileEntry(src, 'small1')])
    await ensureProxies(manifest, outputDir)

    expect(await statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'own', play: src } })
  })

  it('says none once the folder has been emptied, whatever the record claims', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    await ensureProxies(manifest, outputDir)
    expect(manifest.files[0].proxy).toBeDefined()

    fs.rmSync(path.join(outputDir, 'proxies'), { recursive: true, force: true })

    expect(await statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'none', play: src } })
  })
})

describe('a build still in progress', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-progress-')
    execSyncMock.mockImplementation(fakeTools())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('plays a proxy that exists even though no record mentions it', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    const proxyPath = path.join(outputDir, 'proxies', 'abc123.mp4')
    fs.mkdirSync(path.dirname(proxyPath), { recursive: true })
    fs.writeFileSync(proxyPath, Buffer.from('proxy'))

    expect(manifest.files[0].proxy).toBeUndefined()
    expect((await statProxies(manifest, outputDir))[src]).toEqual({
      state: 'ready',
      play: proxyPath
    })
  })

  it('writes the record down as each one lands, not once at the end', async () => {
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const two = writeTempFile(outputDir, 'original_files/GX010024.MP4')
    const manifest = manifestOf([fileEntry(one, 'abc123'), fileEntry(two, 'def456')])

    const saves: number[] = []
    await ensureProxies(manifest, outputDir, undefined, () =>
      saves.push(manifest.files.filter((f) => f.proxy).length)
    )

    expect(saves).toEqual([1, 2])
  })
})

describe('what else happened while the proxies were being made', () => {
  let outputDir: string
  let manifestPath: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-meanwhile-')
    manifestPath = path.join(outputDir, 'manifest.json')
    execSyncMock.mockImplementation(fakeTools())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  const filesNow = async () => (await loadManifestAsync(manifestPath))!.files

  it('keeps a file that arrived after the pass read the manifest', async () => {
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const two = writeTempFile(outputDir, 'original_files/GX010024.MP4')
    await saveManifest(manifestPath, manifestOf([fileEntry(one, 'abc123')]))

    const pass = buildMissingProxies(outputDir)
    await saveManifest(
      manifestPath,
      manifestOf([fileEntry(one, 'abc123'), fileEntry(two, 'def456')])
    )
    await pass

    expect((await filesNow()).map((f) => f.id)).toEqual(['abc123', 'def456'])
  })

  it('makes the small copy of a file that arrived while it was busy', async () => {
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const two = writeTempFile(outputDir, 'original_files/GX010024.MP4')
    await saveManifest(manifestPath, manifestOf([fileEntry(one, 'abc123')]))

    const pass = buildMissingProxies(outputDir)
    await saveManifest(
      manifestPath,
      manifestOf([fileEntry(one, 'abc123'), fileEntry(two, 'def456')])
    )
    const report = await pass

    expect(report.built).toBe(2)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'def456.mp4'))).toBe(true)
    expect((await filesNow()).map((f) => f.proxy)).toEqual([
      path.join(outputDir, 'proxies', 'abc123.mp4'),
      path.join(outputDir, 'proxies', 'def456.mp4')
    ])
  })

  it('leaves alone what it knows nothing about', async () => {
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    await saveManifest(manifestPath, manifestOf([fileEntry(one, 'abc123')]))

    const pass = buildMissingProxies(outputDir)
    const meanwhile = manifestOf([{ ...fileEntry(one, 'abc123'), cropStart: 4, cropEnd: 9 }])
    meanwhile.groups = [
      { id: 'group_1', label: 'Jump 1', day: '2026-08-01', files: meanwhile.files }
    ]
    await saveManifest(manifestPath, meanwhile)
    await pass

    const saved = (await loadManifestAsync(manifestPath))!
    expect(saved.files[0]!.cropStart).toBe(4)
    expect(saved.groups.map((g) => g.id)).toEqual(['group_1'])
    expect(saved.files[0]!.proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
  })
})

describe('the graphics card or the processor', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = createTmpDir('skydock-proxy-encoder-')
    setProxyEncoder(null)
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
    delete process.env.SKYDOCK_PROXY_ENCODER
  })

  const ffmpegCalls = () =>
    execSyncMock.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('ffmpeg') && !l.includes('lavfi'))

  const runOne = async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    await ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)
    return ffmpegCalls()[0] ?? ''
  }

  it('takes the graphics card when it works', async () => {
    execSyncMock.mockImplementation(fakeTools())
    const cmd = await runOne()
    expect(cmd).toContain('h264_nvenc')
  })

  it('falls back to the processor when no card answers', async () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.includes('-f lavfi')) throw new Error('Device creation failed')
      return fakeTools()(cmd, opts)
    })
    const cmd = await runOne()
    expect(cmd).toContain('libx264')
    expect(cmd).not.toContain('-hwaccel')
  })

  it('can be told which one to use', async () => {
    process.env.SKYDOCK_PROXY_ENCODER = 'cpu'
    execSyncMock.mockImplementation(fakeTools())
    expect(await runOne()).toContain('libx264')
  })

  it('sizes a clip stored sideways by the edge that ends up across, on the card', async () => {
    execSyncMock.mockImplementation(fakeTools({ width: 1440, height: 2560, rotation: -90 }))
    expect(await runOne()).toContain('h=640')
  })

  it('sizes a clip stored the right way up by its width, on the card', async () => {
    execSyncMock.mockImplementation(fakeTools())
    expect(await runOne()).toContain('w=640')
  })

  it('sizes a clip stored sideways by the edge that ends up across, on the processor', async () => {
    setProxyEncoder('cpu')
    execSyncMock.mockImplementation(fakeTools({ width: 1440, height: 2560, rotation: -90 }))
    expect(await runOne()).toContain('scale=640:-2')
  })
})

describe('a clip whose proxy cannot be made says why', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = createTmpDir('skydock-proxy-why-')
    setProxyEncoder(null)
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('reports the cause, not the stage that starved because of it', async () => {
    setProxyEncoder('vaapi')
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe'))
        return opts?.encoding
          ? 'width=2704\nheight=1520\n'
          : Buffer.from('width=2704\nheight=1520\n')
      const failure = new Error('exit 251') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from(
        '[Parsed_scale_vaapi_0 @ 0x1] Failed to create processing pipeline config: 12 (the requested VAProfile is not supported).\n' +
          '[Parsed_scale_vaapi_0 @ 0x1] Failed to configure output pad on Parsed_scale_vaapi_0\n' +
          '[vf#0:0 @ 0x2] Task finished with error code: -5 (Input/output error)\n' +
          '[vost#0:0/h264_vaapi @ 0x3] Task finished with error code: -22 (Invalid argument)\n' +
          '[vost#0:0/h264_vaapi @ 0x3] Terminating thread with return code -22 (Invalid argument)\n'
      )
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX018633.MP4')
    const report = await ensureProxies(manifestOf([fileEntry(src, 'gx633')]), outputDir)
    expect(report.reason).toContain('VAProfile is not supported')
    expect(report.reason).not.toContain('-22')
  })

  it('names the reason a clip’s proxy could not be made', async () => {
    setProxyEncoder('cpu')
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('ffprobe'))
        return opts?.encoding
          ? 'width=3840\nheight=2160\n'
          : Buffer.from('width=3840\nheight=2160\n')
      const failure = new Error('exit 1') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from(
        '[h264_nvenc @ 0x1] InitializeEncoder failed: invalid param (8): Gop Length should be greater\n' +
          '[out#0/mp4 @ 0x2] Nothing was written into output file\n' +
          'Conversion failed!\n'
      )
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const report = await ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)

    expect(report.reason).toContain('Gop Length')
    expect(report.reason).not.toContain('Conversion failed')
  })
})
