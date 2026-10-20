import { z } from 'zod'
import { montageEntrySchema, montageLostSchema } from './montageEntry'
import { destinationSchema, manifestFileSchema, manifestGroupSchema } from './types'

const outputFactSchema = z.object({ exists: z.boolean(), size: z.number() })

const proxyFactSchema = z.object({
  state: z.enum(['ready', 'own', 'none']),
  play: z.string(),
  reason: z.string().optional()
})

const montageFactSchema = z.object({
  edit: z.boolean(),
  projectFiles: z.array(z.string()).optional(),
  film: z
    .object({
      size: z.number(),
      mtime: z.number(),
      seconds: z.number().nullable(),
      path: z.string()
    })
    .nullable(),
  baseName: z.string()
})

const remoteListingSchema = z.object({
  dirs: z.array(z.string()),
  sizes: z.record(z.string(), z.number().nullable()),
  at: z.number()
})

const scanResultSchema = z.object({
  added: z.number(),
  removed: z.number(),
  moved: z.number(),
  unchanged: z.boolean(),
  fileCount: z.number(),
  groupCount: z.number()
})

const importOutcomeSchema = z.object({
  added: z.array(z.string()),
  moved: z.array(z.object({ name: z.string(), from: z.string() })),
  there: z.number(),
  kept: z.array(z.string()),
  failed: z.array(z.string()),
  where: z.string()
})

const boardAnswerSchema = z.object({
  groups: z.array(manifestGroupSchema),
  looseFiles: z.array(manifestFileSchema).optional(),
  destinations: z.array(destinationSchema).optional(),
  outputs: z.record(z.string(), outputFactSchema).optional(),
  proxies: z.record(z.string(), proxyFactSchema).optional(),
  montages: z.record(z.string(), montageFactSchema).optional(),
  remote: remoteListingSchema.optional(),
  uploaded: z.number().optional(),
  skipped: z.number().optional(),
  scan: scanResultSchema.optional(),
  freed: z.object({ bytes: z.number(), files: z.number(), groupId: z.string() }).optional(),
  processCancelled: z.boolean().optional(),
  uploadCancelled: z.boolean().optional(),
  freedPlace: z
    .object({ place: z.string(), bytes: z.number(), files: z.number(), kept: z.number() })
    .optional(),
  storage: z
    .object({ dir: z.string(), montages: z.array(montageEntrySchema), lost: montageLostSchema })
    .optional(),
  storageProblem: z.string().optional(),
  imported: importOutcomeSchema.optional(),
  cameraCopied: z
    .object({
      camera: z.string(),
      state: z.enum(['done', 'gone', 'failed', 'copying', 'stopped']),
      copied: z.number(),
      skipped: z.number(),
      reason: z.string().optional(),
      unreadable: z.array(z.string()).optional()
    })
    .optional(),
  reset: z
    .object({ files: z.number(), jumps: z.number(), what: z.enum(['times', 'everything']) })
    .optional(),
  copied: z.object({ files: z.number(), passedOver: z.number() }).optional(),
  restored: z.array(z.object({ who: z.string(), files: z.number(), of: z.number() })).optional(),
  played: z.object({ filename: z.string() }).optional(),
  copiedBack: z.object({ copied: z.number(), skipped: z.number() }).optional(),
  fromBin: z.object({ back: z.number(), kept: z.array(z.string()) }).optional(),
  broughtBack: z
    .object({ filename: z.string(), original: z.boolean(), size: z.number() })
    .optional()
})

type BoardAnswer = z.infer<typeof boardAnswerSchema>
type ImportOutcome = z.infer<typeof importOutcomeSchema>
type OutputFact = z.infer<typeof outputFactSchema>
type ProxyFact = z.infer<typeof proxyFactSchema>
type ScanResult = z.infer<typeof scanResultSchema>
type MontageFact = z.infer<typeof montageFactSchema>

export { boardAnswerSchema, importOutcomeSchema, proxyFactSchema, montageFactSchema }
export type { BoardAnswer, ImportOutcome, OutputFact, ProxyFact, ScanResult, MontageFact }
