// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/exif', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  readExifMap: vi.fn(
    async (files: string[]) =>
      new Map(
        files
          .filter((f) => path.basename(f).startsWith('CAM'))
          .map((f) => [f, '2026:09:01 09:00:00'] as [string, string])
      )
  )
}))

import { readExifMap } from '../src/lib/exif'
import { shotTimes } from '../src/scan'
import { createTmpDir } from './fixtures'

let dir: string
const asked = () =>
  vi.mocked(readExifMap).mock.calls.map(([files]) => files.map((f) => path.basename(f)))

beforeEach(() => {
  dir = createTmpDir('skydock-shot-times-')
  vi.mocked(readExifMap).mockClear()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const EARLY = new Date(2026, 8, 1, 10, 0, 0)
const clip = (name: string, content = `clip ${name}`, at = EARLY) => {
  const file = path.join(dir, name)
  fs.writeFileSync(file, content)
  fs.utimesSync(file, at, at)
  return file
}
const epoch = (date: Date) => Math.floor(date.getTime() / 1000)
const NINE = epoch(new Date(2026, 8, 1, 9, 0, 0))

describe('when each file was shot', () => {
  it('a file that changed since takes the time its camera gave it again', async () => {
    const same = clip('CAM_same.MP4', 'clip 1')
    const grown = clip('CAM_grown.MP4', 'clip 1')
    await shotTimes([same, grown])
    const later = new Date(2026, 8, 1, 11, 0, 0)
    fs.writeFileSync(same, 'clip 2')
    fs.utimesSync(same, later, later)
    fs.writeFileSync(grown, 'clip 1, longer')
    fs.utimesSync(grown, EARLY, EARLY)
    vi.mocked(readExifMap).mockClear()

    await shotTimes([same, grown])

    expect(asked()).toEqual([['CAM_same.MP4', 'CAM_grown.MP4']])
  })

  it('is the time the camera gave, as it was read, every time it is asked for', async () => {
    const camera = clip('CAM_a.MP4')
    const bare = clip('b.MP4')

    const first = await shotTimes([camera, bare])
    const again = await shotTimes([camera, bare])

    expect(first.get(camera)).toBe(NINE)
    expect(again.get(camera)).toBe(NINE)
    expect(again.get(bare)).toBe(epoch(EARLY))
  })
})
