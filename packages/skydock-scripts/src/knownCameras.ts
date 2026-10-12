import { z } from 'zod'
import { inSettingsTurn, readSettings, writeSettings } from './settings'

const knownCameraSchema = z.object({
  key: z.string(),
  name: z.string(),
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

const keep = (cameras: KnownCamera[], configDir?: string) => writeSettings({ cameras }, configDir)

const rememberCamera = (camera: { key: string; name: string; auto: boolean }, configDir?: string) =>
  inSettingsTurn(async () => {
    const all = knownCameras(configDir)
    const kept = all.find((c) => c.key === camera.key)
    const next: KnownCamera = {
      key: camera.key,
      name: camera.name,
      auto: camera.auto,
      firstSeen: kept?.firstSeen ?? now(),
      lastSeen: now()
    }
    await keep([...all.filter((c) => c.key !== camera.key), next], configDir)
    return next
  })

const forgetCamera = (key: string, configDir?: string) =>
  inSettingsTurn(() =>
    keep(
      knownCameras(configDir).filter((c) => c.key !== key),
      configDir
    )
  )

const setCameraAuto = (key: string, auto: boolean, configDir?: string) =>
  inSettingsTurn(() =>
    keep(
      knownCameras(configDir).map((c) => (c.key === key ? { ...c, auto } : c)),
      configDir
    )
  )

const touchCamera = (key: string, configDir?: string) =>
  inSettingsTurn(async () => {
    const all = knownCameras(configDir)
    if (!all.some((c) => c.key === key)) return
    await keep(
      all.map((c) => (c.key === key ? { ...c, lastSeen: now() } : c)),
      configDir
    )
  })

export { forgetCamera, knownCameraSchema, knownCameras, rememberCamera, setCameraAuto, touchCamera }
export type { KnownCamera }
