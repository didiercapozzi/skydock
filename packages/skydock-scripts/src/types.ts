import { z } from 'zod'

const fraction = z
  .number()
  .refine((n) => Number.isFinite(n), 'must be a number')
  .transform((n) => Math.min(1, Math.max(0, n)))

const frameCropSchema = z.object({
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
  fill: z.literal('blur').optional()
})

const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])

const jumpMomentsSchema = z.object({
  exit: z.number(),
  opening: z.number().optional(),
  canopy: z.number().optional(),
  landing: z.number().optional()
})

const jumpTrackSchema = z.object({
  seconds: z.number(),
  rate: z.number(),
  force: z.array(z.number()),
  altitude: z.array(z.number().nullable()).optional(),
  speed: z.array(z.number().nullable()).optional()
})

const processedRecordSchema = z.object({
  path: z.string(),
  size: z.number(),
  at: z.number(),
  source: z.object({
    id: z.string().optional(),
    size: z.number(),
    mtime: z.number(),
    cropStart: z.number().nullable().optional(),
    cropEnd: z.number().nullable().optional(),
    frame: frameCropSchema.nullable().optional(),
    rotation: rotationSchema.nullable().optional()
  })
})

const sendPartSchema = z.enum(['videos', 'photos', 'film', 'project'])

const uploadedRecordSchema = z.object({
  remotePath: z.string(),
  md5: z.string(),
  size: z.number(),
  localPath: z.string(),
  at: z.number(),
  holds: z.array(sendPartSchema).optional()
})

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().optional(),
  copyOf: z.string().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  frame: frameCropSchema.nullable().optional(),
  rotation: rotationSchema.nullable().optional(),
  destination: z.string().optional(),
  processed: processedRecordSchema.optional(),
  uploaded: uploadedRecordSchema.optional(),
  proxy: z.string().optional(),
  moments: jumpMomentsSchema.nullable().optional(),
  foundMoments: jumpMomentsSchema.optional(),
  freed: z.boolean().optional()
})

const groupFileRefSchema = z.object({
  id: z.string(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  frame: frameCropSchema.nullable().optional(),
  rotation: rotationSchema.nullable().optional()
})

const passengerSchema = z.object({
  firstname: z.string(),
  lastname: z.string()
})

const publishSchema = z.object({
  shareUrl: z.string()
})

const montageUploadSchema = z.object({
  at: z.number(),
  shareUrl: z.string().optional(),
  film: uploadedRecordSchema.optional(),
  photos: uploadedRecordSchema.optional(),
  rushes: uploadedRecordSchema.optional(),
  originals: z.array(uploadedRecordSchema).optional(),
  photoFiles: z.array(uploadedRecordSchema).optional(),
  sent: z
    .array(
      z.object({
        name: z.string(),
        holds: z.array(sendPartSchema),
        to: z.array(z.string()),
        size: z.number().optional(),
        zip: z.boolean().optional(),
        contents: z.array(z.string()).optional()
      })
    )
    .optional()
})

const manifestGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  name: z.string().optional(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional(),
  passenger: passengerSchema.optional(),
  publish: publishSchema.optional(),
  uploaded: montageUploadSchema.optional(),
  emailed: z.object({ at: z.number(), to: z.string().optional() }).optional(),
  freed: z.object({ at: z.number(), bytes: z.number() }).optional(),
  freedBefore: z.object({ at: z.number(), bytes: z.number() }).optional(),
  day: z.string(),
  destination: z.string().optional(),
  montageJump: z.boolean().optional()
})

const groupsFileSchema = z.object({
  groups: z.array(manifestGroupSchema.extend({ files: z.array(groupFileRefSchema) }))
})

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const sendPlanSchema = z.object({
  zips: z
    .array(
      z.object({ ending: slugSchema.or(z.literal('')), parts: z.array(sendPartSchema).min(1) })
    )
    .refine((zips) => new Set(zips.map((zip) => zip.ending)).size === zips.length),
  placed: z.record(z.string(), z.array(z.string())),
  inRoot: z.array(z.string()).optional(),
  folder: slugSchema.optional()
})

const destinationSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  shareUrl: z.string().optional()
})

const destinationsSchema = z.array(destinationSchema)

const manifestSchema = z.object({
  version: z.number(),
  createdAt: z.string(),
  files: z.array(manifestFileSchema),
  groups: z.array(manifestGroupSchema),
  destinations: destinationsSchema.optional()
})

type SendPart = z.infer<typeof sendPartSchema>
type SendPlan = z.infer<typeof sendPlanSchema>
type FrameCrop = z.infer<typeof frameCropSchema>
type JumpMoments = z.infer<typeof jumpMomentsSchema>
type JumpTrack = z.infer<typeof jumpTrackSchema>
type Rotation = z.infer<typeof rotationSchema>
type ManifestFile = z.infer<typeof manifestFileSchema>
type ManifestGroup = z.infer<typeof manifestGroupSchema>
type ManifestPassenger = z.infer<typeof passengerSchema>
type Manifest = z.infer<typeof manifestSchema>
type GroupsFile = z.infer<typeof groupsFileSchema>
type Destination = z.infer<typeof destinationSchema>

export type {
  Destination,
  FrameCrop,
  JumpMoments,
  JumpTrack,
  GroupsFile,
  Manifest,
  ManifestFile,
  ManifestGroup,
  ManifestPassenger,
  Rotation,
  SendPart,
  SendPlan
}

export {
  frameCropSchema,
  rotationSchema,
  sendPlanSchema,
  destinationSchema,
  groupsFileSchema,
  jumpMomentsSchema,
  jumpTrackSchema,
  manifestFileSchema,
  manifestGroupSchema,
  manifestSchema
}
