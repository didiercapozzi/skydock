// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ensureProxies, getProxyPath, needsProxy, proxyCounts } from '../src/proxy'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, execSyncMock, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

/* ffmpeg present, ffprobe reporting a 4K clip, and a transcode that writes whatever it was asked
   to write — enough to exercise everything without an encoder in the image. */
const toolsPresent =
  (width = 3840) =>
  (cmd: string | Buffer, opts?: { encoding?: string }) => {
    const line = String(cmd)
    if (line.startsWith('command -v')) return Buffer.from('/usr/bin/x')
    if (line.startsWith('ffprobe')) return opts?.encoding ? `${width}\n` : Buffer.from(`${width}\n`)
    if (line.startsWith('ffmpeg')) {
      /* the last quoted path on the line is the output */
      const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1])
      const out = quoted[quoted.length - 1]
      if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, Buffer.from('proxy'))
      }
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
    outputDir = createTmpDir('skydock-proxy-')
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
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
