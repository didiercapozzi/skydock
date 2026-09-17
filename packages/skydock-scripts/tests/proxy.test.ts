// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ensureProxies,
  getCutProxyDir,
  getProxyPath,
  needsProxy,
  proxyCounts,
  setProxyEncoder,
  statProxies
} from '../src/proxy'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, execSyncMock, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

const CONTAINERS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])

/* ffmpeg refuses before encoding a frame when it cannot tell what container to write, and it tells
   from the output's extension unless `-f` says otherwise. A fake that writes whatever it is asked
   to hides that, which is exactly how every proxy on a real card came to fail while every test
   passed: the temporary name ends in `.part`, and nothing named the format. */
const ffmpegWouldRefuse = (line: string, out: string) => {
  if (/(^|\s)-f\s+\w+/.test(line)) return null
  const extension = out.split('.').pop()?.toLowerCase() ?? ''
  return CONTAINERS.has(extension)
    ? null
    : `Unable to choose an output format for '${out}'; use a standard extension for the filename or specify the format manually.`
}

/* ffmpeg present, ffprobe reporting a 4K clip, and a transcode that writes what it was asked to
   write — enough to exercise everything without an encoder in the image. */
const toolsPresent =
  (width = 3840, turned = false) =>
  (cmd: string | Buffer, opts?: { encoding?: string }) => {
    const line = String(cmd)
    if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
    if (line.startsWith('ffprobe')) {
      /* a turned clip is stored the other way round, as a phone or a 360 camera writes it */
      const shape = turned
        ? `width=1440\nheight=${width}\nrotation=-90\n`
        : `width=${width}\nheight=1080\n`
      return opts?.encoding ? shape : Buffer.from(shape)
    }
    if (line.startsWith('ffmpeg')) {
      /* the last quoted path on the line is the output */
      const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1])
      const out = quoted[quoted.length - 1]
      if (!out) return Buffer.from('')
      const refusal = ffmpegWouldRefuse(line, out)
      if (refusal !== null) {
        const failure = new Error('ffmpeg exited with code 234') as Error & { stderr: Buffer }
        failure.stderr = Buffer.from(`${refusal}\nError opening output file ${out}.\n`)
        throw failure
      }
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('proxy'))
      return Buffer.from('')
    }
    return Buffer.from('')
  }

