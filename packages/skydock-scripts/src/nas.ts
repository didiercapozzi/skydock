import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getStatusDir } from './utils'

const nasSessionSchema = z.object({
  hostname: z.string(),
  username: z.string(),
  sessionId: z.string(),
  defaultFolder: z.string().optional()
})

type NasSession = z.infer<typeof nasSessionSchema>

const nasPath = (outputDir?: string): string => path.join(getStatusDir(outputDir), 'nas.json')

const loadNasSession = (outputDir?: string): NasSession | null => {
  try {
    return nasSessionSchema.parse(JSON.parse(fs.readFileSync(nasPath(outputDir), 'utf-8')))
  } catch {
    return null
  }
}

const saveNasSession = (session: NasSession, outputDir?: string): void => {
  const target = nasPath(outputDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2))
  fs.renameSync(tmp, target)
}

const clearNasSession = (outputDir?: string): void => {
  const target = nasPath(outputDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

const updateDefaultFolder = (folder: string, outputDir?: string): void => {
  const session = loadNasSession(outputDir)
  if (session) saveNasSession({ ...session, defaultFolder: folder }, outputDir)
}

export { clearNasSession, loadNasSession, saveNasSession, updateDefaultFolder }
export type { NasSession }
