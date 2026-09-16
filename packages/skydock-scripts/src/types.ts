import { z } from 'zod'

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().optional(),
  originalMtime: z.number().nullable().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  destination: z.string().optional(),
  keep: z.boolean().optional(),
  processedPath: z.string().optional()
})

const groupFileRefSchema = z.object({
  id: z.string(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional(),
  keep: z.boolean().optional()
})

const passengerSchema = z.object({
  firstname: z.string(),
  lastname: z.string(),
  email: z.string().optional()
})

const publishSchema = z.object({
  shareUrl: z.string()
})

const manifestGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  confirmed: z.boolean(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional(),
  passenger: passengerSchema.optional(),
  publish: publishSchema.optional(),
  day: z.string(),
  destination: z.string().optional()
})

const groupsFileSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      confirmed: z.boolean(),
      files: z.array(groupFileRefSchema),
      processed: z.boolean().nullable().optional(),
      passenger: passengerSchema.optional(),
      publish: publishSchema.optional(),
      day: z.string(),
      destination: z.string().optional()
    })
  )
})

const destinationSchema = z.object({
  name: z.string(),
  /* the NAS folder this dropzone uploads into; absent means `{defaultFolder}/{name}` */
  path: z.string().optional(),
  /* the share link of that folder, kept so the board can hand it out without opening a group */
  shareUrl: z.string().optional()
})

const destinationsSchema = z.array(destinationSchema)

const manifestStatusSchema = z.enum(['empty', 'proposed', 'confirmed', 'executed'])

const manifestSchema = z.object({
  version: z.number(),
  status: manifestStatusSchema,
  date: z.string(),
  startDatetime: z.string(),
  createdAt: z.string(),
  theory: z.array(manifestFileSchema),
  files: z.array(manifestFileSchema),
  groups: z.array(manifestGroupSchema),
  destinations: destinationsSchema.optional(),
  cameraClockOffsetSeconds: z.number().nullable().optional()
})

type ManifestFile = z.infer<typeof manifestFileSchema>
type ManifestGroup = z.infer<typeof manifestGroupSchema>
type ManifestPassenger = z.infer<typeof passengerSchema>
type ManifestPublish = z.infer<typeof publishSchema>
type ManifestStatus = z.infer<typeof manifestStatusSchema>
type Manifest = z.infer<typeof manifestSchema>
type GroupFileRef = z.infer<typeof groupFileRefSchema>
type GroupsFile = z.infer<typeof groupsFileSchema>
type Destination = z.infer<typeof destinationSchema>

const destinationCreationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(64, 'Name must be at most 64 characters')
})

const taskStateSchema = z.enum(['idle', 'running', 'done', 'error'])

const taskStatusSchema = z.object({
  state: taskStateSchema,
  message: z.string().optional(),
  total: z.number().optional(),
  done: z.number().optional(),
  processing: z.array(z.string()).optional(),
  startedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  error: z.string().optional()
})

const systemStatusSchema = z.object({
  scan: taskStatusSchema,
  execute: taskStatusSchema,
  process: taskStatusSchema
})

type TaskState = z.infer<typeof taskStateSchema>

type TaskStatus = z.infer<typeof taskStatusSchema>

type SystemStatus = z.infer<typeof systemStatusSchema>

export type {
  Destination,
  GroupFileRef,
  GroupsFile,
  Manifest,
  ManifestFile,
  ManifestGroup,
  ManifestPassenger,
  ManifestPublish,
  ManifestStatus,
  SystemStatus,
  TaskState,
  TaskStatus
}

export {
  destinationCreationSchema,
  destinationSchema,
  destinationsSchema,
  groupFileRefSchema,
  groupsFileSchema,
  manifestFileSchema,
  manifestGroupSchema,
  manifestSchema,
  manifestStatusSchema,
  passengerSchema,
  publishSchema,
  systemStatusSchema,
  taskStateSchema,
  taskStatusSchema
}