const noTools = (cmd: string | Buffer) => {
  if (String(cmd).startsWith('command -v')) throw new Error('command not found')
  return Buffer.from('')
}

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
    outputDir = createTmpDir('skydock-proxy-')
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('is for clips, not pictures', () => {
    expect(needsProxy(fileEntry('/a/GX010023.MP4', 'v1'))).toBe(true)
    expect(needsProxy(fileEntry('/a/GOPR1100.JPG', 'p1'))).toBe(false)
  })

  /* Keyed by content, so the same clip copied off the same card twice is one proxy and moving a
     file does not orphan the one it already has. */
  it('names a proxy after what the clip is, not where it sits', () => {
    const proxy = getProxyPath(fileEntry('/anywhere/GX010023.MP4', 'abc123'), outputDir)
    expect(proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
  })

  it('builds one per clip and records it on the file', () => {
    execSyncMock.mockImplementation(toolsPresent())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = ensureProxies(manifest, outputDir)

    expect(report.built).toBe(1)
    expect(manifest.files[0].proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
    expect(fs.existsSync(manifest.files[0].proxy!)).toBe(true)
  })

  /* The expensive half of this must not be paid twice — a second scan over a card that is already
     proxied should cost nothing. */
  it('passes over a clip that already has one', () => {
    execSyncMock.mockImplementation(toolsPresent())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    ensureProxies(manifest, outputDir)
    execSyncMock.mockClear()

    const again = ensureProxies(manifest, outputDir)

    expect(again.built).toBe(0)
    expect(again.skipped).toBe(1)
    expect(execSyncMock.mock.calls.filter((c) => String(c[0]).startsWith('ffmpeg'))).toHaveLength(0)
  })

  /* Scaling up is not a proxy. A clip already smaller than the threshold is its own. */
  it('leaves a clip that is already small alone, and says it is its own proxy', () => {
    execSyncMock.mockImplementation(toolsPresent(640))
    const src = writeTempFile(outputDir, 'original_files/small.mp4')
    const manifest = manifestOf([fileEntry(src, 'small1')])

    ensureProxies(manifest, outputDir)

    expect(manifest.files[0].proxy).toBe(src)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'small1.mp4'))).toBe(false)
  })

  /* No encoder is not a broken card: everything else still works, and the crop bar falls back to
     the clip itself. */
  it('does nothing and complains about nothing when there is no ffmpeg', () => {
    execSyncMock.mockImplementation(noTools)
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = ensureProxies(manifest, outputDir)

    expect(report).toEqual({ built: 0, skipped: 0, failed: [] })
    expect(manifest.files[0].proxy).toBeUndefined()
  })

  /* Every clip on the first real card failed, and all the app could say was which ones. The reason
     was discarded three times over on the way out — stderr to /dev/null, stdio ignored, the error
     swallowed — so the only way to find it was to run ffmpeg by hand. */
  it('says why a clip failed, not just that it did', () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const failure = new Error('ffmpeg exited with code 1') as Error & { stderr: Buffer }
      failure.stderr = Buffer.from('some noise about the input\nNo space left on device\n')
      throw failure
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    const report = ensureProxies(manifest, outputDir)

    expect(report.failed).toEqual(['GX010023.MP4'])
    expect(report.reason).toBe('No space left on device')
    expect(manifest.files[0].proxy).toBeUndefined()
  })

  /* a half-written proxy that looks finished would be skipped forever after */
  it('leaves nothing behind when a build fails', () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
      if (line.startsWith('ffprobe')) return opts?.encoding ? '3840\n' : Buffer.from('3840\n')
      const out = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]).pop()!
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('half'))
      throw new Error('interrupted')
    })
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)

    expect(fs.readdirSync(path.join(outputDir, 'proxies'))).toEqual([])
  })

  it('counts how far along a card is', () => {
    execSyncMock.mockImplementation(toolsPresent())
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const two = writeTempFile(outputDir, 'original_files/GX010024.MP4')
    const manifest = manifestOf([
      fileEntry(one, 'abc123'),
      fileEntry(two, 'def456'),
      fileEntry('/a/GOPR1100.JPG', 'pic1')
    ])

    expect(proxyCounts(manifest, outputDir)).toEqual({ ready: 0, total: 2 })
    ensureProxies(manifest, outputDir)
    expect(proxyCounts(manifest, outputDir)).toEqual({ ready: 2, total: 2 })
  })
})

/* A passenger's folder is walked whole when it is uploaded, so anything left in there goes to the
   storage. Proxies are working files and must never be among them — this is the guarantee, not an
   implementation detail, so it is pinned here rather than left to whoever next moves a path. */
describe('proxies stay out of what gets delivered', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-delivery-')
    execSyncMock.mockImplementation(toolsPresent())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('writes a jump\u2019s cut proxies under the output folder, not beside the copies', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    ensureProxies(manifest, outputDir)
    const file = manifest.files[0]

    const cut = path.join(getCutProxyDir(outputDir, 'group_1'), 'luc_favre_20260829_113015.mp4')
    fs.mkdirSync(path.dirname(cut), { recursive: true })
    fs.copyFileSync(file.proxy!, cut)

    expect(cut.startsWith(path.join(outputDir, 'proxies'))).toBe(true)
    expect(cut).not.toContain(path.join('processed', 'Tandems'))
  })

  /* the import proxies live under their own folder too, which no scan and no upload ever reads */
  it('keeps the imported ones out of processed entirely', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    ensureProxies(manifest, outputDir)

    expect(manifest.files[0].proxy).toBe(path.join(outputDir, 'proxies', 'abc123.mp4'))
    expect(fs.existsSync(path.join(outputDir, 'processed'))).toBe(false)
  })
})

/* The board marks each clip with whether its small copy exists. Read off the disk, not off the
   record: `file.proxy` is what the last pass wrote, so emptying the folder would leave every file
   still claiming one — and the flag would say the opposite of the truth. */
