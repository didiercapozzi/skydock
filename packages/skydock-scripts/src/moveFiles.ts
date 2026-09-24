import * as fs from 'node:fs'
import { groupFromFiles, shiftGroupTo } from './clustering'
import { cameraTimes } from './scan'
import type { Manifest, ManifestFile, ManifestPassenger } from './types'
import { idsOf } from './lib/words'

/* Moving files on the board, in one place: dragged from one jump to another, onto a place, back to
   the sorting area — or dropped in again from the computer onto somewhere else. A file is in one place
   at a time (RULES), so a move takes it out of wherever it was and puts it where it was asked to go. */

type MoveTo = {
  /* into this jump */
  targetGroupId?: string
  /* gathered into a jump of their own, filed under `destination` */
  newGroup?: boolean
  /* as lone files of this place; null or absent sends them back to be sorted */
  destination?: string | null
  /* for a new jump: what it is called, and when it started — its files move with the start */
  name?: string
  startsAt?: number
  /* the new jump is a montage — named by `passenger` when it has a name yet */
  montage?: boolean
  passenger?: ManifestPassenger
}

/* A copy exists because a jump holds it. One that leaves for the sorting area with nowhere to be —
   not into a jump, not filed to a place — is not sent back but simply ends: the original is
   wherever it already is, and a second loose entry for it would be the same file listed twice. */
const endCopies = (manifest: Manifest, ids: Set<string>) => {
  const ending = manifest.files.filter((f) => f.id && ids.has(f.id) && f.copyOf)
  for (const copy of ending) {
    const output = copy.processed?.path
    if (output && fs.existsSync(output)) {
      try {
        fs.unlinkSync(output)
      } catch {
        /* a processed copy that cannot be deleted is not worth failing over */
      }
    }
  }
  const gone = new Set(ending.map((f) => f.id))
  manifest.files = manifest.files.filter((f) => !gone.has(f.id))
  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.id)) }))
    .filter((g) => g.files.length > 0)
  return new Set([...ids].filter((id) => !gone.has(id)))
}

const moveFiles = (manifest: Manifest, asked: Set<string>, to: MoveTo) => {
  if (to.targetGroupId && !manifest.groups.some((g) => g.id === to.targetGroupId))
    throw new Error('Target jump not found.')
  const ids =
    !to.targetGroupId && !to.newGroup && !to.destination ? endCopies(manifest, asked) : asked
  if (ids.size === 0) return

  /* A file leaving its jump to stand alone keeps what was set on it there — its trim, frame and
     turn live on the jump's copy of it, and a lone file is its registry entry, so they are carried
     across first. Without this, taking a file out of a jump quietly undid that work. */
  if (!to.targetGroupId && !to.newGroup)
    for (const copy of manifest.groups.flatMap((g) => g.files)) {
      const entry = copy.id && ids.has(copy.id) && manifest.files.find((f) => f.id === copy.id)
      if (entry) Object.assign(entry, copy)
    }

  /* Back to be sorted, a file is on the time its camera gave it. A time was only ever corrected for
     the jump it was in — a whole jump moved to where it really happened, a clip fitted among the
     others — and means nothing once the file is on its own; left on it, the file would be sorted
     under a day it was never shot on. A file whose original cannot be asked keeps the time it has. */
  if (!to.targetGroupId && !to.newGroup && !to.destination) {
    const going = manifest.files.filter((f) => f.id && ids.has(f.id))
    const times = cameraTimes(going.map((f) => f.path))
    for (const file of going) file.mtime = times.get(file.path) || file.mtime
  }

  /* the files leave wherever they were, so their processed copies are stale */
  for (const file of manifest.files) {
    if (!file.id || !ids.has(file.id)) continue
    const output = file.processed?.path
    if (output && fs.existsSync(output)) {
      try {
        fs.unlinkSync(output)
      } catch {
        /* a copy we cannot delete is not worth failing the move over */
      }
    }
    delete file.processed
    delete file.uploaded
    /* a file that lands in a group takes its destination from that group, never its own —
       `file.destination` is what marks a lone file (RULES, Places) */
    if (to.destination && !to.newGroup && !to.targetGroupId) file.destination = to.destination
    else delete file.destination
  }

  /* Each file as its jump had it, crop and all — and for one that was in no jump, the registry's
     own entry. Only taking the jumps' copies left a loose file dragged onto a jump in no jump at
     all: it was taken from where it was and put nowhere. */
  const refs = new Map<string, ManifestFile>()
  for (const f of manifest.groups.flatMap((g) => g.files))
    if (f.id && ids.has(f.id)) refs.set(f.id, f)
  const moving = manifest.files.flatMap((f) =>
    f.id && ids.has(f.id) ? [{ ...(refs.get(f.id) ?? f), destination: undefined }] : []
  )

  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !f.id || !ids.has(f.id)) }))
    .filter((g) => g.files.length > 0 || g.id === to.targetGroupId)

  if (to.targetGroupId) {
    const target = manifest.groups.find((g) => g.id === to.targetGroupId)!
    target.files = [...target.files, ...moving].sort((a, b) => a.mtime - b.mtime)
    target.processed = undefined
  }
  if (to.newGroup) {
    if (moving.length === 0) throw new Error('Those files are no longer in the manifest.')
    const group = groupFromFiles(manifest, moving, to.destination ?? undefined)
    const name = to.name?.trim()
    if (group && to.montage) group.montageJump = true
    if (group && to.passenger) group.passenger = to.passenger
    else if (group && name) group.name = name
    if (group && to.startsAt !== undefined) shiftGroupTo(manifest, group, to.startsAt)
  }
}

