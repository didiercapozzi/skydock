import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getStatusDir } from './utils'

const uploadProgressStateSchema = z.object({
  jumpId: z.string(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  state: z.enum(['uploading', 'done', 'error']),
  error: z.string().optional()
})
type UploadProgressState = z.infer<typeof uploadProgressStateSchema>

const getUploadProgressPath = (outputDir?: string): string =>
  path.join(getStatusDir(outputDir), 'upload-progress.json')

const readUploadProgress = (outputDir?: string): UploadProgressState | null => {
  try {
    const raw = JSON.parse(fs.readFileSync(getUploadProgressPath(outputDir), 'utf-8'))
    const parsed = uploadProgressStateSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    return null
  } catch {
    return null
  }
}

const writeUploadProgress = (state: UploadProgressState, outputDir?: string): void => {
  uploadProgressStateSchema.parse(state)
  const target = getUploadProgressPath(outputDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, target)
}

const clearUploadProgress = (outputDir?: string): void => {
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
