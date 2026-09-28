// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { limited } from '../src/lib/queue'

/* Frames and tracks are cut a few at a time, so a folder opened does not start fifty ffmpeg at once,
   and the same one asked for twice is cut once. */

const held = () => {
  let letGo = () => {}
  const until = new Promise<void>((resolve) => {
    letGo = resolve
  })
  return { until, letGo: () => letGo() }
}

describe('work done a few at a time', () => {
  it('runs no more than it is allowed at once, and the rest in turn', async () => {
    const run = limited<number>(3)
    let now = 0
    let most = 0
    const gate = held()
    const all = Array.from({ length: 10 }, (_, i) =>
      run(`k${i}`, async () => {
        now++
        most = Math.max(most, now)
        await gate.until
        now--
        return i
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(most).toBe(3)
    gate.letGo()

    expect(await Promise.all(all)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(most).toBe(3)
  })

  it('shares one run between two asking for the same', async () => {
    const run = limited<string>(1)
    let runs = 0
    const work = async () => {
      runs++
      return 'frame'
    }

    const [a, b] = await Promise.all([run('same', work), run('same', work)])

    expect([a, b, runs]).toEqual(['frame', 'frame', 1])
  })

  it('does not run what nobody wants any more', async () => {
    const run = limited<string>(1)
    const gate = held()
    const first = run('first', async () => {
      await gate.until
      return 'first'
    })
    const gone = new AbortController()
    const second = run('second', async () => 'second', gone.signal)
    gone.abort()
    gate.letGo()

    await expect(first).resolves.toBe('first')
    await expect(second).rejects.toThrow()
  })
})
