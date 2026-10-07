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

type Said = { ok: true } | { ok: false; reason: string }

type Tools = {
  run: typeof run
  platform: NodeJS.Platform
  mounts: () => string[]
  mountOf: (mount: string) => { point: string; source: string } | null
}

const REAL: Tools = {
  run,
  platform: process.platform,
  mounts: () => [...mountedCameras(), ...camerasSeenThroughKde()],
  mountOf
}

const diskOf = (device: string) =>
  /\dp\d+$/.test(device) ? device.replace(/p\d+$/, '') : device.replace(/(?<=\D)\d+$/, '')

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
  if (!tools.mounts().includes(mount))
    return { ok: false, reason: 'This camera is not plugged in any more.' }
  if (cameraCopying())
    return { ok: false, reason: 'A camera is being copied — wait for it to finish, or stop it.' }
  if (tools.platform === 'darwin') return firstThatWorks(tools, [['diskutil', ['eject', mount]]])
  if (tools.platform === 'win32') {
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
  if (isKioCamera(mount))
    return firstThatWorks(tools, [['gio', ['mount', '-u', `mtp://${kioCameraName(mount)}/`]]])
  if (overMtp(mount)) return firstThatWorks(tools, [['gio', ['mount', '-u', mount]]])
  const found = tools.mountOf(mount)
  const device =
    found && found.point === path.resolve(mount) && found.point !== path.parse(found.point).root
      ? found.source
      : null
  const unmounted = await firstThatWorks(tools, [
    ...(device ? ([['udisksctl', ['unmount', '-b', device]]] as [string, string[]][]) : []),
    ['umount', [mount]]
  ])
  if (unmounted.ok && device) await tools.run('udisksctl', ['power-off', '-b', diskOf(device)])
  return unmounted
}

export { ejectCamera, diskOf }
export type { Said, Tools }
