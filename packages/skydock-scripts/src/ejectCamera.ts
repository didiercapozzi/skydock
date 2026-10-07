import * as path from 'node:path'
import {
  cameraCopying,
  camerasSeenThroughKde,
  mountedCameras,
  mountOf,
  overMtp
} from './cameraWatch'
import { isKioCamera, kioCameraName } from './kioCamera'
import { run } from './tools'

/* A camera let go of as the desktop lets go of one (RULES, Ejecting a camera): what is still being written
   is finished, the drive is unmounted, and where the machine can, it is powered down — so the card or the
   camera can be pulled out without a thought. Nothing on it is touched. */

type Said = { ok: true } | { ok: false; reason: string }

type Tools = {
  run: typeof run
  platform: NodeJS.Platform
  /* the cameras plugged in, which is all that may be ejected */
  mounts: () => string[]
  mountOf: (mount: string) => { point: string; source: string } | null
}

const REAL: Tools = {
  run,
  platform: process.platform,
  mounts: () => [...mountedCameras(), ...camerasSeenThroughKde()],
  mountOf
}

/* the disk a partition is part of: /dev/sdb1 is on /dev/sdb, /dev/mmcblk0p1 on /dev/mmcblk0 */
const diskOf = (device: string) =>
  /\dp\d+$/.test(device) ? device.replace(/p\d+$/, '') : device.replace(/(?<=\D)\d+$/, '')

/* the first command that works, with what the last one said when none did */
const firstThatWorks = async (tools: Tools, commands: [string, string[]][]): Promise<Said> => {
  let said = 'This machine has no way to let this camera go.'
  for (const [program, args] of commands) {
    const done = await tools.run(program, args)
    if (done.ok) return { ok: true }
    said = done.stderr.trim() || said
  }
  return { ok: false, reason: said }
}

const ejectCamera = async (mount: string, tools: Tools = REAL): Promise<Said> => {
  /* only a camera that is plugged in: what is asked is never turned into a command for any other place */
  if (!tools.mounts().includes(mount))
    return { ok: false, reason: 'This camera is not plugged in any more.' }
  if (cameraCopying())
    return { ok: false, reason: 'A camera is being copied — wait for it to finish, or stop it.' }
  if (tools.platform === 'darwin') return firstThatWorks(tools, [['diskutil', ['eject', mount]]])
  if (tools.platform === 'win32') {
    /* a drive letter, which is all a command line is ever given of it */
    if (!/^[A-Za-z]:/.test(mount)) return { ok: false, reason: 'This camera is not a drive.' }
    return firstThatWorks(tools, [
      [
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(New-Object -comObject Shell.Application).Namespace(17).ParseName('${mount.slice(0, 2)}').InvokeVerb('Eject')`
        ]
      ]
    ])
  }
  /* a camera that hands its files over is let go through the desktop that holds it */
  if (isKioCamera(mount))
    return firstThatWorks(tools, [['gio', ['mount', '-u', `mtp://${kioCameraName(mount)}/`]]])
  if (overMtp(mount)) return firstThatWorks(tools, [['gio', ['mount', '-u', mount]]])
  /* only a drive of its own is let go of by its device: a camera in a folder on a disk with other things on it —
     the machine's own, or a root holding several cameras — is unmounted as that folder or not at all */
  const found = tools.mountOf(mount)
  const device =
    found && found.point === path.resolve(mount) && found.point !== path.parse(found.point).root
      ? found.source
      : null
  const unmounted = await firstThatWorks(tools, [
    ...(device ? ([['udisksctl', ['unmount', '-b', device]]] as [string, string[]][]) : []),
    ['umount', [mount]]
  ])
  /* powering the disk down is a courtesy to whoever pulls it out: where it cannot be done, the drive is
     unmounted all the same, and that is the ejecting */
  if (unmounted.ok && device) await tools.run('udisksctl', ['power-off', '-b', diskOf(device)])
  return unmounted
}

export { ejectCamera, diskOf }
export type { Said, Tools }
