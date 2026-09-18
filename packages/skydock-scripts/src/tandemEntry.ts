import { z } from 'zod'

/* What the storage's list of tandems holds (see tandemIndex.ts) — kept apart, free of node, so the
   board can read the list it is sent. */

const tandemEntrySchema = z.object({
  /* the passenger's folder on the storage — what identifies the tandem */
  folder: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  /* the day of the jump, as the board writes it: 01.08.2026 */
  day: z.string(),
  videos: z.number(),
  photos: z.number(),
  uploadedAt: z.number(),
  shareUrl: z.string().optional(),
  film: z.string().optional(),
  photosZip: z.string().optional(),
  /* the originals: the backup zip, or the folder they were sent into as plain files */
  backup: z.string().optional(),
  emailed: z.object({ at: z.number(), to: z.string().optional() }).optional(),
  /* freed from the machine that made it: the storage is the only copy since */
  freedAt: z.number().optional()
})

const tandemIndexSchema = z.object({
  version: z.literal(1),
  tandems: z.array(tandemEntrySchema)
})

type TandemEntry = z.infer<typeof tandemEntrySchema>
type TandemIndex = z.infer<typeof tandemIndexSchema>

export { tandemEntrySchema, tandemIndexSchema }
export type { TandemEntry, TandemIndex }
