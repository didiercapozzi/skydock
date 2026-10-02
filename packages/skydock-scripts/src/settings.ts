import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getConfigDir, getOutputDir } from './utils'

/* What was chosen about where SkyDock works, kept beside the storage connection in the config
   folder. It is asked for once — the installed app asks on its first run — and remembered, because
   a day's footage is tens of gigabytes and which disk it lands on is a decision, not a default. */

/* loose on purpose: the window keeps its own setting in the same file — how big it is drawn — and
   remembering the work folder must not erase it */
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

/* Where the work is kept, settled once when the app starts: what this run was told, else what was
   chosen before, else what the app suggests, else where it has always been. */
const resolveOutputDir = (configDir?: string) =>
  process.env.SKYDOCK_OUTPUT_DIR ||
  readSettings(configDir).outputDir ||
  process.env.SKYDOCK_DEFAULT_OUTPUT_DIR ||
  getOutputDir()

/* the folder is remembered the first time it is settled, so it is asked for once and not again */
const rememberOutputDir = (dir: string, configDir?: string) => {
  if (readSettings(configDir).outputDir === dir) return
  saveSettings({ outputDir: dir }, configDir)
}

export { readSettings, rememberOutputDir, resolveOutputDir }
export type { Settings }
