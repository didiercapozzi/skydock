import { z } from 'zod'
import { isMontage } from './filed'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { hasCompletePassenger, passengerOf } from './workspace'

/* What one change did to the board, read off the board before it and after it rather than off what
   was asked — so every way of changing it, a drag, a rename, a trim, processing, is said the same
   way, and a step that changed nothing says so. Free of node imports: the board draws it. */

/* where a file is, as the board names it: Fresh files, a destination, or a montage */
const whereSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fresh') }),
  z.object({ kind: z.literal('dz'), name: z.string() }),
  z.object({ kind: z.literal('montage'), name: z.string() })
])

const boardChangeSchema = z.object({
  /* files that went somewhere else, counted by where they went */
  filed: z.array(z.object({ to: whereSchema, files: z.number() })),
  montagesMade: z.array(z.string()),
  montagesGone: z.array(z.string()),
  jumpsMade: z.number(),
  jumpsGone: z.number(),
  jumpsRenamed: z.number(),
  /* trimmed, framed or turned */
  trimmed: z.number(),
  retimed: z.number(),
  filesAdded: z.number(),
  filesGone: z.number(),
  processed: z.number(),
  uploaded: z.number()
})

type BoardChange = z.infer<typeof boardChangeSchema>
type Where = z.infer<typeof whereSchema>

const whereOf = (group: ManifestGroup) =>
  isMontage(group) && hasCompletePassenger(group.passenger)
    ? ({ kind: 'montage', name: passengerOf(group) } satisfies Where)
    : group.destination
      ? ({ kind: 'dz', name: group.destination } satisfies Where)
      : ({ kind: 'fresh' } satisfies Where)

const placesOf = (board: Manifest) => {
  const places = new Map<string, Where>()
  for (const g of board.groups) for (const f of g.files) if (f.id) places.set(f.id, whereOf(g))
  for (const f of board.files)
    if (f.id && !places.has(f.id))
      places.set(
        f.id,
        f.destination
          ? ({ kind: 'dz', name: f.destination } satisfies Where)
          : ({ kind: 'fresh' } satisfies Where)
      )
  return places
}

const filesOf = (board: Manifest) => {
  const files = new Map<string, ManifestFile>()
  for (const f of [...board.files, ...board.groups.flatMap((g) => g.files)])
    if (f.id) files.set(f.id, f)
  return files
}

const montageNames = (board: Manifest) =>
  new Set(
    board.groups
      .filter((g) => isMontage(g) && hasCompletePassenger(g.passenger))
      .map((g) => passengerOf(g))
  )

const sameWhere = (a: Where | undefined, b: Where | undefined) =>
  a?.kind === b?.kind && (a && 'name' in a ? a.name : '') === (b && 'name' in b ? b.name : '')

const cutOf = (f: ManifestFile) =>
  JSON.stringify([f.cropStart ?? null, f.cropEnd ?? null, f.frame ?? null, f.rotation ?? 0])

const describeChange = (before: Manifest, after: Manifest) => {
  const wasAt = placesOf(before)
  const isAt = placesOf(after)
  const was = filesOf(before)
  const is = filesOf(after)
  const filed = new Map<string, { to: Where; files: number }>()
  let trimmed = 0
  let retimed = 0
  let processed = 0
  let uploaded = 0
  for (const [id, file] of is) {
    const old = was.get(id)
    if (!old) continue
    const to = isAt.get(id)
    if (to && !sameWhere(wasAt.get(id), to)) {
      const key = JSON.stringify(to)
      filed.set(key, { to, files: (filed.get(key)?.files ?? 0) + 1 })
    }
    if (cutOf(old) !== cutOf(file)) trimmed++
    if (old.mtime !== file.mtime) retimed++
    if (!old.processed && file.processed) processed++
    if (!old.uploaded && file.uploaded) uploaded++
  }
  const madeBefore = montageNames(before)
  const madeAfter = montageNames(after)
  const jumpsBefore = new Map(before.groups.map((g) => [g.id, g]))
  const jumpsAfter = new Set(after.groups.map((g) => g.id))
  return {
    filed: [...filed.values()],
    montagesMade: [...madeAfter].filter((n) => !madeBefore.has(n)),
    montagesGone: [...madeBefore].filter((n) => !madeAfter.has(n)),
    jumpsMade: after.groups.filter((g) => !jumpsBefore.has(g.id)).length,
    jumpsGone: before.groups.filter((g) => !jumpsAfter.has(g.id)).length,
    jumpsRenamed: after.groups.filter((g) => {
      const old = jumpsBefore.get(g.id)
      return old !== undefined && (old.name ?? '') !== (g.name ?? '')
    }).length,
    trimmed,
    retimed,
    filesAdded: [...is.keys()].filter((id) => !was.has(id)).length,
    filesGone: [...was.keys()].filter((id) => !is.has(id)).length,
    processed,
    uploaded
  }
}

/* a change that changed nothing the board shows */
const changedNothing = (change: BoardChange) =>
  Object.values(change).every((v) => (Array.isArray(v) ? v.length === 0 : v === 0))

export { boardChangeSchema, changedNothing, describeChange }
export type { BoardChange }
