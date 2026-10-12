import { describe, expect, it } from 'vitest'
import { groupableCount, regroupLooseFiles, splitByGap } from '../src/clustering'
import type { Manifest, ManifestFile } from '../src/types'
import { manifestFile } from './fixtures'

const AT = 1_785_000_000
const MINUTE = 60

const ids = (batches: ManifestFile[][]) => batches.map((b) => b.map((f) => f.id))

describe('the gap between jumps', () => {
  it('keeps files together when the pause is shorter than fifteen minutes', () => {
    expect(
      ids(splitByGap([manifestFile('a', AT), manifestFile('b', AT + 14 * MINUTE + 59)]))
    ).toEqual([['a', 'b']])
  })

  it('ends the jump at a pause of fifteen minutes', () => {
    expect(ids(splitByGap([manifestFile('a', AT), manifestFile('b', AT + 15 * MINUTE)]))).toEqual([
      ['a'],
      ['b']
    ])
  })

  it('lets a jump last hours as long as filming never pauses for that long', () => {
    const files = Array.from({ length: 13 }, (_, i) => manifestFile(`f${i}`, AT + i * 10 * MINUTE))
    expect(splitByGap(files)).toHaveLength(1)
  })

  it('orders the files as they were shot, whatever order they came in', () => {
    expect(ids(splitByGap([manifestFile('b', AT + 60), manifestFile('a', AT)]))).toEqual([
      ['a', 'b']
    ])
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
    const manifest = board([
      manifestFile('a', AT),
      manifestFile('b', AT + 60),
      manifestFile('lone', AT + 3 * 60 * MINUTE)
    ])

    expect(regroupLooseFiles(manifest)).toBe(1)
    expect(manifest.groups.map((g) => g.files.map((f) => f.id))).toEqual([['a', 'b']])
  })

  it('only ever groups what is in no jump and filed nowhere', () => {
    const filed = { ...manifestFile('filed', AT + 30), destination: 'Yverdon' }
    const manifest = board([manifestFile('a', AT), filed])

    expect(regroupLooseFiles(manifest)).toBe(0)
    expect(manifest.groups).toEqual([])
  })

  it('counts the loose files that could go into a jump, and none when every one is alone', () => {
    const near = [
      manifestFile('a', AT),
      manifestFile('b', AT + 60),
      manifestFile('lone', AT + 3 * 60 * MINUTE)
    ]
    const alone = [
      manifestFile('x', AT),
      manifestFile('y', AT + 3 * 60 * MINUTE),
      manifestFile('z', AT + 6 * 60 * MINUTE)
    ]

    expect(groupableCount(near)).toBe(2)
    expect(groupableCount(alone)).toBe(0)
  })
})
