// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { diskSpace, levelOf, lookAtDisk } from '../src/diskSpace'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { createTmpDir } from './fixtures'

/* The board warns when the disk the work is on runs out of room (RULES, The board): almost full under
   five gigabytes left, full under one, and it is told again only when that changes enough to matter. */

const GB = 1024 ** 3

afterEach(() => {
  globalThis.skydockDiskWatch = undefined
  globalThis.skydockLive = undefined
})

describe('the room left on the disk', () => {
  it('reads as full under a gigabyte, almost full under five, and fine above', () => {
    expect(levelOf(0)).toBe('full')
    expect(levelOf(0.9 * GB)).toBe('full')
    expect(levelOf(1 * GB)).toBe('low')
    expect(levelOf(4.9 * GB)).toBe('low')
    expect(levelOf(5 * GB)).toBe('ok')
  })

  it('is read off the disk the output folder is on', () => {
    const space = diskSpace(createTmpDir('skydock-disk-'))
    expect(space?.free).toBeGreaterThanOrEqual(0)
    expect(space?.total).toBeGreaterThan(0)
  })

  it('is told to the board once, and not again while it stays the same', () => {
    const dir = createTmpDir('skydock-disk-')
    const heard: LiveEvent[] = []
    subscribe((e) => heard.push(e))

    lookAtDisk(dir)
    lookAtDisk(dir)

    expect(heard.filter((e) => e.kind === 'disk')).toHaveLength(1)
  })
})
