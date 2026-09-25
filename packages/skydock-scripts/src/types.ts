import { z } from 'zod'

/* The part of the picture to keep, as fractions of the whole rather than pixels. Fractions because
   the rectangle is drawn on the proxy — a 640-wide copy of a 4K clip — and has to mean the same
   thing on the clip itself, whatever either one's size. A mount in the corner of the frame is the
   reason this exists: the obstacle is cut away and what is left keeps the shape it had.

   Absent means the whole frame, which is not the same as a rectangle covering all of it: the whole
   frame is copied as it is, while any rectangle at all has to be encoded again. */
/* Clamped rather than rejected. A fraction is arrived at by dividing pixels by pixels, so a hair
   over 1 is an ordinary result of floating point rather than a broken value — and refusing it here
   would refuse the whole jumps file with it. Nothing is lost by pulling it back into range. */
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
/* How far the picture is turned clockwise, for a camera mounted sideways or upside down. Absent
   is as shot. */
const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])

/* Where the jump is in a clip, in seconds from its start: the exit always, the canopy and the
   ground when the clip goes that far. Found from what the camera felt, and correctable by hand —
   it decides where the music starts, so it is never beyond argument. */
const jumpMomentsSchema = z.object({
  exit: z.number(),
  opening: z.number().optional(),
  canopy: z.number().optional(),
  landing: z.number().optional()
})

/* The same jump as a series, twice a second from the clip's first frame to its last: what the
   camera felt in gravities, and — only when a camera was told where it was — how high it was in
   metres and how fast it was moving in kilometres an hour. A moment the satellites had nothing to
   say about is a gap, never a line ruled across it. */
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

/* What a montage has to send: its original videos, its photos, the film and the editing project. */
const sendPartSchema = z.enum(['videos', 'photos', 'film', 'project'])

/* What actually travelled to the NAS, proved equal on both sides by md5. Only the upload path
   writes this: a folder listing can say a file is gone, never that it is the right file. */
const uploadedRecordSchema = z.object({
  remotePath: z.string(),
  md5: z.string(),
  size: z.number(),
  /* which processed copy went up — re-processing writes a new one and invalidates this */
  localPath: z.string(),
  at: z.number(),
  /* for a zip, what it holds — its videos under videos/, its photos under photos/. A zip recorded
     without it is an older one: the videos at its top, or the photos alone. */
  holds: z.array(sendPartSchema).optional()
})

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().optional(),
  /* Set on a copy: the identity of the file it is a copy of. A clip two jumps share — the plane,
     the exit, the group photo — is one original on the disk, and each jump it is in holds an entry
     of its own for it, with its own trim, time, processed copy and upload. The first entry carries
     the identity its contents give it; every further one is a copy, with an identity of its own
     and this to say what it is of. Nothing on the disk is doubled. */
  copyOf: z.string().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  frame: frameCropSchema.nullable().optional(),
  rotation: rotationSchema.nullable().optional(),
  /* set only on a file belonging to no jump — it is what makes it a lone file */
  destination: z.string().optional(),
  processed: processedRecordSchema.optional(),
  uploaded: uploadedRecordSchema.optional(),
  /* the small all-intra copy the crop bar scrubs against and the editor opens on, or the file
     itself when it is already small enough to be its own proxy */
  proxy: z.string().optional(),
  /* Where the jump is in this clip, as the camera measured it: seconds to the exit, the canopy and
     the ground. `null` is the answer for a clip that shows none of it — ground footage, or a camera
     that writes nothing down — and it is kept, so nothing is asked twice. */
  moments: jumpMomentsSchema.nullable().optional(),
  /* deleted from this machine once the storage was proved to hold it — the record stays */
  freed: z.boolean().optional()
})

/* groups.json holds references, not copies: an id plus whatever this jump changed about the file */
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

/* The editing project written for this montage, and the template it came from — kept because the
   template can be replaced later, and a film already handed over should still say what made it. */
const montageRecordSchema = z.object({
  projectPath: z.string(),
  filmPath: z.string(),
  template: z.string(),
  clips: z.number(),
  at: z.number()
})

/* What was handed over, and to where. The film and the archives are not files off a camera, so
   their state cannot ride on the per-file records — it belongs to the montage. */
const montageUploadSchema = z.object({
  at: z.number(),
  shareUrl: z.string().optional(),
  film: uploadedRecordSchema.optional(),
  photos: uploadedRecordSchema.optional(),
  rushes: uploadedRecordSchema.optional(),
  /* the originals kept as plain files rather than one zip, with the film's copy if it went too */
  originals: z.array(uploadedRecordSchema).optional(),
  /* the photos sent as plain files rather than in a zip */
  photoFiles: z.array(uploadedRecordSchema).optional(),
  /* Every item that went up and every folder it went to. The fields above are each part's first
     place, which is what is proved and freed against; this is the whole of where things went. */
  sent: z
    .array(z.object({ name: z.string(), holds: z.array(sendPartSchema), to: z.array(z.string()) }))
    .optional()
})

const manifestGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  /* What someone called the jump, shown instead of its place among the jumps. Only ever shown: a file's
     name comes from the passenger or the dropzone, so naming a jump can never rename what is
     delivered. */
  name: z.string().optional(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional(),
  passenger: passengerSchema.optional(),
  publish: publishSchema.optional(),
  montage: montageRecordSchema.optional(),
  uploaded: montageUploadSchema.optional(),
  /* everything of it deleted from this machine, bar the project, once the storage held it all */
  freed: z.object({ at: z.number(), bytes: z.number() }).optional(),
  day: z.string(),
  destination: z.string().optional(),
  /* A jump of a montage: a film made for someone, named once. It belongs to no destination — where
     its film and its backups go is chosen when it is uploaded. (`montage` is its editing project.) */
  montageJump: z.boolean().optional()
})

const groupsFileSchema = z.object({
  groups: z.array(manifestGroupSchema.extend({ files: z.array(groupFileRefSchema) }))
})

/* a name made of lowercase letters, digits and single dashes: a zip's ending, a project folder */
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/* How a montage goes up, in two steps (RULES, Uploading a montage): the zips made of its parts, each
   named by its ending — none at all for one of them — and which destinations each item is put in. An item is named by its key:
   `zip:<ending>` for a zip, and the part itself when it goes as it is. The same item can go to several
   destinations, each either straight into its folder or into the project folder inside it. */
const sendPlanSchema = z.object({
  zips: z
    .array(
      z.object({ ending: slugSchema.or(z.literal('')), parts: z.array(sendPartSchema).min(1) })
    )
    .refine((zips) => new Set(zips.map((zip) => zip.ending)).size === zips.length),
  placed: z.record(z.string(), z.array(z.string())),
  /* the destinations whose items go straight into their folder rather than the project folder */
  inRoot: z.array(z.string()).optional(),
  /* the project folder, when it is not the one named after the montage */
  folder: slugSchema.optional()
})

const destinationSchema = z.object({
  name: z.string(),
  /* the NAS folder this dropzone uploads into; absent means none has been picked yet */
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
  sendPartSchema,
  sendPlanSchema,
  montageUploadSchema,
  frameCropSchema,
  destinationSchema,
  destinationsSchema,
  groupFileRefSchema,
  groupsFileSchema,
  jumpMomentsSchema,
  jumpTrackSchema,
  manifestFileSchema,
  manifestGroupSchema,
  manifestSchema,
  montageRecordSchema,
  passengerSchema,
  processedRecordSchema,
  publishSchema,
  rotationSchema,
  uploadedRecordSchema
}
