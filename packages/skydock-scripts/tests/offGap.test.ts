// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { offGap } from '../src/clustering'
import type { ManifestFile } from '../src/types'

/* The files of a jump that the gap rule would not have put there, for the board to flag. */

const file = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/src/${id}.mp4`,
  filename: `${id}.mp4`,
  size: 1,
  mtime
})

const T = 1_789_300_000

describe('files off the gap rule', () => {
  it('flags nothing in a jump the rule would have made', () => {
    expect(offGap([file('a', T), file('b', T + 60), file('c', T + 800)]).size).toBe(0)
  })

  it('flags a file separated from the rest by a pause the rule cuts at', () => {
    const flagged = offGap([file('a', T), file('b', T + 60), file('c', T + 60 + 900)])
    expect([...flagged]).toEqual(['c'])
  })

  /* the jump is its longest run, wherever the stray one sits */
  it('flags the stray one even when it comes first', () => {
    const flagged = offGap([file('x', T - 5000), file('a', T), file('b', T + 60)])
    expect([...flagged]).toEqual(['x'])
  })
})
