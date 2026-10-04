import { z } from 'zod'

const montageEntrySchema = z.object({
  folder: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  day: z.string(),
  videos: z.number(),
  photos: z.number(),
  uploadedAt: z.number(),
  shareUrl: z.string().optional(),
  film: z.string().optional(),
  photosZip: z.string().optional(),
  backup: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        dir: z.string(),
        size: z.number(),
        holds: z.array(z.enum(['videos', 'photos', 'film', 'project'])),
        zip: z.boolean()
      })
    )
    .optional(),
  emailed: z.object({ at: z.number(), to: z.string().optional() }).optional(),
  freedAt: z.number().optional(),
  files: z.array(z.object({ id: z.string(), filename: z.string(), mtime: z.number() })).optional()
})

const montageIndexSchema = z.object({
  version: z.literal(1),
  montages: z.array(montageEntrySchema)
})

const montageLostSchema = z.object({ folders: z.array(z.string()), links: z.array(z.string()) })

type MontageEntry = z.infer<typeof montageEntrySchema>
type MontageIndex = z.infer<typeof montageIndexSchema>
type MontageLost = z.infer<typeof montageLostSchema>

const lostOf = (lost: MontageLost | undefined, folder: string) =>
  lost?.folders.includes(folder) ? 'folder' : lost?.links.includes(folder) ? 'link' : null

export { lostOf, montageEntrySchema, montageIndexSchema, montageLostSchema }
export type { MontageEntry, MontageIndex, MontageLost }
