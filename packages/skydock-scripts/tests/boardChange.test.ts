// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { describeChange } from '../src/boardChange'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'

/* A step of the board's history says what the change did, in the board's own words (RULES, Going
   back). */

const file = (id: string, over: Partial<ManifestFile> = {}): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1,
  ...over
})

const board = (groups: ManifestGroup[], loose: ManifestFile[] = []): Manifest => ({
  version: 2,
  createdAt: 'x',
  files: [...groups.flatMap((g) => g.files), ...loose],
  groups
})

const jump = (
  id: string,
  files: ManifestFile[],
  over: Partial<ManifestGroup> = {}
): ManifestGroup => ({
  id,
  label: id,
  day: '01.08.2026',
  files,
  ...over
})

describe('what a change did', () => {
  it('says where files were filed, and how many', () => {
    const before = board([jump('j1', [file('a'), file('b')])])
    const after = board([jump('j1', [file('a'), file('b')], { destination: 'Yverdon' })])

    expect(describeChange(before, after).filed).toEqual([
      { to: { kind: 'dz', name: 'Yverdon' }, files: 2 }
    ])
  })

  it('names a montage made', () => {
    const before = board([jump('j1', [file('a')])])
    const after = board([
      jump('j1', [file('a')], {
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' }
      })
    ])

    const change = describeChange(before, after)
    expect(change.montagesMade).toEqual(['Luc Favre'])
    expect(change.filed).toEqual([{ to: { kind: 'montage', name: 'Luc Favre' }, files: 1 }])
  })

  it('counts clips trimmed, and files re-timed', () => {
    const before = board([jump('j1', [file('a'), file('b')])])
    const after = board([jump('j1', [file('a', { cropStart: 3 }), file('b', { mtime: 60 })])])

    expect(describeChange(before, after)).toMatchObject({ trimmed: 1, retimed: 1 })
  })

  it('counts files that left the board', () => {
    const before = board([jump('j1', [file('a')])], [file('b')])
    const after = board([jump('j1', [file('a')])])

    expect(describeChange(before, after)).toMatchObject({ filesGone: 1, filed: [] })
  })
})