/* The copies a set of files makes, each an entry of its own for the same original: its own id, trim,
   time, processed copy and upload. Each is taken as its jump has it, crop and all — and one in no
   jump as the registry has it. `held` is what the receiving jump already holds, by path: a jump
   holds an original once, so one it already has, as itself or as a copy, is passed over, and a file
   freed from this machine has no file here to copy. */
const copiesOf = (manifest: Manifest, ids: Set<string>, held: Set<string>) => {
  const taken = new Set(idsOf(manifest.files))
  const asHeld = new Map<string, ManifestFile>()
  for (const f of manifest.files) if (f.id && ids.has(f.id)) asHeld.set(f.id, f)
  for (const f of manifest.groups.flatMap((g) => g.files))
    if (f.id && ids.has(f.id)) asHeld.set(f.id, f)

  const copies: ManifestFile[] = []
  let freed = 0
  for (const source of asHeld.values()) {
    if (source.freed) {
      freed++
      continue
    }
    if (held.has(source.path)) continue
    const original = source.copyOf ?? source.id!
    let n = 1
    while (taken.has(`${original}~${n}`)) n++
    const id = `${original}~${n}`
    taken.add(id)
    held.add(source.path)
    const { processed: _p, uploaded: _u, destination: _d, freed: _f, ...kept } = source
    copies.push({ ...kept, id, copyOf: original })
  }
  manifest.files.push(...copies)
  return { copies, passedOver: asHeld.size - copies.length - freed, freed }
}

/* Files copied into another jump, not moved: each stays where it is and the other jump gets an entry
   of its own for the same original — its own trim, time, processed copy and upload — so a clip two
   passengers share goes to both, each under their own name, with nothing doubled on the disk. It
   arrives trimmed, framed and turned as it is where it was copied from, which is the likeliest thing
   to want and can be changed there afterwards. A jump holds an original once: one it already has,
   as itself or as a copy, is passed over. */
const copyFiles = (manifest: Manifest, ids: Set<string>, targetGroupId: string) => {
  const target = manifest.groups.find((g) => g.id === targetGroupId)
  if (!target) throw new Error('Target jump not found.')
  const { copies, passedOver, freed } = copiesOf(
    manifest,
    ids,
    new Set(target.files.map((f) => f.path))
  )
  if (copies.length > 0) {
    target.files = [...target.files, ...copies.map((c) => ({ ...c }))].sort(
      (a, b) => a.mtime - b.mtime
    )
    target.processed = undefined
  }
  return { copied: copies.length, passedOver, freed }
}

/* Files that already belong somewhere — a dropzone, another montage — made into a montage of their
   own without leaving: copies, each as it is where it came from, gathered into a new jump filed
   under that name (RULES, Making a montage). A name that is already a montage's joins it as a jump
   of its own, keeping its own times, as a passenger's two jumps share one folder. */
const copyIntoMontage = (manifest: Manifest, ids: Set<string>, passenger: ManifestPassenger) => {
  const { copies, passedOver, freed } = copiesOf(manifest, ids, new Set())
  const group = groupFromFiles(manifest, copies)
  if (group) {
    group.montageJump = true
    group.passenger = passenger
  }
  return { copied: copies.length, passedOver, freed, groupId: group?.id }
}

/* A jump that should not exist goes, and its files stay: loose in Unsorted, each on its own day,
   keeping their trim, frame and turn as any file leaving a jump does (RULES, Jumps). What was made
   from them is out of date and goes, as with any move. */
const deleteJump = (manifest: Manifest, groupId: string) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('That jump is no longer on the board.')
  const ids = new Set(idsOf(group.files))
  moveFiles(manifest, ids, { destination: null })
  /* a jump with no files left in it is gone already; one whose files had no ids is taken out too */
  manifest.groups = manifest.groups.filter((g) => g.id !== groupId)
  return ids.size
}

export { copyFiles, copyIntoMontage, deleteJump, moveFiles }
export type { MoveTo }