describe('what the board is told about each proxy', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-facts-')
    execSyncMock.mockImplementation(toolsPresent())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('marks a clip that has one, and says nothing about pictures', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123'), fileEntry('/a/GOPR1100.JPG', 'pic1')])
    ensureProxies(manifest, outputDir)

    expect(statProxies(manifest, outputDir)).toEqual({
      [src]: { state: 'ready', play: path.join(outputDir, 'proxies', 'abc123.mp4') }
    })
  })

  it('marks a clip that has none yet', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])

    /* and the clip itself is what plays meanwhile — that is the fallback, not a missing value */
    expect(statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'none', play: src } })
  })

  it('tells a clip that is its own proxy from one still waiting', () => {
    execSyncMock.mockImplementation(toolsPresent(640))
    const src = writeTempFile(outputDir, 'original_files/small.mp4')
    const manifest = manifestOf([fileEntry(src, 'small1')])
    ensureProxies(manifest, outputDir)

    expect(statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'own', play: src } })
  })

  /* the record outliving the file is exactly the case a flag has to survive */
  it('says none once the folder has been emptied, whatever the record claims', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    ensureProxies(manifest, outputDir)
    expect(manifest.files[0].proxy).toBeDefined()

    fs.rmSync(path.join(outputDir, 'proxies'), { recursive: true, force: true })

    expect(statProxies(manifest, outputDir)).toEqual({ [src]: { state: 'none', play: src } })
  })
})

/* The case that actually happened: a scan from the terminal spent twenty minutes building proxies,
   and because the record was only written when the whole pass finished, twenty finished copies sat
   on disk that nothing knew about. The crop bar dragged 4K originals through the browser the whole
   time, and the only visible symptom was that scrubbing was laggy. */
describe('a build still in progress', () => {
  let outputDir: string

  beforeEach(() => {
    setProxyEncoder('cpu')
    outputDir = createTmpDir('skydock-proxy-progress-')
    execSyncMock.mockImplementation(toolsPresent())
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  it('plays a proxy that exists even though no record mentions it', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([fileEntry(src, 'abc123')])
    /* built by somebody else's pass, which has not saved anything yet */
    const proxyPath = path.join(outputDir, 'proxies', 'abc123.mp4')
    fs.mkdirSync(path.dirname(proxyPath), { recursive: true })
    fs.writeFileSync(proxyPath, Buffer.from('proxy'))

    expect(manifest.files[0].proxy).toBeUndefined()
    expect(statProxies(manifest, outputDir)[src]).toEqual({ state: 'ready', play: proxyPath })
  })

  it('writes the record down as each one lands, not once at the end', () => {
    const one = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const two = writeTempFile(outputDir, 'original_files/GX010024.MP4')
    const manifest = manifestOf([fileEntry(one, 'abc123'), fileEntry(two, 'def456')])

    const saves: number[] = []
    ensureProxies(manifest, outputDir, undefined, () =>
      saves.push(manifest.files.filter((f) => f.proxy).length)
    )

    /* once per clip, each time with that clip already recorded */
    expect(saves).toEqual([1, 2])
  })
})

/* Decoding is the expensive half — a card of 4K HEVC clips spends its time unpacking them — so the
   graphics card has to do the decode, not just the encode. Being listed by ffmpeg is not the same
   as working: NVENC is compiled in and then fails at "device creation" when the driver libraries
   are missing, which is the state a container is in until it is given them. */
describe('which encoder gets used', () => {
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

  /* the commands a pass actually ran, so what it asked the machine to do is visible */
  const ffmpegCalls = () =>
    execSyncMock.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('ffmpeg -y'))

  const runOne = () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)
    return ffmpegCalls()[0] ?? ''
  }

  it('takes the graphics card when it works, and decodes on it too', () => {
    execSyncMock.mockImplementation(toolsPresent())
    const cmd = runOne()
    expect(cmd).toContain('h264_nvenc')
    expect(cmd).toContain('-hwaccel cuda')
  })

  it('falls back to the processor when no card answers', () => {
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      /* the probe of nothing fails for every card, as it does with no driver libraries */
      if (line.includes('-f lavfi')) throw new Error('Device creation failed')
      return toolsPresent()(cmd, opts)
    })
    const cmd = runOne()
    expect(cmd).toContain('libx264')
    expect(cmd).not.toContain('-hwaccel')
  })

  it('can be told which one to use', () => {
    process.env.SKYDOCK_PROXY_ENCODER = 'cpu'
    execSyncMock.mockImplementation(toolsPresent())
    expect(runOne()).toContain('libx264')
  })

  /* A 360 camera stores its frames sideways and notes the turn beside them. The processor is handed
     frames already turned the right way up; a card is not. Shrinking the wrong edge made every one
     of those clips come out three times the size it was asked for. */
  it('shrinks the edge that ends up across, on a clip stored sideways', () => {
    execSyncMock.mockImplementation(toolsPresent(2560, true))
    expect(runOne()).toContain('h=640')
  })

  it('shrinks the width on a clip stored the right way up', () => {
    execSyncMock.mockImplementation(toolsPresent(3840, false))
    expect(runOne()).toContain('w=640')
  })

  /* the processor path has not changed: ffmpeg turns the frame first, so width is the whole of it */
  it('leaves the processor path asking for a 640-wide frame', () => {
    setProxyEncoder('cpu')
    execSyncMock.mockImplementation(toolsPresent(2560, true))
    expect(runOne()).toContain('scale=640:-2')
  })
})

