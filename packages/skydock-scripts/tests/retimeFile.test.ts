// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { retimeFile } from '../src/clustering'
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
