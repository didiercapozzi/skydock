import { z } from 'zod'

/* What a folder on the storage holds, as the board is told it. Kept apart from the code that asks
   the storage, so the board can read the answer without carrying any of that with it. */
const storageFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number().nullable(),
  mtime: z.number().nullable(),
  /* when it was shot, as its name says — every file SkyDock delivers is named after that */
  shot: z.number().nullable(),
  kind: z.enum(['video', 'photo', 'other']),
  /* the link the storage hands this one file out by, when it has one: anybody holding it can fetch
     the file, and nothing else about the folder */
  shareUrl: z.string().nullable()
})

const storageFolderSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), dir: z.string(), files: z.array(storageFileSchema) }),
  z.object({ ok: z.literal(false), reason: z.string() })
])

type StorageFile = z.infer<typeof storageFileSchema>
type StorageFolder = z.infer<typeof storageFolderSchema>

export { storageFolderSchema }
export type { StorageFile, StorageFolder }
