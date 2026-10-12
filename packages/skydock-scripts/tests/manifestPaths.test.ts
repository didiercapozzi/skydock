// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifestAsync, saveManifest } from '../src/manifest'
import { createTmpDir } from './fixtures'

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('skydock-paths-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('a work folder reached by another name', () => {
  it('reads a clip written with the other name as the one that is here', async () => {
    const here = path.join(outputDir, 'original_files', '2026-10-03', 'DJI_0001.MP4')
    fs.mkdirSync(path.dirname(here), { recursive: true })
    fs.writeFileSync(here, 'x')
    const written = '/home/capo/Documents/skydock/output/original_files/2026-10-03/DJI_0001.MP4'
    const gone = '/home/capo/Documents/skydock/output/proxies/a.mp4'
    const manifestPath = path.join(outputDir, 'manifest.json')
    await saveManifest(manifestPath, {
      version: 1,
      createdAt: 'x',
      files: [{ path: written, size: 1, mtime: 1, filename: 'DJI_0001.MP4', id: 'a', proxy: gone }],
      groups: []
    })

    const read = (await loadManifestAsync(manifestPath))!.files[0]!

    expect(read.path).toBe(here)
    expect(read.proxy).toBe(gone)
  })

  it('leaves a path alone that is nowhere here', async () => {
    const manifestPath = path.join(outputDir, 'manifest.json')
    const written = '/elsewhere/output/original_files/2026-10-03/DJI_0002.MP4'
    await saveManifest(manifestPath, {
      version: 1,
      createdAt: 'x',
      files: [{ path: written, size: 1, mtime: 1, filename: 'DJI_0002.MP4', id: 'b' }],
      groups: []
    })

    expect((await loadManifestAsync(manifestPath))!.files[0]!.path).toBe(written)
  })
})
