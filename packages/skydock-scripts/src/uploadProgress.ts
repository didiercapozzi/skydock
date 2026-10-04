import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getStatusDir } from './utils'

const uploadItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  state: z.enum(['zipping', 'zipped', 'waiting', 'sending', 'sent', 'there', 'taken', 'failed']),
  part: z.number().optional()
})

const uploadProgressStateSchema = z.object({
  scope: z.string(),
  label: z.string().optional(),
  groupId: z.string().optional(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  state: z.enum(['archiving', 'checking', 'uploading', 'done', 'error', 'cancelled']),
  checked: z.number().optional(),
  skipped: z.number().optional(),
  error: z.string().optional(),
  items: z.array(uploadItemSchema).optional()
})

const montageUploadKey = (groupId: string) => `montage:${groupId}`
type UploadProgressState = z.infer<typeof uploadProgressStateSchema>
type UploadItem = z.infer<typeof uploadItemSchema>

const getUploadProgressPath = (outputDir?: string) =>
  path.join(getStatusDir(outputDir), 'upload-progress.json')

const readUploadProgress = (outputDir?: string) => {
  try {
    const parsed = jsonText
      .pipe(uploadProgressStateSchema)
      .safeParse(fs.readFileSync(getUploadProgressPath(outputDir), 'utf-8'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const writeUploadProgress = (state: UploadProgressState, outputDir?: string) => {
  uploadProgressStateSchema.parse(state)
  const target = getUploadProgressPath(outputDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  writeJsonAtomic(target, state)
}

const clearUploadProgress = (outputDir?: string) => {
  const target = getUploadProgressPath(outputDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

export {
  clearUploadProgress,
  montageUploadKey,
  readUploadProgress,
  uploadProgressStateSchema,
  writeUploadProgress
}
export type { UploadItem, UploadProgressState }
