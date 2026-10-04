import * as fs from 'node:fs'
import { publish } from './live'

const GB = 1024 ** 3
const LOW_BYTES = 5 * GB
const FULL_BYTES = 1 * GB
const CHANGE_BYTES = 256 * 1024 ** 2
const EVERY_MS = 10_000

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

const lookAtDisk = (dir: string) => {
  const state = watch()
  const now = diskSpace(dir)
  if (!now) return
  const said = state.said
  if (said && said.level === now.level && Math.abs(said.free - now.free) < CHANGE_BYTES) return
  state.said = { level: now.level, free: now.free }
  publish({ kind: 'disk', ...now })
}

const watchDisk = (dir: string) => {
  const state = watch()
  if (state.timer) clearInterval(state.timer)
  state.said = null
  lookAtDisk(dir)
  state.timer = setInterval(() => lookAtDisk(dir), EVERY_MS)
}

export { diskSpace, levelOf, lookAtDisk, watchDisk }
