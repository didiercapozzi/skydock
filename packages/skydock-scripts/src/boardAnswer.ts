import { z } from 'zod'
import { montageEntrySchema, montageLostSchema } from './montageEntry'
import { destinationSchema, manifestFileSchema, manifestGroupSchema } from './types'

/* Everything the board may be answered with, and the only shape the server answers a change with:
   the jumps and the loose files always, what the disk says about each processed copy, which clips
   have a proxy and what each montage's folder holds — the per-file status and a montage's next step
   are computed from all of it, so answering with less leaves the board stale — and then whatever
   the change itself has to say. One schema for both sides, so the server cannot answer with a field
   the board would not read, nor the board wait for one the server never sends. */

const outputFactSchema = z.object({ exists: z.boolean(), size: z.number() })

/* `reason` is why the last try to make it failed; a clip with none and no reason is still waiting */
const proxyFactSchema = z.object({
  state: z.enum(['ready', 'own', 'none']),
  play: z.string(),
  reason: z.string().optional()
})

/* what a montage's folder holds, taken fresh every time — the film is rendered outside SkyDock, so
   nothing else can know it has appeared */
const montageFactSchema = z.object({
  project: z.boolean(),
  projectPath: z.string(),
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

/* what the storage holds, and when it was looked at, so the newest of several answers wins */
const remoteListingSchema = z.object({
  dirs: z.array(z.string()),
  sizes: z.record(z.string(), z.number().nullable()),
  at: z.number()
})

const montageNoteSchema = z.object({
  clips: z.number(),
  /* stills put in the bin, for a montage with no video to make its film of */
  photos: z.number().optional(),
  missingAssets: z.array(z.string()),
  opened: z.boolean().optional(),
  openCommand: z.string().optional(),
  openReason: z.string().optional()
})

const scanResultSchema = z.object({
  added: z.number(),
  removed: z.number(),
  moved: z.number(),
  unchanged: z.boolean(),
  fileCount: z.number(),
  groupCount: z.number()
})

/* what a drop from the computer came to */
const importOutcomeSchema = z.object({
  /* what is now where it was dropped, by name: a file new to the board and footage that was already
     on it and has joined a second jump are both, to whoever dropped it, added */
  added: z.array(z.string()),
  moved: z.array(z.object({ name: z.string(), from: z.string() })),
  there: z.number(),
  /* nothing happened to it and there is a reason, which is not the same thing as a failure */
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
  /* how an upload went: how many files were sent, and how many were already there */
  uploaded: z.number().optional(),
  skipped: z.number().optional(),
  montage: montageNoteSchema.optional(),
  scan: scanResultSchema.optional(),
  /* how much room freeing a montage gave back, and how many files */
  freed: z.object({ bytes: z.number(), files: z.number(), groupId: z.string() }).optional(),
  /* what was being processed was stopped on request */
  processCancelled: z.boolean().optional(),
  /* how much room freeing a dropzone gave back, how many files, and how many stayed */
  freedPlace: z
    .object({ place: z.string(), bytes: z.number(), files: z.number(), kept: z.number() })
    .optional(),
  /* the storage's list, as the change just wrote it — or why it could not be */
  storage: z
    .object({ dir: z.string(), montages: z.array(montageEntrySchema), lost: montageLostSchema })
    .optional(),
  storageProblem: z.string().optional(),
  imported: importOutcomeSchema.optional(),
  /* what came off a camera plugged in, and how its copy ended */
  cameraCopied: z
    .object({
      camera: z.string(),
      state: z.enum(['done', 'gone', 'failed', 'copying']),
      copied: z.number(),
      skipped: z.number(),
      reason: z.string().optional()
    })
    .optional(),
  /* Fresh files put back as scanned: how many files, in how many jumps */
  reset: z
    .object({ files: z.number(), jumps: z.number(), what: z.enum(['times', 'everything']) })
    .optional(),
  /* files copied into another jump: how many, and how many it already held */
  copied: z.object({ files: z.number(), passedOver: z.number() }).optional(),
  /* montages put back from the storage's list: whose, and how many of their files were found here */
  restored: z.array(z.object({ who: z.string(), files: z.number(), of: z.number() })).optional(),
  /* a clip handed to the machine's own player, which is now showing it */
  played: z.object({ filename: z.string() }).optional(),
  /* files asked back off a camera after this machine had given them back */
  copiedBack: z.object({ copied: z.number(), skipped: z.number() }).optional(),
  /* one file fetched back off the storage: whether what came back is the original or the copy that
     was delivered, which is all a dropzone ever sends */
  broughtBack: z
    .object({ filename: z.string(), original: z.boolean(), size: z.number() })
    .optional()
})

type BoardAnswer = z.infer<typeof boardAnswerSchema>
type ImportOutcome = z.infer<typeof importOutcomeSchema>
type MontageNote = z.infer<typeof montageNoteSchema>
type OutputFact = z.infer<typeof outputFactSchema>
type ProxyFact = z.infer<typeof proxyFactSchema>
type ScanResult = z.infer<typeof scanResultSchema>
type MontageFact = z.infer<typeof montageFactSchema>

export { boardAnswerSchema, importOutcomeSchema, proxyFactSchema, montageFactSchema }
export type {
  BoardAnswer,
  ImportOutcome,
  MontageNote,
  OutputFact,
  ProxyFact,
  ScanResult,
  MontageFact
}
