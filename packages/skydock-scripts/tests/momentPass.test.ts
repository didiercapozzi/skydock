// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildMissingMoments, ensureMoments, needsMoments } from '../src/momentPass'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifest, saveManifest } from '../src/manifest'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, tellTools, writeTempFile } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { execFileSyncMock, execFileViaSyncMock } = await import('./fixtures')
  return { ...actual, execFileSync: execFileSyncMock, execFile: execFileViaSyncMock }
})

/* Where the jump is in a clip is found in a pass of its own, not inside the proxies': reading a
   clip's telemetry and transcoding it are different work, each shown as it goes (RULES, Work shown as
   it happens). */

const manifestOf = (files: ManifestFile[]): Manifest => ({
  version: 1,
  createdAt: new Date().toISOString(),
  files,
  groups: []
})

const clip = (filePath: string, id: string): ManifestFile => ({
  path: filePath,
  size: 1024,
  mtime: 1_754_000_000,
  filename: path.basename(filePath),
  id
})

describe('finding where the jump is in each clip', () => {
  let outputDir: string

  beforeEach(() => {
    tellTools()
    outputDir = createTmpDir('skydock-moments-')
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('is asked of clips not yet asked, and of nothing else', () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const photo = writeTempFile(outputDir, 'original_files/GOPR1100.JPG')

    expect(needsMoments(clip(src, 'v1'))).toBe(true)
    expect(needsMoments(clip(photo, 'p1'))).toBe(false)
    expect(needsMoments({ ...clip(src, 'v1'), moments: null })).toBe(false)
    expect(needsMoments({ ...clip(src, 'v1'), freed: true })).toBe(false)
  })

  /* Asking a clip where its jump is costs a moment, and the answer for most clips is that there is no
     jump in them. That answer is written down too, so no pass asks the same clip again. */
  it('writes down that a clip has no jump in it, so it is not asked twice', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([clip(src, 'abc123')])

    expect(await ensureMoments(manifest)).toBe(1)
    expect(manifest.files[0]?.moments).toBeNull()
    expect(await ensureMoments(manifest)).toBe(0)
  })

  it('says as it happens that the jump in a clip is being found, and what was found', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([clip(src, 'abc123')])
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind !== 'job' && heard.push(event))

    await ensureMoments(manifest)
    stop()

    expect(heard[0]).toEqual({ kind: 'file', work: 'moments', fileId: 'abc123', percent: 0 })
    expect(heard.at(-1)).toEqual({
      kind: 'file-done',
      work: 'moments',
      fileId: 'abc123',
      ok: true,
      moments: null
    })
  })

  it('says nothing of a clip that was already asked', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifest = manifestOf([{ ...clip(src, 'abc123'), moments: null }])
    const heard: LiveEvent[] = []
    const stop = subscribe((event) => event.kind !== 'job' && heard.push(event))

    await ensureMoments(manifest)
    stop()

    expect(heard).toEqual([])
  })

  it('has the answer on the disk before the board is told', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifestPath = path.join(outputDir, 'manifest.json')
    saveManifest(manifestPath, manifestOf([clip(src, 'abc123')]))
    const onDisk: (boolean | null)[] = []
    const stop = subscribe((event) => {
      if (event.kind === 'file-done')
        onDisk.push(loadManifest(manifestPath)?.files[0]?.moments === null)
    })

    await buildMissingMoments(outputDir)
    stop()

    expect(onDisk).toEqual([true])
  })

  /* the board goes on working while a clip is read: a mark somebody moved by hand meanwhile stays */
  it('does not undo what was changed while it read', async () => {
    const src = writeTempFile(outputDir, 'original_files/GX010023.MP4')
    const manifestPath = path.join(outputDir, 'manifest.json')
    saveManifest(manifestPath, manifestOf([clip(src, 'abc123')]))

    const pass = buildMissingMoments(outputDir)
    saveManifest(manifestPath, manifestOf([{ ...clip(src, 'abc123'), cropStart: 4, cropEnd: 9 }]))
    await pass

    const saved = loadManifest(manifestPath)!
    expect(saved.files[0]?.cropStart).toBe(4)
    expect(saved.files[0]?.moments).toBeNull()
  })
})
