import { z } from 'zod'
import type { Manifest } from './types'

const originEntrySchema = z.object({
  from: z.string().optional(),
  md5: z.string().optional(),
  size: z.number(),
  at: z.number(),
  cut: z.tuple([z.number(), z.number()]).optional()
})

const originIndexSchema = z.object({
  version: z.literal(1),
  files: z.record(z.string(), originEntrySchema)
})

type OriginEntry = z.infer<typeof originEntrySchema>
type OriginIndex = z.infer<typeof originIndexSchema>

const worthReading = (index: OriginIndex, want: { from: string | undefined; size: number }) =>
  Object.values(index.files).some(
    (entry) => (want.from !== undefined && entry.from === want.from) || entry.size === want.size
  )

const alreadyUp = (index: OriginIndex, md5: string) => {
  const found = Object.entries(index.files).find(
    ([, entry]) => entry.md5 !== undefined && entry.md5.toLowerCase() === md5.toLowerCase()
  )
  return found ? { remotePath: found[0], entry: found[1] } : null
}

const sameSizeUnknown = (index: OriginIndex, size: number) =>
  Object.entries(index.files)
    .filter(([, entry]) => entry.md5 === undefined && entry.size === size)
    .map(([remotePath]) => remotePath)

const originsOf = (manifest: Manifest) => {
  const origins = new Map<string, { from?: string; cut?: [number, number] }>()
  for (const file of [...manifest.files, ...manifest.groups.flatMap((g) => g.files)]) {
    const own = file.copyOf ?? file.id
    if (own) origins.set(file.path, { from: own })
    const made = file.processed
    if (made)
      origins.set(made.path, {
        from: made.source.id ?? own,
        ...(made.source.cropStart != null && made.source.cropEnd != null
          ? { cut: [made.source.cropStart, made.source.cropEnd] as [number, number] }
          : {})
      })
  }
  return origins
}

export { alreadyUp, originIndexSchema, originsOf, sameSizeUnknown, worthReading }
export type { OriginEntry, OriginIndex }
