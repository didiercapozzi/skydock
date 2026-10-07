import { describe, expect, test, vi } from 'vitest'
import { diskOf, ejectCamera } from '../src/ejectCamera'
import type { Tools } from '../src/ejectCamera'

/* A camera is let go of as the desktop lets go of one (RULES, Ejecting a camera). The programs are
   stood in for: what is asked of them is what counts, and nothing here unmounts anything. */

const tools = (over: Partial<Tools> = {}, answers: boolean[] = []) => {
  const asked: string[] = []
  const run = vi.fn(async (program: string, args: string[]) => {
    asked.push(`${program} ${args.join(' ')}`)
    return answers.shift() === false
      ? { ok: false as const, stdout: '', stderr: 'target is busy' }
      : { ok: true as const, stdout: '' }
  })
  const made: Tools = {
    run: run as Tools['run'],
    platform: 'linux',
    mounts: () => ['/media/card'],
    mountOf: (mount) => ({ point: mount, source: '/dev/sdb1' }),
    ...over
  }
  return { made, asked }
}

describe('ejecting a camera', () => {
  test('unmounts a card and powers its disk down', async () => {
    const { made, asked } = tools()
    expect(await ejectCamera('/media/card', made)).toEqual({ ok: true })
    expect(asked).toEqual(['udisksctl unmount -b /dev/sdb1', 'udisksctl power-off -b /dev/sdb'])
  })

  test('falls back to unmount when the desktop’s tool will not, and says what it said when nothing works', async () => {
    const { made, asked } = tools({}, [false, true])
    expect(await ejectCamera('/media/card', made)).toEqual({ ok: true })
    expect(asked.slice(0, 2)).toEqual(['udisksctl unmount -b /dev/sdb1', 'umount /media/card'])
    const stuck = tools({}, [false, false])
    expect(await ejectCamera('/media/card', stuck.made)).toEqual({
      ok: false,
      reason: 'target is busy'
    })
  })

  test('is asked for only a camera that is plugged in, and never runs a command for any other place', async () => {
    const { made, asked } = tools()
    expect(await ejectCamera('/', made)).toEqual({
      ok: false,
      reason: 'This camera is not plugged in any more.'
    })
    expect(asked).toEqual([])
  })

  test('never lets go of the disk the machine runs from', async () => {
    const { made, asked } = tools({ mountOf: () => ({ point: '/', source: '/dev/nvme0n1p2' }) })
    await ejectCamera('/media/card', made)
    expect(asked).toEqual(['umount /media/card'])
  })

  test('lets go of a folder on a bigger mount as that folder, never by the disk that holds other cameras too', async () => {
    const { made, asked } = tools({ mountOf: () => ({ point: '/media', source: '/dev/sdb1' }) })
    await ejectCamera('/media/card', made)
    expect(asked).toEqual(['umount /media/card'])
  })

  test('hands a camera over MTP back to the desktop that holds it, and only one that is plugged in', async () => {
    const { made, asked } = tools({ mounts: () => ['mtp:/HERO5 Black/Disk'] })
    expect(await ejectCamera('mtp:/Something Else/Disk', made)).toEqual({
      ok: false,
      reason: 'This camera is not plugged in any more.'
    })
    expect(await ejectCamera('mtp:/HERO5 Black/Disk', made)).toEqual({ ok: true })
    expect(asked).toEqual(['gio mount -u mtp://HERO5 Black/'])
  })

  test('uses the way a Mac ejects a drive', async () => {
    const { made, asked } = tools({ platform: 'darwin', mounts: () => ['/Volumes/CARD'] })
    await ejectCamera('/Volumes/CARD', made)
    expect(asked).toEqual(['diskutil eject /Volumes/CARD'])
  })

  test('names the disk a partition is on', () => {
    expect(diskOf('/dev/sdb1')).toBe('/dev/sdb')
    expect(diskOf('/dev/mmcblk0p1')).toBe('/dev/mmcblk0')
    expect(diskOf('/dev/nvme0n1p2')).toBe('/dev/nvme0n1')
  })
})
