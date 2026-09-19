// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { regroupLooseFiles, splitByGap } from '../src/clustering'
import type { Manifest, ManifestFile } from '../src/types'

/* A jump is a run of files with no long pause in it (RULES, Jumps): the pause is measured from each
   file to the next, a pause of fifteen minutes or more ends the jump, and a file with no neighbours
   stays loose. */

const AT = 1_785_000_000
const MINUTE = 60

const clip = (id: string, at: number): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: at
})

const ids = (batches: ManifestFile[][]) => batches.map((b) => b.map((f) => f.id))

describe('the gap between jumps', () => {
  it('keeps files together when the pause is shorter than fifteen minutes', () => {
    expect(ids(splitByGap([clip('a', AT), clip('b', AT + 14 * MINUTE + 59)]))).toEqual([['a', 'b']])
  })

  it('ends the jump at a pause of fifteen minutes', () => {
    expect(ids(splitByGap([clip('a', AT), clip('b', AT + 15 * MINUTE)]))).toEqual([['a'], ['b']])
  })

  /* measured from each file to the next, never from the first: filming that never stops is one jump */
  it('lets a jump last hours as long as filming never pauses for that long', () => {
    const files = Array.from({ length: 13 }, (_, i) => clip(`f${i}`, AT + i * 10 * MINUTE))
    expect(splitByGap(files)).toHaveLength(1)
  })

  it('orders the files as they were shot, whatever order they came in', () => {
    expect(ids(splitByGap([clip('b', AT + 60), clip('a', AT)]))).toEqual([['a', 'b']])
  })
})

describe('regrouping loose files', () => {
  const board = (files: ManifestFile[]): Manifest => ({
    version: 1,
    createdAt: 'x',
    files,
    groups: []
  })

  it('makes jumps of the loose files by the gap rule, and leaves a file with no neighbours loose', () => {
    const manifest = board([clip('a', AT), clip('b', AT + 60), clip('lone', AT + 3 * 60 * MINUTE)])

    expect(regroupLooseFiles(manifest)).toBe(1)
    expect(manifest.groups.map((g) => g.files.map((f) => f.id))).toEqual([['a', 'b']])
  })

  it('only ever groups what is in no jump and filed nowhere', () => {
    const filed = { ...clip('filed', AT + 30), destination: 'Yverdon' }
    const manifest = board([clip('a', AT), filed])

    expect(regroupLooseFiles(manifest)).toBe(0)
    expect(manifest.groups).toEqual([])
  })
})
