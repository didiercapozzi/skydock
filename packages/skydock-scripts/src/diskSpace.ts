import * as fs from 'node:fs'
import { publish } from './live'

/* How much room the output folder's disk has left. SkyDock fills it — originals, proxies, copies —
   and so can anything else on the machine, so it is looked at on its own while a board is open: a
   full disk fails every copy, proxy and save, and is worth saying before that happens. */

const GB = 1024 ** 3
/* under this, it is worth knowing; under the next, what the board does starts failing */
const LOW_BYTES = 5 * GB
const FULL_BYTES = 1 * GB
/* how much the room has to change by to be said again */
const CHANGE_BYTES = 256 * 1024 ** 2
const EVERY_MS = 10_000

/* how full the disk reads, from the room left on it */
const levelOf = (free: number): 'full' | 'low' | 'ok' =>
  free < FULL_BYTES ? 'full' : free < LOW_BYTES ? 'low' : 'ok'

const diskSpace = (dir: string) => {
  try {
    const stats = fs.statfsSync(dir)
    const free = stats.bavail * stats.bsize
    return { free, total: stats.blocks * stats.bsize, level: levelOf(free) }
  } catch {
    return null
  }
}

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  said: { level: string; free: number } | null
}

declare global {
  var skydockDiskWatch: Watch | undefined
}

const watch = () => (globalThis.skydockDiskWatch ??= { timer: null, said: null })

/* one look: said when the level changes, or the room moves by enough to read differently */
const lookAtDisk = (dir: string) => {
  const state = watch()
  const now = diskSpace(dir)
  if (!now) return
  const said = state.said
  if (said && said.level === now.level && Math.abs(said.free - now.free) < CHANGE_BYTES) return
  state.said = { level: now.level, free: now.free }
  publish({ kind: 'disk', ...now })
}

/* kept for as long as the server runs; each start replaces the look left running before, as the
   camera watch does */
const watchDisk = (dir: string) => {
  const state = watch()
  if (state.timer) clearInterval(state.timer)
  state.said = null
  lookAtDisk(dir)
  state.timer = setInterval(() => lookAtDisk(dir), EVERY_MS)
}

export { diskSpace, levelOf, lookAtDisk, watchDisk }
