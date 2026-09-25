import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getStatusDir } from './utils'

/* Keyed by upload *scope* (`group:{id}` or `dest:{name}`), because one upload can cover a whole
   destination — several groups plus its lone files — and the poller has to recognise its own job.
   `checking` is the dedup pass that runs before a single byte moves (RULES, Network storage); without it the UI
   would sit silent while the NAS hashes hundreds of files. */
const uploadProgressStateSchema = z.object({
  scope: z.string(),
  groupId: z.string().optional(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  /* `archiving` is a montage's upload zipping the photos and the rushes, which moves gigabytes before a
     single byte reaches the NAS — without it the UI sits silent for minutes */
  state: z.enum(['archiving', 'checking', 'uploading', 'done', 'error']),
  checked: z.number().optional(),
  skipped: z.number().optional(),
  error: z.string().optional()
})

/* one place both sides name a montage's upload, so the poller cannot look for a scope nobody writes */
const montageUploadKey = (groupId: string) => `montage:${groupId}`
type UploadProgressState = z.infer<typeof uploadProgressStateSchema>

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
  getUploadProgressPath,
  readUploadProgress,
  uploadProgressStateSchema,
  writeUploadProgress
}
export type { UploadProgressState }
