import * as fs from 'node:fs'
import { dayOfFiles, freshIds, groupFromFiles, splitByGap } from './clustering'
import { shotTimes } from './scan'
import { isFiled } from './filed'
import type { Manifest } from './types'

const resetFreshTimes = async (manifest: Manifest) => {
  const fresh = freshIds(manifest)
  if (fresh.size === 0) return null
  const isFresh = (f: { id?: string }) => Boolean(f.id && fresh.has(f.id))
  const times = await shotTimes(manifest.files.filter(isFresh).map((f) => f.path))
  const jumps = manifest.groups.filter((g) => !isFiled(g))
  for (const file of [...manifest.files, ...jumps.flatMap((g) => g.files)])
    if (isFresh(file)) file.mtime = times.get(file.path) || file.mtime
  for (const jump of jumps) {
    jump.files.sort((a, b) => a.mtime - b.mtime)
    jump.day = dayOfFiles(jump.files)
  }
  return { files: fresh.size, jumps: jumps.length }
}

const resetFresh = async (manifest: Manifest) => {
  const fresh = freshIds(manifest)
  if (fresh.size === 0) return null
  const isFresh = (f: { id?: string }) => Boolean(f.id && fresh.has(f.id))

  for (const file of manifest.files) {
    const made = isFresh(file) ? file.processed?.path : undefined
    if (made && fs.existsSync(made)) {
      try {
        fs.unlinkSync(made)
      } catch {}
    }
  }

  const kept = manifest.files.filter((f) => !(isFresh(f) && f.copyOf))
  const times = await shotTimes(kept.filter(isFresh).map((f) => f.path))
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
    return { ...asShot, mtime: times.get(file.path) || file.mtime }
  })

  manifest.groups = manifest.groups.filter(isFiled)
  const again = manifest.files.filter(isFresh)
  const jumps = splitByGap(again).filter((run) => run.length > 1)
  for (const run of jumps) groupFromFiles(manifest, run)
  return { files: again.length, jumps: jumps.length }
}

export { resetFresh, resetFreshTimes }
