// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { retimeFile } from '../src/clustering'
import type { Manifest, ManifestFile } from '../src/types'

/* One file's time corrected on its own: it stays in its jump, the jump keeps its day. */

const file = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/src/${id}.mp4`,
  filename: `${id}.mp4`,
  size: 1,
  mtime
})

const T = 1_789_300_000

describe('re-timing one file', () => {
  it('changes that file and no other', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a', T), file('b', T + 60)],
      groups: [
        { id: 'g1', label: 'jump', day: '13.09.2026', files: [file('a', T), file('b', T + 60)] }
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
      files: [file('a', T), file('b', T + 60)],
      groups: [
        { id: 'g1', label: 'jump', day: '13.09.2026', files: [file('a', T), file('b', T + 60)] }
      ]
    }

    retimeFile(manifest, 'a', T + 120)

    expect(manifest.groups[0]?.files.map((f) => f.id)).toEqual(['b', 'a'])
  })

  /* as with a file dropped in from another day: the jump is filed under the day it started */
  it('leaves the jump on its day, even when the file moves to another', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a', T), file('b', T + 60)],
      groups: [
        { id: 'g1', label: 'jump', day: '13.09.2026', files: [file('a', T), file('b', T + 60)] }
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
