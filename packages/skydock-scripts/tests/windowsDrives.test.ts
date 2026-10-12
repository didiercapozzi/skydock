import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { windowsDrives } from '../src/cameraWatch'

describe('the drives looked at on Windows for a camera', () => {
  const drive = (letter: string) => `${letter}:${path.sep}`

  it('leaves out a drive that does not answer, without waiting for it, and does not ask it again soon', async () => {
    const asked: string[] = []
    const probe = (at: string) => {
      asked.push(at)
      if (at === drive('Z')) return new Promise<boolean>(() => {})
      return Promise.resolve(at === drive('D') || at === drive('E'))
    }

    const first = await windowsDrives(probe, 20)
    const second = await windowsDrives(probe, 20)

    expect(first).toEqual([drive('D'), drive('E')])
    expect(second).toEqual([drive('D'), drive('E')])
    expect(asked.filter((at) => at === drive('Z'))).toHaveLength(1)
  })
})
