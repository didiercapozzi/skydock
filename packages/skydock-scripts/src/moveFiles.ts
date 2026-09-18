import * as fs from 'node:fs'
import { groupFromFiles } from './clustering'
import type { Manifest, ManifestFile } from './types'

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
}

const moveFiles = (manifest: Manifest, ids: Set<string>, to: MoveTo) => {
  if (to.targetGroupId && !manifest.groups.some((g) => g.id === to.targetGroupId))
    throw new Error('Target jump not found.')

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
       `file.destination` is what marks a lone file (RULES, Dropzones and tandems) */
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
    groupFromFiles(manifest, moving, to.destination ?? undefined)
  }
}

export { moveFiles }
export type { MoveTo }
