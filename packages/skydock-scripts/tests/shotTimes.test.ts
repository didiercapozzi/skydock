// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* exiftool is stood in for: it gives the time a file's name says it was shot, as a camera writes it, for the files
   whose name starts with CAM, and nothing for the rest */
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

/* When each file was shot is asked only of what is new or changed since it was last asked, and kept until it
   changes (RULES, Scan): a camera's page is read again whenever the cameras change or a copy starts or ends, and
   asking about every file of a card of sixteen hundred clips takes fifteen seconds each time. */
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
  it('is asked only of what is new, and only again of what has changed since', async () => {
    const [a, b] = [clip('CAM_a.MP4'), clip('CAM_b.MP4')]
    await shotTimes([a, b])
    await shotTimes([a, b])
    const c = clip('CAM_c.MP4')
    await shotTimes([a, b, c])
    fs.writeFileSync(b, 'clip b, written again')
    await shotTimes([a, b, c])

    expect(asked()).toEqual([['CAM_a.MP4', 'CAM_b.MP4'], ['CAM_c.MP4'], ['CAM_b.MP4']])
  })

  it('is asked again of a file written since at the same size, and of one grown since at the same moment', async () => {
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

  it('is asked again of a file that gave no time, and of one that is gone', async () => {
    const bare = clip('b.MP4')
    const gone = path.join(dir, 'gone.MP4')
    await shotTimes([bare, gone])
    await shotTimes([bare, gone])

    expect(asked()).toEqual([
      ['b.MP4', 'gone.MP4'],
      ['b.MP4', 'gone.MP4']
    ])
  })
})
