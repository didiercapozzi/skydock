import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getStatusDir } from './utils'

/* One thing this upload sends, as the list of it shows it: a zip being made, then each file going to
   each folder up there — waiting, being sent, sent, already there and skipped, or in the way: a file of that name is up there already. `part` is how far
   the one under way has got. */
const uploadItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  state: z.enum(['zipping', 'zipped', 'waiting', 'sending', 'sent', 'there', 'taken', 'failed']),
  part: z.number().optional()
})

/* Keyed by upload *scope* (`group:{id}` or `dest:{name}`), because one upload can cover a whole
   destination — several groups plus its lone files — and the poller has to recognise its own job.
   `checking` is the dedup pass that runs before a single byte moves (RULES, Network storage); without it the UI
   would sit silent while the NAS hashes hundreds of files. */
const uploadProgressStateSchema = z.object({
  scope: z.string(),
  /* what is being uploaded, said the way the board names it */
  label: z.string().optional(),
  groupId: z.string().optional(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  /* `archiving` is a montage's upload zipping the photos and the rushes, which moves gigabytes before a
     single byte reaches the NAS — without it the UI sits silent for minutes */
  state: z.enum(['archiving', 'checking', 'uploading', 'done', 'error', 'cancelled']),
  checked: z.number().optional(),
  skipped: z.number().optional(),
  error: z.string().optional(),
  items: z.array(uploadItemSchema).optional()
})

/* one place both sides name a montage's upload, so the poller cannot look for a scope nobody writes */
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
