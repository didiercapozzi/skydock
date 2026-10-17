// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/tools', () => ({ run: vi.fn() }))
vi.mock('../src/utils', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  hasCommand: vi.fn(async () => true),
  exiftoolPath: vi.fn(async () => 'exiftool')
}))

import { readExifMap } from '../src/lib/exif'
import { run } from '../src/tools'

const TAGS = {
  photoTags: ['-DateTimeOriginal'],
  videoTags: ['-CreateDate', '-MediaCreateDate'],
  parse: (raw: string) => raw
}

const answer = (json: unknown[], csv = '') => {
  vi.mocked(run).mockImplementation(async (_program, args) => ({
    ok: true as const,
    stdout: args.includes('-j') ? JSON.stringify(json) : csv
  }))
}

const calls = () => vi.mocked(run).mock.calls.map(([, args]) => args)

beforeEach(() => {
  vi.mocked(run).mockReset()
})

describe('reading when each file was shot', () => {
  it('asks a camera clip for its maker and its times together, once', async () => {
    answer([
      { SourceFile: '/card/GX010001.MP4', Make: 'GoPro', CreateDate: '2026:08:01 10:00:00' },
      { SourceFile: '/card/GX010002.MP4', MediaCreateDate: '2026:08:01 10:05:00' }
    ])

    const times = await readExifMap(['/card/GX010001.MP4', '/card/GX010002.MP4'], TAGS)

    expect(calls()).toHaveLength(1)
    expect(Object.fromEntries(times)).toEqual({
      '/card/GX010001.MP4': '2026:08:01 10:00:00',
      '/card/GX010002.MP4': '2026:08:01 10:05:00'
    })
  })

  it('reads a DJI clip again, and only that one, with its time taken as UTC', async () => {
    answer(
      [
        { SourceFile: '/card/GX010001.MP4', Make: 'GoPro', CreateDate: '2026:08:01 10:00:00' },
        { SourceFile: '/card/DJI_0001.MP4', Make: 'DJI', CreateDate: '2026:08:01 08:00:00' }
      ],
      'SourceFile,CreateDate,MediaCreateDate\n/card/DJI_0001.MP4,2026:08:01 10:00:00,\n'
    )

    const times = await readExifMap(['/card/GX010001.MP4', '/card/DJI_0001.MP4'], TAGS)

    expect(calls()).toHaveLength(2)
    expect(calls()[1]).toEqual(expect.arrayContaining(['QuickTimeUTC=1', '/card/DJI_0001.MP4']))
    expect(calls()[1]).not.toContain('/card/GX010001.MP4')
    expect(times.get('/card/DJI_0001.MP4')).toBe('2026:08:01 10:00:00')
    expect(times.get('/card/GX010001.MP4')).toBe('2026:08:01 10:00:00')
  })

  it('reads photos on their own, as before', async () => {
    answer([], 'SourceFile,DateTimeOriginal\n/card/G0010001.JPG,2026:08:01 10:10:00\n')

    const times = await readExifMap(['/card/G0010001.JPG'], TAGS)

    expect(calls()).toHaveLength(1)
    expect(times.get('/card/G0010001.JPG')).toBe('2026:08:01 10:10:00')
  })
})
