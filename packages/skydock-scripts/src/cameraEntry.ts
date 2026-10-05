import { z } from 'zod'

/* Free of node imports: the board reads these. What is on a camera plugged in — each file by where it
   is on the card, and how far it has got: not copied here yet, copied here, copied here and then put
   in the bin, or on the storage too — the last two are what can be deleted from the camera. */
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
  /* which camera it is across plugs — what its page is addressed by */
  key: z.string().default(''),
  /* how it hands its files over: as a drive the machine mounted, or by MTP — a camera with no
     drive to offer, read a request at a time and so slower than the same card in a reader */
  over: z.enum(['drive', 'mtp']),
  /* Whether files can be taken off it from here. Deleting proves each file against the storage by
     reading it through, byte for byte, which needs the camera readable as files; a camera read
     through KDE is copied off and listed, and its files are deleted on the camera itself. */
  deletable: z.boolean(),
  /* Its files are still being gone over, and more are to come. A camera read through KDE is listed
     from what its copy found, and a card that is still being copied has only been found so far. */
  looking: z.boolean(),
  files: z.array(cameraFileSchema)
})

const camerasAnswerSchema = z.object({ cameras: z.array(cameraListingSchema) })

/* what deleting from a camera came to, with the cameras as they are after it */
const cameraDeletedSchema = camerasAnswerSchema.extend({
  deleted: z.object({
    count: z.number(),
    bytes: z.number(),
    bins: z.array(z.string()),
    /* files that stayed on the card, and why — the others went all the same */
    stayed: z.array(z.object({ file: z.string(), why: z.string() })).optional()
  })
})

type CameraFile = z.infer<typeof cameraFileSchema>
type CameraListing = z.infer<typeof cameraListingSchema>

export { cameraDeletedSchema, camerasAnswerSchema }
export type { CameraFile, CameraListing }
