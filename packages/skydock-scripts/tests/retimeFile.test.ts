// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { gatherFilesAt, retimeFile } from '../src/clustering'
import type { Manifest } from '../src/types'
import { manifestFile } from './fixtures'

const T = 1_789_300_000

describe('re-timing one file', () => {
  it('changes that file and no other', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [manifestFile('a', T), manifestFile('b', T + 60)],
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '13.09.2026',
          files: [manifestFile('a', T), manifestFile('b', T + 60)]
        }
      ]
    }

    retimeFile(manifest, 'a', T + 3600)

    expect(manifest.files.find((f) => f.id === 'a')?.mtime).toBe(T + 3600)
    expect(manifest.groups[0]?.files.find((f) => f.id === 'a')?.mtime).toBe(T + 3600)
    expect(manifest.files.find((f) => f.id === 'b')?.mtime).toBe(T + 60)
  })

  it('puts the jump back in time order', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [manifestFile('a', T), manifestFile('b', T + 60)],
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '13.09.2026',
          files: [manifestFile('a', T), manifestFile('b', T + 60)]
        }
      ]
    }

    retimeFile(manifest, 'a', T + 120)

    expect(manifest.groups[0]?.files.map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('leaves the jump on its day, even when the file moves to another', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [manifestFile('a', T), manifestFile('b', T + 60)],
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '13.09.2026',
          files: [manifestFile('a', T), manifestFile('b', T + 60)]
        }
      ]
    }

    retimeFile(manifest, 'a', T - 5 * 86400)

    expect(manifest.groups[0]?.day).toBe('13.09.2026')
  })

  it('says so when the file is not on the board', () => {
    const manifest: Manifest = { version: 1, createdAt: 'x', files: [], groups: [] }

    expect(retimeFile(manifest, 'nope', T)).toBe(false)
  })
})

describe('putting several files on one day', () => {
  const at = (day: number, hour: number, minute: number, second = 0) =>
    Math.floor(new Date(2026, 8, day, hour, minute, second).getTime() / 1000)

  const board = (): Manifest => {
    const files = () => [
      manifestFile('a', at(26, 13, 13, 27)),
      manifestFile('b', at(11, 14, 17, 12)),
      manifestFile('c', at(20, 9, 30))
    ]
    return {
      version: 1,
      createdAt: 'x',
      files: files(),
      groups: [{ id: 'g1', label: 'jump', day: '13.09.2026', files: files() }]
    }
  }

  it('sets the lowest time of day to the time, on the day, and keeps the others’ distance from it', () => {
    const manifest = board()

    gatherFilesAt(manifest, new Set(['a', 'b', 'c']), at(30, 8, 0))

    const time = (id: string) => manifest.files.find((f) => f.id === id)?.mtime
    expect(time('c')).toBe(at(30, 8, 0))
    expect(time('a')).toBe(at(30, 8 + 3, 43, 27))
    expect(time('b')).toBe(at(30, 8 + 4, 47, 12))
  })

  it('moves only the picked files, and leaves a jump that held others on its day', () => {
    const manifest = board()

    gatherFilesAt(manifest, new Set(['a', 'b']), at(30, 8, 0))

    expect(manifest.files.find((f) => f.id === 'c')?.mtime).toBe(at(20, 9, 30))
    expect(manifest.groups[0]?.day).toBe('13.09.2026')
  })

  it('says so when none of the files is on the board', () => {
    expect(gatherFilesAt(board(), new Set(['nope']), at(30, 8, 0))).toBe(false)
  })
})