/* Two things the graphics cards taught us the hard way, both of which look like details and both
   of which stopped every clip on a real card from building. */
describe('the settings the cards insist on', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = createTmpDir('skydock-proxy-args-')
    setProxyEncoder(null)
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    setProxyEncoder(null)
  })

  /* a clip of its own each time, or the second call finds the first one's proxy already there and
     builds nothing — and the command asserted on would be the previous encoder's */
  const commandFor = (encoder: 'nvenc' | 'vaapi' | 'cpu') => {
    setProxyEncoder(encoder)
    execSyncMock.mockClear()
    execSyncMock.mockImplementation(toolsPresent())
    const src = writeTempFile(outputDir, `original_files/${encoder}.MP4`)
    ensureProxies(manifestOf([fileEntry(src, `id-${encoder}`)]), outputDir)
    return (
      execSyncMock.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('ffmpeg -y')) ?? ''
    )
  }

  /* NVENC refuses `-g 1` outright without this — "Gop Length should be greater than number of B
     frames + 1" — and `-g 2` gives every other frame, which will not cut with a copy. */
  it('asks NVENC for the mode that lets every frame be a keyframe', () => {
    const cmd = commandFor('nvenc')
    expect(cmd).toContain('-tune ull')
    expect(cmd).toContain('-g 1')
  })

  /* naming a pixel format makes ffmpeg insert a conversion it cannot link to the card's memory:
     "impossible to convert between the formats supported by the filter" */
  it('never names a pixel format on a hardware path', () => {
    expect(commandFor('nvenc')).not.toContain('-pix_fmt')
    expect(commandFor('vaapi')).not.toContain('-pix_fmt')
    expect(commandFor('cpu')).toContain('-pix_fmt')
  })

  /* A trial that leaves the real settings out proves only that the encoder exists. NVENC passed
     exactly such a trial and then refused every clip, because `-g 1` is what it objected to. */
  it('tries the encoder with the settings it will really be given', () => {
    setProxyEncoder(null)
    execSyncMock.mockImplementation(toolsPresent())
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)
    const trial = execSyncMock.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('-f lavfi'))
    expect(trial).toContain('-g 1')
    expect(trial).toContain('-bf 0')
  })

  /* "Conversion failed!" says only that it did; the diagnosis is the line above it */
  it('reports the line that gives a reason, not ffmpeg\u2019s sign-off', () => {
    setProxyEncoder('cpu')
    execSyncMock.mockImplementation((cmd: string | Buffer, opts?: { encoding?: string }) => {
      const line = String(cmd)
      if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
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
    const report = ensureProxies(manifestOf([fileEntry(src, 'abc123')]), outputDir)

    expect(report.reason).toContain('Gop Length')
    expect(report.reason).not.toContain('Conversion failed')
  })
})
