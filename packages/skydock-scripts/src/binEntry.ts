import { z } from 'zod'

/* Free of node imports: the board reads these. What the bin holds, one batch per time something was
   put aside — files from Fresh files or out of a montage, or a camera's files once deleted from its
   card — each file by where it is in the bin. */
const binFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
  mtime: z.number()
})

const binBatchSchema = z.object({
  /* its folder in the bin, which is what it is known by */
  folder: z.string(),
  from: z.enum(['fresh', 'montage', 'dropzone', 'camera', 'other']),
  /* the camera it came off, for a camera's files */
  camera: z.string().optional(),
  /* the montage it was taken out of, as its folder is named */
  montage: z.string().optional(),
  /* the dropzone it was taken out of, as its folder is named */
  dropzone: z.string().optional(),
  /* when it was put aside */
  at: z.number(),
  files: z.array(binFileSchema)
})

const binAnswerSchema = z.object({ dir: z.string(), batches: z.array(binBatchSchema) })

type BinFile = z.infer<typeof binFileSchema>
type BinBatch = z.infer<typeof binBatchSchema>

export { binAnswerSchema }
export type { BinBatch, BinFile }
