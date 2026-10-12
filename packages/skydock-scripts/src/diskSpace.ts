import { statfs } from 'node:fs/promises'
import { publish } from './live'

const GB = 1024 ** 3
const LOW_BYTES = 5 * GB
const FULL_BYTES = 1 * GB
const CHANGE_BYTES = 256 * 1024 ** 2
const EVERY_MS = 10_000

const levelOf = (free: number): 'full' | 'low' | 'ok' =>
  free < FULL_BYTES ? 'full' : free < LOW_BYTES ? 'low' : 'ok'

const diskSpace = async (dir: string) => {
  try {
    const stats = await statfs(dir)
    const free = stats.bavail * stats.bsize
    return { free, total: stats.blocks * stats.bsize, level: levelOf(free) }
  } catch {
    return null
  }
}

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  said: { level: string; free: number } | null
  looking: boolean
}

declare global {
  var skydockDiskWatch: Watch | undefined
}

const watch = () => (globalThis.skydockDiskWatch ??= { timer: null, said: null, looking: false })

const lookAtDisk = async (dir: string) => {
  const state = watch()
  if (state.looking) return
  state.looking = true
  const now = await diskSpace(dir).finally(() => {
    state.looking = false
  })
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
  void lookAtDisk(dir)
  state.timer = setInterval(() => void lookAtDisk(dir), EVERY_MS)
}

export { diskSpace, levelOf, lookAtDisk, watchDisk }
