import * as fs from 'node:fs'
import { dayOfFiles, freshIds, groupFromFiles, splitByGap } from './clustering'
import { cameraTimes } from './scan'
import { isFiled } from './filed'
import type { Manifest } from './types'

/* Fresh files put back as a scan would first have left them, for when the sorting has gone wrong
   and starting over is quicker than undoing it. Everything decided about a file still to be sorted
   goes: the jumps made and named by hand, the trims, frames and turns, the times that were set
   right, the copies brought in. Each file is back on the time its camera gave it, and the gap rule
   alone decides the jumps.

   Only ever what is still in Fresh files. A jump filed to a dropzone or a passenger is somebody's
   work and is not touched, nor is any original: this forgets decisions, never files. */
/* Only the times, for when a correction was the mistake: every file still to be sorted is back on
   the time its camera gave it, and everything else decided about it stays — its jump, the jump's
   name, its trim, frame and turn. A copy goes back to its original's camera time, being the same
   file. What was processed from a file reads as changed by itself, since its time is part of what
   a processed copy is made from. */
const resetFreshTimes = (manifest: Manifest) => {
  const fresh = freshIds(manifest)
  if (fresh.size === 0) return null
  const isFresh = (f: { id?: string }) => Boolean(f.id && fresh.has(f.id))
  const times = cameraTimes(manifest.files.filter(isFresh).map((f) => f.path))
  const jumps = manifest.groups.filter((g) => !isFiled(g))
  for (const file of [...manifest.files, ...jumps.flatMap((g) => g.files)])
    if (isFresh(file)) file.mtime = times.get(file.path) || file.mtime
  for (const jump of jumps) {
    jump.files.sort((a, b) => a.mtime - b.mtime)
    jump.day = dayOfFiles(jump.files)
  }
  return { files: fresh.size, jumps: jumps.length }
}

const resetFresh = (manifest: Manifest) => {
  const fresh = freshIds(manifest)
  if (fresh.size === 0) return null
  const isFresh = (f: { id?: string }) => Boolean(f.id && fresh.has(f.id))

  /* what was made from them no longer matches anything, so it goes */
  for (const file of manifest.files) {
    const made = isFresh(file) ? file.processed?.path : undefined
    if (made && fs.existsSync(made)) {
      try {
        fs.unlinkSync(made)
      } catch {
        /* a processed copy that cannot be deleted is not worth failing over */
      }
    }
  }

  /* a copy exists for the jump that held it; a scan never made one */
  const kept = manifest.files.filter((f) => !(isFresh(f) && f.copyOf))
  const times = cameraTimes(kept.filter(isFresh).map((f) => f.path))
  manifest.files = kept.map((file) => {
    if (!isFresh(file)) return file
    const {
      cropStart: _start,
      cropEnd: _end,
      frame: _frame,
      rotation: _rotation,
      processed: _processed,
      uploaded: _uploaded,
      ...asShot
    } = file
    /* a file whose original cannot be asked keeps the time it has */
    return { ...asShot, mtime: times.get(file.path) || file.mtime }
  })

  /* every jump still to be sorted goes, and the gap rule makes them again */
  manifest.groups = manifest.groups.filter(isFiled)
  const again = manifest.files.filter(isFresh)
  const jumps = splitByGap(again).filter((run) => run.length > 1)
  for (const run of jumps) groupFromFiles(manifest, run)
  return { files: again.length, jumps: jumps.length }
}

export { resetFresh, resetFreshTimes }
