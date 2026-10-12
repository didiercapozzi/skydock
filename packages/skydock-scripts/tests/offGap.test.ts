// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { offGap } from '../src/clustering'
import { manifestFile } from './fixtures'

const T = 1_789_300_000

describe('files off the gap rule', () => {
  it('flags nothing in a jump the rule would have made', () => {
    expect(
      offGap([manifestFile('a', T), manifestFile('b', T + 60), manifestFile('c', T + 800)]).size
    ).toBe(0)
  })

  it('flags a file separated from the rest by a pause the rule cuts at', () => {
    const flagged = offGap([
      manifestFile('a', T),
      manifestFile('b', T + 60),
      manifestFile('c', T + 60 + 900)
    ])
    expect([...flagged]).toEqual(['c'])
  })

  it('flags the stray one even when it comes first', () => {
    const flagged = offGap([
      manifestFile('x', T - 5000),
      manifestFile('a', T),
      manifestFile('b', T + 60)
    ])
    expect([...flagged]).toEqual(['x'])
  })
})
