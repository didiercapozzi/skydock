import { z } from 'zod'

/* Free of node imports: the board reads these. What is on a camera plugged in — each file by where it
   is on the card, and how far it has got: not copied here yet, copied here, or on the storage too,
   which is the one that can be deleted from the camera. */
const cameraFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
  mtime: z.number(),
  state: z.enum(['missing', 'copied', 'stored'])
})

const cameraListingSchema = z.object({
  camera: z.string(),
  mount: z.string(),
  files: z.array(cameraFileSchema)
})

const camerasAnswerSchema = z.object({ cameras: z.array(cameraListingSchema) })

/* what deleting from a camera came to, with the cameras as they are after it */
const cameraDeletedSchema = camerasAnswerSchema.extend({
  deleted: z.object({ count: z.number(), bytes: z.number(), bins: z.array(z.string()) })
})

type CameraFile = z.infer<typeof cameraFileSchema>
type CameraListing = z.infer<typeof cameraListingSchema>

export { cameraDeletedSchema, camerasAnswerSchema }
export type { CameraFile, CameraListing }
