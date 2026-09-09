import { z } from 'zod'

const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  mtime: z.number(),
  filename: z.string(),
  id: z.string().optional(),
  originalMtime: z.number().nullable().optional(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional()
})

const jumpFileRefSchema = z.object({
  id: z.string(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional()
})

const passengerSchema = z.object({
  firstname: z.string(),
  lastname: z.string(),
  email: z.string().optional()
})

const publishSchema = z.object({
  shareUrl: z.string()
})

const manifestJumpSchema = z.object({
  id: z.string(),
  label: z.string(),
  confirmed: z.boolean(),
  files: z.array(manifestFileSchema),
  processed: z.boolean().nullable().optional(),
  passenger: passengerSchema.optional(),
  publish: publishSchema.optional(),
  day: z.string()
})

const jumpsFileSchema = z.object({
  jumps: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      confirmed: z.boolean(),
      files: z.array(jumpFileRefSchema),
      processed: z.boolean().nullable().optional(),
      passenger: passengerSchema.optional(),
      publish: publishSchema.optional(),
      day: z.string()
    })
  )
})

const manifestStatusSchema = z.enum(['empty', 'proposed', 'confirmed', 'executed'])

const manifestSchema = z.object({
  version: z.number(),
  status: manifestStatusSchema,
  date: z.string(),
  startDatetime: z.string(),
  createdAt: z.string(),
  theory: z.array(manifestFileSchema),
  files: z.array(manifestFileSchema),
  jumps: z.array(manifestJumpSchema),
  cameraClockOffsetSeconds: z.number().nullable().optional()
})

type ManifestFile = z.infer<typeof manifestFileSchema>
type ManifestJump = z.infer<typeof manifestJumpSchema>
type ManifestPassenger = z.infer<typeof passengerSchema>
type ManifestPublish = z.infer<typeof publishSchema>
type ManifestStatus = z.infer<typeof manifestStatusSchema>
type Manifest = z.infer<typeof manifestSchema>
type JumpFileRef = z.infer<typeof jumpFileRefSchema>
type JumpsFile = z.infer<typeof jumpsFileSchema>

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
  JumpFileRef,
  JumpsFile,
  Manifest,
  ManifestFile,
  ManifestJump,
  ManifestPassenger,
  ManifestPublish,
  ManifestStatus,
  SystemStatus,
  TaskState,
  TaskStatus
}

export {
  jumpFileRefSchema,
  jumpsFileSchema,
  manifestFileSchema,
  manifestJumpSchema,
  manifestSchema,
  manifestStatusSchema,
  passengerSchema,
  publishSchema,
  systemStatusSchema,
  taskStateSchema,
  taskStatusSchema
}
