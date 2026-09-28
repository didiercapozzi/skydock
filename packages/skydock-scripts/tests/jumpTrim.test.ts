// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { jumpTrim, RUN_UP } from '../src/jumpMoments'

/* A clip trimmed to its jump in one press (RULES, Trimming to the jump). */
describe('trimming a clip to its jump', () => {
  it('starts a second before the exit, and ends a few seconds after the landing', () => {
    const trim = jumpTrim({ exit: 40, landing: 300 }, false, null)

    expect(trim.cropStart).toBe(40 - RUN_UP)
    expect(trim.cropEnd).toBeGreaterThan(300)
    expect(trim.cropEnd).toBeLessThan(320)
  })

  it('starts on the exit itself in a montage, which is its own subject', () => {
    expect(jumpTrim({ exit: 40 }, true, null).cropStart).toBe(40)
  })

  it('keeps the end it has when no landing was found', () => {
    expect(jumpTrim({ exit: 40 }, false, 120).cropEnd).toBe(120)
  })

  it('runs to the clip’s own end when the clip stops sooner', () => {
    expect(jumpTrim({ exit: 40, landing: 209 }, false, null, 213.16).cropEnd).toBeNull()
  })
})
