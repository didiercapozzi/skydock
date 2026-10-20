import { z } from 'zod'
import { proxyFactSchema, montageFactSchema } from './boardAnswer'
import { jumpMomentsSchema } from './types'

const workSchema = z.enum(['process', 'proxy', 'moments'])

const jobTypeSchema = z.enum([
  'free',
  'free-place',
  'scan',
  'copy-back',
  'bin',
  'trash',
  'template',
  'bring',
  'camera-delete',
  'import',
  'proxy',
  'moments',
  'process',
  'camera-copy',
  'upload',
  'render'
])

const jobRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  at: z.enum(['later', 'now', 'done', 'skipped', 'failed']),
  part: z.number().optional(),
  phase: z.string().optional(),
  note: z.string().optional(),
  to: z.string().optional()
})

const jobOutcomeSchema = z.object({
  state: z.enum(['done', 'gone', 'stopped', 'failed']),
  copied: z.number(),
  skipped: z.number(),
  unreadable: z.array(z.string()).optional()
})

const jobRowPatchSchema = jobRowSchema.partial().required({ key: true })

const liveEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    work: workSchema,
    fileId: z.string(),
    percent: z.number()
  }),
  z.object({
    kind: z.literal('file-done'),
    work: workSchema,
    fileId: z.string(),
    ok: z.boolean(),
    proxy: z.object({ path: z.string(), fact: proxyFactSchema }).optional(),
    moments: jumpMomentsSchema.nullable().optional()
  }),
  z.object({
    kind: z.literal('montage'),
    groupId: z.string(),
    who: z.string(),
    fact: montageFactSchema,
    rendered: z.boolean()
  }),
  z.object({
    kind: z.literal('board'),
    stamp: z.string()
  }),
  z.object({
    kind: z.literal('disk'),
    free: z.number(),
    total: z.number(),
    level: z.enum(['ok', 'low', 'full'])
  }),
  z.object({
    kind: z.literal('job'),
    id: z.string(),
    type: jobTypeSchema,
    label: z.string(),
    stage: z.enum(['checking', 'working', 'done', 'failed']),
    done: z.number(),
    total: z.number(),
    name: z.string().optional(),
    reason: z.string().optional(),
    phase: z.string().optional(),
    rows: z.array(jobRowSchema).optional(),
    row: jobRowPatchSchema.optional(),
    outcome: jobOutcomeSchema.optional(),
    groupIds: z.array(z.string()).optional(),
    destinations: z.array(z.string()).optional()
  }),
  z.object({
    kind: z.literal('cameras'),
    mounted: z.array(
      z.object({
        camera: z.string(),
        mount: z.string(),
        over: z.enum(['drive', 'mtp']),
        key: z.string().default(''),
        known: z.boolean().default(false),
        auto: z.boolean().default(false),
        fresh: z.number().nullable().default(null)
      })
    ),
    known: z
      .array(
        z.object({ key: z.string(), name: z.string(), auto: z.boolean(), lastSeen: z.number() })
      )
      .default([]),
    prompts: z.array(z.string()).default([])
  })
])

type LiveEvent = z.infer<typeof liveEventSchema>

type JobRow = z.infer<typeof jobRowSchema>
type JobRowPatch = z.infer<typeof jobRowPatchSchema>

const mergeRow = (rows: JobRow[], patch: JobRowPatch) =>
  rows.some((row) => row.key === patch.key)
    ? rows.map((row) => (row.key === patch.key ? { ...row, ...patch } : row))
    : [...rows, { name: patch.key, size: 0, at: 'later' as const, ...patch }]

export {
  jobOutcomeSchema,
  jobRowPatchSchema,
  jobRowSchema,
  jobTypeSchema,
  liveEventSchema,
  mergeRow,
  workSchema
}
export type { JobRow, JobRowPatch, LiveEvent }
