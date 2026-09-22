import { z } from 'zod'
import type { Manifest } from './types'

/* What the storage's list of origins holds (see originIndex.ts) — kept apart, free of node, so the
   board can read the list it is sent. */

const originEntrySchema = z.object({
  /* What the delivered file was made from: the content id of the original, which is what a file is
     known by whatever it is called and wherever it sits. A film cut from a whole jump, or a zip of
     a dozen originals, came from no single file and says nothing here — what it weighs is still
     worth knowing. */
  from: z.string().optional(),
  /* What the file is, and what it weighs. The digest is proved on both sides when SkyDock sends a
     file, and asked of the storage later for one that was already up there when it first looked —
     a file only seen in a listing has its size and no digest yet, because nothing is hashed until
     knowing would decide something. */
  md5: z.string().optional(),
  size: z.number(),
  at: z.number(),
  /* the part of the original it keeps, when it keeps a part: the same footage cut differently is
     not the same file, and this says so without anybody having to open either */
  cut: z.tuple([z.number(), z.number()]).optional()
})

const originIndexSchema = z.object({
  version: z.literal(1),
  /* by the full path it sits at on the storage, so one list serves every folder SkyDock delivers
     into, wherever they are */
  files: z.record(z.string(), originEntrySchema)
})

type OriginEntry = z.infer<typeof originEntrySchema>
type OriginIndex = z.infer<typeof originIndexSchema>

/* Whether it is worth reading a file at all before sending it: the storage either holds something
   made from the same original, or something that weighs exactly the same and might be it. Reading
   is the expensive half, and most files are neither. */
const worthReading = (index: OriginIndex, want: { from: string | undefined; size: number }) =>
  Object.values(index.files).some(
    (entry) => (want.from !== undefined && entry.from === want.from) || entry.size === want.size
  )

/* What the storage already holds of this footage, whatever it is called and whichever folder it
   sits in: the same bytes. What it was made from is not needed for that — a file that was up there
   before SkyDock ever looked has no origin recorded and is recognised all the same — but knowing it
   is what makes a file worth looking for in the first place. The same original cut another way
   weighs and reads differently, and goes up as the other footage it is. */
const alreadyUp = (index: OriginIndex, md5: string) => {
  const found = Object.entries(index.files).find(
    ([, entry]) => entry.md5 !== undefined && entry.md5.toLowerCase() === md5.toLowerCase()
  )
  return found ? { remotePath: found[0], entry: found[1] } : null
}

/* Files of exactly this size that the storage holds and SkyDock has never hashed: the ones worth
   asking it about, since the same footage under another name weighs the same. */
const sameSizeUnknown = (index: OriginIndex, size: number) =>
  Object.entries(index.files)
    .filter(([, entry]) => entry.md5 === undefined && entry.size === size)
    .map(([remotePath]) => remotePath)

/* Where each file that may travel came from, by the path it travels as: a delivered copy comes from
   the original it was made of — and says what it was cut to, since the same original cut another
   way is other footage — while an original travels as itself and comes from itself. */
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

export { alreadyUp, originEntrySchema, originIndexSchema, originsOf, sameSizeUnknown, worthReading }
export type { OriginEntry, OriginIndex }
