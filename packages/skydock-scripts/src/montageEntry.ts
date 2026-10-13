import { z } from 'zod'
import { parentOf } from './paths'
import type { ManifestGroup } from './types'

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

const folderOfUpload = (record: NonNullable<ManifestGroup['uploaded']>) => {
  const withFilm = record.sent?.find((item) => item.holds.includes('film'))
  const first = withFilm?.to[0] ?? record.sent?.[0]?.to[0]
  if (first) return first
  const sent = record.film ?? record.photos
  return sent ? parentOf(sent.remotePath) : null
}

export { folderOfUpload, lostOf, montageEntrySchema, montageIndexSchema, montageLostSchema }
export type { MontageEntry, MontageIndex, MontageLost }
