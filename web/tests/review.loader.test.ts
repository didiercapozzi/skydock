// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { manifestSchema } from '@skydock/scripts'
import { loadManifest } from '@skydock/scripts'

describe('review loader – split manifest regression', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-review-loader-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('old loader (direct parse) fails on split manifest, new loader (loadManifest) succeeds', () => {
    const manifestPath = path.join(tmpDir, 'manifest.json')
    const jumpsPath = path.join(tmpDir, 'jumps.json')

    const file = {
      path: '/a/DJI_0001.MP4',
      size: 1000,
      mtime: 1000,
      filename: 'DJI_0001.MP4',
      id: 'abc123'
    }

    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        status: 'proposed',
        date: '2026-08-22',
        startDatetime: '2026-08-22T09:00:00Z',
        createdAt: new Date().toISOString(),
        theory: [],
        files: [file]
      })
    )
    fs.writeFileSync(
      jumpsPath,
      JSON.stringify({
        jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ id: 'abc123' }] }]
      })
    )

    let oldLoaderManifest: unknown = null
    try {
      oldLoaderManifest = manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')))
    } catch {
      oldLoaderManifest = null
    }
    expect(oldLoaderManifest).toBeNull()

    const manifest = loadManifest(manifestPath)
    expect(manifest).not.toBeNull()
    expect(manifest!.files).toHaveLength(1)
    expect(manifest!.jumps).toHaveLength(1)
    expect(manifest!.jumps[0].files[0].id).toBe('abc123')
    expect(manifest!.jumps[0].files[0].path).toBe('/a/DJI_0001.MP4')
  })

  it('review loader would have returned null before fix when manifest.json lacks jumps', async () => {
    const originalEnv = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
    try {
      const file = {
        path: '/a/DJI_0001.MP4',
        size: 1000,
        mtime: 1000,
        filename: 'DJI_0001.MP4',
        id: 'abc123'
      }
      fs.writeFileSync(
        path.join(tmpDir, 'manifest.json'),
        JSON.stringify({
          version: 1,
          status: 'proposed',
          date: '2026-08-22',
          startDatetime: '2026-08-22T09:00:00Z',
          createdAt: new Date().toISOString(),
          theory: [],
          files: [file]
        })
      )
      fs.writeFileSync(
        path.join(tmpDir, 'jumps.json'),
        JSON.stringify({
          jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ id: 'abc123' }] }]
        })
      )

      const { loader } = await import('../app/routes/review')
      const result = await loader()
      expect(result.manifest).not.toBeNull()
      expect(result.manifest!.jumps).toHaveLength(1)
    } finally {
      if (originalEnv === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
      else process.env.SKYDOCK_OUTPUT_DIR = originalEnv
    }
  })
})
