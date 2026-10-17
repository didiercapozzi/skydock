// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/exif', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  readExifMap: vi.fn(
    async (files: string[]) =>
      new Map(files.map((f) => [f, '2026:08:01 10:00:00'] as [string, string]))
  )
}))

import { createTmpDir } from './fixtures'

let media: string
let outputDir: string

const DAY = new Date(2026, 7, 1, 10, 0, 0)

const card = (...clips: string[]) => {
  const root = path.join(media, 'GOPRO')
  for (const clip of clips) {
    const file = path.join(root, 'DCIM', '100GOPRO', clip)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.alloc(32, clip.length))
    fs.utimesSync(file, DAY, DAY)
  }
  return root
}

const afresh = async () => {
  vi.resetModules()
  const { readExifMap } = await import('../src/lib/exif')
  vi.mocked(readExifMap).mockClear()
  const { copyCamera } = await import('../src/copy')
  const { lookAtCameras } = await import('../src/cameraFiles')
  const asked = () =>
    vi.mocked(readExifMap).mock.calls.map(([files]) => files.map((f) => path.basename(f)))
  return { copyCamera, lookAtCameras, asked }
}

beforeEach(() => {
  media = createTmpDir('skydock-replug-media-')
  outputDir = createTmpDir('skydock-replug-out-')
})

afterEach(() => {
  fs.rmSync(media, { recursive: true, force: true })
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('a camera plugged in again after SkyDock was closed', () => {
  it('has nothing read inside a clip that is already here', async () => {
    const root = card('GX010001.MP4')
    await (await afresh()).copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    const again = await afresh()
    const result = await again.copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 0, skipped: 1 })
    expect(again.asked()).toEqual([])
  })

  it('has only the clips that are not here read, and copied', async () => {
    const root = card('GX010001.MP4')
    await (await afresh()).copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    card('GX010001.MP4', 'GX010002.MP4')

    const again = await afresh()
    const result = await again.copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, skipped: 1 })
    expect(again.asked()).toEqual([['GX010002.MP4']])
  })

  it('lists its clips, new and here, without reading inside any of them', async () => {
    const root = card('GX010001.MP4')
    await (await afresh()).copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    card('GX010001.MP4', 'GX010002.MP4')

    const again = await afresh()
    const [camera] = await again.lookAtCameras(outputDir, [root], path.join(outputDir, 'bin'))

    expect(
      Object.fromEntries((camera?.files ?? []).map((f) => [path.basename(f.path), f.state]))
    ).toEqual({ 'GX010001.MP4': 'copied', 'GX010002.MP4': 'missing' })
    expect(again.asked()).toEqual([])
  })
})
