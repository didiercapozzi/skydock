import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { getStatusDir } from './utils'

const uploadProgressStateSchema = z.object({
  groupId: z.string(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  state: z.enum(['uploading', 'done', 'error']),
  error: z.string().optional()
})
type UploadProgressState = z.infer<typeof uploadProgressStateSchema>

const getUploadProgressPath = (outputDir?: string) =>
  path.join(getStatusDir(outputDir), 'upload-progress.json')

const readUploadProgress = (outputDir?: string) => {
  try {
    const raw = JSON.parse(fs.readFileSync(getUploadProgressPath(outputDir), 'utf-8'))
    const parsed = uploadProgressStateSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    return null
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
  getUploadProgressPath,
  readUploadProgress,
  uploadProgressStateSchema,
  writeUploadProgress
}
export type { UploadProgressState }
