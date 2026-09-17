import { z } from 'zod'

/* The part of the picture to keep, as fractions of the whole rather than pixels. Fractions because
   the rectangle is drawn on the proxy — a 640-wide copy of a 4K clip — and has to mean the same
   thing on the clip itself, whatever either one's size. A mount in the corner of the frame is the
   reason this exists: the obstacle is cut away and what is left keeps the shape it had.

   Absent means the whole frame, which is not the same as a rectangle covering all of it: the whole
   frame is copied as it is, while any rectangle at all has to be encoded again. */
/* Clamped rather than rejected. A fraction is arrived at by dividing pixels by pixels, so a hair
   over 1 is an ordinary result of floating point rather than a broken value — and refusing it here
   used to take the whole jumps file down with it. Nothing is lost by pulling it back into range. */
const fraction = z
  .number()
  .refine((n) => Number.isFinite(n), 'must be a number')
  .transform((n) => Math.min(1, Math.max(0, n)))

const frameCropSchema = z.object({
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction
})

/* What processing wrote for this file, and the exact inputs that produced it. Change any of those
   inputs — recrop it, shift its time, replace the bytes — and the copy on disk is no longer this
   file's copy, which is how the board knows a file dropped back to `local` without anyone having
   to remember to clear a flag. */
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
    frame: frameCropSchema.nullable().optional()
  })
})

/* What actually travelled to the NAS, proved equal on both sides by md5. Only the upload path
   writes this: a folder listing can say a file is gone, never that it is the right file. */
const uploadedRecordSchema = z.object({
  remotePath: z.string(),
  md5: z.string(),
  size: z.number(),
  /* which processed copy went up — re-processing writes a new one and invalidates this */
  localPath: z.string(),
  at: z.number()
})

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  frame: frameCropSchema.nullable().optional(),
  /* set only on a file belonging to no jump — it is what makes it a lone file */
  destination: z.string().optional(),
  processed: processedRecordSchema.optional(),
  uploaded: uploadedRecordSchema.optional(),
  /* the small all-intra copy the crop bar scrubs against and the editor opens on, or the file
     itself when it is already small enough to be its own proxy */
  proxy: z.string().optional()
})

/* groups.json holds references, not copies: an id plus whatever this jump changed about the file */
const groupFileRefSchema = z.object({
  id: z.string(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  frame: frameCropSchema.nullable().optional()
})

const passengerSchema = z.object({
  firstname: z.string(),
  lastname: z.string()
})

const publishSchema = z.object({
  shareUrl: z.string()
})

/* The editing project written for this tandem, and the template it came from — kept because the
   template can be replaced later, and a film already handed over should still say what made it. */
const montageRecordSchema = z.object({
  projectPath: z.string(),
  filmPath: z.string(),
  template: z.string(),
  clips: z.number(),
  at: z.number()
})

/* What was handed over, and to where. The film and the archives are not files off a camera, so
   their state cannot ride on the per-file records — it belongs to the tandem. */
const deliveredRecordSchema = z.object({
  at: z.number(),
  shareUrl: z.string().optional(),
  film: uploadedRecordSchema.optional(),
  photos: uploadedRecordSchema.optional(),
  rushes: uploadedRecordSchema.optional()
})

const manifestGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional(),
  passenger: passengerSchema.optional(),
  publish: publishSchema.optional(),
  montage: montageRecordSchema.optional(),
  delivered: deliveredRecordSchema.optional(),
  day: z.string(),
  destination: z.string().optional()
})

const groupsFileSchema = z.object({
  groups: z.array(manifestGroupSchema.extend({ files: z.array(groupFileRefSchema) }))
})

const destinationSchema = z.object({
  name: z.string(),
  /* the NAS folder this dropzone uploads into; absent means `{defaultFolder}/{name}` */
  path: z.string().optional(),
  /* the share link of that folder, kept so the board can hand it out without opening a group */
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

type FrameCrop = z.infer<typeof frameCropSchema>
type ManifestFile = z.infer<typeof manifestFileSchema>
type ManifestGroup = z.infer<typeof manifestGroupSchema>
type ManifestPassenger = z.infer<typeof passengerSchema>
type Manifest = z.infer<typeof manifestSchema>
type GroupsFile = z.infer<typeof groupsFileSchema>
type Destination = z.infer<typeof destinationSchema>

export type {
  Destination,
  FrameCrop,
  GroupsFile,
  Manifest,
  ManifestFile,
  ManifestGroup,
  ManifestPassenger
}

export {
  deliveredRecordSchema,
  frameCropSchema,
  destinationSchema,
  destinationsSchema,
  groupFileRefSchema,
  groupsFileSchema,
  manifestFileSchema,
  manifestGroupSchema,
  manifestSchema,
  montageRecordSchema,
  passengerSchema,
  processedRecordSchema,
  publishSchema,
  uploadedRecordSchema
}
