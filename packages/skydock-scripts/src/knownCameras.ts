import { z } from 'zod'
import { readSettings, saveSettings } from './settings'

/* The cameras this machine has met, kept beside the work folder's own address in the settings: a
   camera is a device on this computer, not a part of any one work folder, and this is known before
   anything has been scanned. Each is told apart by `key` — the disk's own id where the machine gives
   one, else the name it shows — and says whether its new files are copied off the moment it is
   plugged in. They start out not copied: a camera is often somebody else's, and one file is wanted. */
const knownCameraSchema = z.object({
  key: z.string(),
  name: z.string(),
  /* copy what is new on it as soon as it is plugged in */
  auto: z.boolean().default(false),
  firstSeen: z.number(),
  lastSeen: z.number()
})

type KnownCamera = z.infer<typeof knownCameraSchema>

const now = () => Math.floor(Date.now() / 1000)

const knownCameras = (configDir?: string): KnownCamera[] => {
  const read = z.array(knownCameraSchema).safeParse(readSettings(configDir).cameras)
  return read.success ? read.data : []
}

const keep = (cameras: KnownCamera[], configDir?: string) => saveSettings({ cameras }, configDir)

/* met for the first time, or told again: a camera already known keeps its first sighting */
const rememberCamera = (
  camera: { key: string; name: string; auto: boolean },
  configDir?: string
) => {
  const all = knownCameras(configDir)
  const kept = all.find((c) => c.key === camera.key)
  const next: KnownCamera = {
    key: camera.key,
    name: camera.name,
    auto: camera.auto,
    firstSeen: kept?.firstSeen ?? now(),
    lastSeen: now()
  }
  keep([...all.filter((c) => c.key !== camera.key), next], configDir)
  return next
}

/* gone from the list; what was copied from it stays where it is */
const forgetCamera = (key: string, configDir?: string) =>
  keep(
    knownCameras(configDir).filter((c) => c.key !== key),
    configDir
  )

const setCameraAuto = (key: string, auto: boolean, configDir?: string) =>
  keep(
    knownCameras(configDir).map((c) => (c.key === key ? { ...c, auto } : c)),
    configDir
  )

/* seen just now, which is how long ago it was last there when it is not */
const touchCamera = (key: string, configDir?: string) => {
  const all = knownCameras(configDir)
  if (!all.some((c) => c.key === key)) return
  keep(
    all.map((c) => (c.key === key ? { ...c, lastSeen: now() } : c)),
    configDir
  )
}

export { forgetCamera, knownCameraSchema, knownCameras, rememberCamera, setCameraAuto, touchCamera }
export type { KnownCamera }
