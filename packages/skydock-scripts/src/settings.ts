import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getConfigDir, getOutputDir } from './utils'

const settingsSchema = z.looseObject({ outputDir: z.string().optional() })

type Settings = z.infer<typeof settingsSchema>

const settingsPath = (configDir?: string) => path.join(configDir || getConfigDir(), 'settings.json')

const readSettings = (configDir?: string) => {
  const parsed = jsonText.pipe(settingsSchema).safeParse(readFile(settingsPath(configDir)))
  return parsed.success ? parsed.data : {}
}

const readFile = (target: string) => {
  try {
    return fs.readFileSync(target, 'utf-8')
  } catch {
    return ''
  }
}

const saveSettings = (next: Settings, configDir?: string) => {
  const target = settingsPath(configDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  writeJsonAtomic(target, { ...readSettings(configDir), ...next })
}

const resolveOutputDir = (configDir?: string) =>
  process.env.SKYDOCK_OUTPUT_DIR ||
  readSettings(configDir).outputDir ||
  process.env.SKYDOCK_DEFAULT_OUTPUT_DIR ||
  getOutputDir()

const rememberOutputDir = (dir: string, configDir?: string) => {
  if (readSettings(configDir).outputDir === dir) return
  saveSettings({ outputDir: dir }, configDir)
}

export { readSettings, rememberOutputDir, resolveOutputDir, saveSettings }
export type { Settings }
