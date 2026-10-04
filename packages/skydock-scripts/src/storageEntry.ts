import { z } from 'zod'

const storageFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number().nullable(),
  mtime: z.number().nullable(),
  shot: z.number().nullable(),
  kind: z.enum(['video', 'photo', 'other']),
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
