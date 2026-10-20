// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { timeLeftOf } from '../../app/hooks/useTimeLeft'

describe('the time left on a job', () => {
  it('is what is left of the way in proportion to the time spent on the way gone, from when it was first seen', () => {
    expect(timeLeftOf({ at: 0, part: 0.1 }, { at: 20_000, part: 0.3 })).toBe(70)
    expect(timeLeftOf({ at: 0, part: 0 }, { at: 60_000, part: 0.5 })).toBe(60)
    expect(timeLeftOf({ at: 5_000, part: 0.62 }, { at: 65_000, part: 0.69 })).toBeCloseTo(266, -1)
  })

  it('is not said before there is enough to say it from: a few seconds and a little way', () => {
    expect(timeLeftOf({ at: 0, part: 0 }, { at: 3_000, part: 0.5 })).toBeNull()
    expect(timeLeftOf({ at: 0, part: 0 }, { at: 60_000, part: 0.01 })).toBeNull()
    expect(timeLeftOf({ at: 0, part: 0.3 }, { at: 60_000, part: 0.3 })).toBeNull()
  })

  it('is none left at the end', () => {
    expect(timeLeftOf({ at: 0, part: 0 }, { at: 60_000, part: 1 })).toBe(0)
  })
})
