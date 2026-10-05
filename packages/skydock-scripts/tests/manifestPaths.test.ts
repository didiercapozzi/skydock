// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
import { createTmpDir } from './fixtures'

/* The same work folder can be reached by two names — a container and the machine around it — and a clip
   scanned from one is written with that one's path. The other must still find it, or the clip is listed
   and nothing can be done to it: processing it silently passes it over. */

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('skydock-paths-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('a work folder reached by another name', () => {
  it('reads a clip written with the other name as the one that is here', () => {
    const here = path.join(outputDir, 'original_files', '2026-10-03', 'DJI_0001.MP4')
    fs.mkdirSync(path.dirname(here), { recursive: true })
    fs.writeFileSync(here, 'x')
    const written = '/home/capo/Documents/skydock/output/original_files/2026-10-03/DJI_0001.MP4'
    const gone = '/home/capo/Documents/skydock/output/proxies/a.mp4'
    const manifestPath = path.join(outputDir, 'manifest.json')
    saveManifest(manifestPath, {
      version: 1,
      createdAt: 'x',
      files: [{ path: written, size: 1, mtime: 1, filename: 'DJI_0001.MP4', id: 'a', proxy: gone }],
      groups: []
    })

    const read = loadManifest(manifestPath)!.files[0]!

    expect(read.path).toBe(here)
    /* a proxy that is not there under either name is left as it was written */
    expect(read.proxy).toBe(gone)
  })

  it('leaves a path alone that is nowhere here', () => {
    const manifestPath = path.join(outputDir, 'manifest.json')
    const written = '/elsewhere/output/original_files/2026-10-03/DJI_0002.MP4'
    saveManifest(manifestPath, {
      version: 1,
      createdAt: 'x',
      files: [{ path: written, size: 1, mtime: 1, filename: 'DJI_0002.MP4', id: 'b' }],
      groups: []
    })

    expect(loadManifest(manifestPath)!.files[0]!.path).toBe(written)
  })
})
