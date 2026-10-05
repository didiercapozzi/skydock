import { z } from 'zod'

const cameraFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
  mtime: z.number(),
  state: z.enum(['missing', 'copied', 'binned', 'stored'])
})

const cameraListingSchema = z.object({
  camera: z.string(),
  mount: z.string(),
  key: z.string().default(''),
  over: z.enum(['drive', 'mtp']),
  deletable: z.boolean(),
  looking: z.boolean(),
  files: z.array(cameraFileSchema)
})

const camerasAnswerSchema = z.object({ cameras: z.array(cameraListingSchema) })

const cameraDeletedSchema = camerasAnswerSchema.extend({
  deleted: z.object({
    count: z.number(),
    bytes: z.number(),
    bins: z.array(z.string()),
    stayed: z.array(z.object({ file: z.string(), why: z.string() })).optional()
  })
})

type CameraFile = z.infer<typeof cameraFileSchema>
type CameraListing = z.infer<typeof cameraListingSchema>

export { cameraDeletedSchema, camerasAnswerSchema }
export type { CameraFile, CameraListing }
