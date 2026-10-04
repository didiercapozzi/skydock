import { z } from 'zod'

const binFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
  mtime: z.number()
})

const binBatchSchema = z.object({
  folder: z.string(),
  from: z.enum(['fresh', 'montage', 'dropzone', 'camera', 'other']),
  camera: z.string().optional(),
  montage: z.string().optional(),
  dropzone: z.string().optional(),
  at: z.number(),
  files: z.array(binFileSchema)
})

const binAnswerSchema = z.object({ dir: z.string(), batches: z.array(binBatchSchema) })

type BinFile = z.infer<typeof binFileSchema>
type BinBatch = z.infer<typeof binBatchSchema>

export { binAnswerSchema }
export type { BinBatch, BinFile }
