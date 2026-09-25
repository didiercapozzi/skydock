import { z } from 'zod'

/* What the storage's list of montages holds (see montageIndex.ts) — kept apart, free of node, so the
   board can read the list it is sent. */

const montageEntrySchema = z.object({
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
  freedAt: z.number().optional(),
  /* Which files the tandem is made of — each by what it contains, which is what a file is known by
     whatever it is called and wherever it sits — and the time it was given, which may be one a
     person set right. It is what lets the tandem be put back on a board that has forgotten it. */
  files: z.array(z.object({ id: z.string(), filename: z.string(), mtime: z.number() })).optional()
})

const montageIndexSchema = z.object({
  version: z.literal(1),
  tandems: z.array(montageEntrySchema)
})

/* What the storage no longer holds of the montages its list names, asked of the storage itself:
   folders it does not have any more, and folders whose link it no longer honours — revoked, or
   expired. The entries stay on the list, since whether a passenger was emailed and that a montage
   was freed are said nowhere else; they are only shown for what they now are. */
const montageLostSchema = z.object({ folders: z.array(z.string()), links: z.array(z.string()) })

type MontageEntry = z.infer<typeof montageEntrySchema>
type MontageIndex = z.infer<typeof montageIndexSchema>
type MontageLost = z.infer<typeof montageLostSchema>

/* what the storage no longer holds of one montage, by its folder: the folder itself, or only its link */
const lostOf = (lost: MontageLost | undefined, folder: string) =>
  lost?.folders.includes(folder) ? 'folder' : lost?.links.includes(folder) ? 'link' : null

export { lostOf, montageEntrySchema, montageIndexSchema, montageLostSchema }
export type { MontageEntry, MontageIndex, MontageLost }
