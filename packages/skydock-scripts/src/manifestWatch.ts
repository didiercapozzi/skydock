import { publish } from './live'
import { pairStamp, readRecord, writtenHere } from './manifest'
import { getManifestPath } from './utils'

const EVERY_MS = 2000

type Watch = {
  watchers: number
  timer: ReturnType<typeof setInterval> | null
  seen: string | null
  steady: number
  told: string | null
}

declare global {
  var skydockManifestWatch: Watch | undefined
}

const watch = () =>
  (globalThis.skydockManifestWatch ??= {
    watchers: 0,
    timer: null,
    seen: null,
    steady: 0,
    told: null
  })

const lookAtBoard = (outputDir: string) => {
  const state = watch()
  const manifestPath = getManifestPath(outputDir)
  const stamp = pairStamp(manifestPath)
  if (state.seen === null) {
    state.seen = stamp
    state.told = stamp
    return
  }
  if (stamp !== state.seen) {
    state.seen = stamp
    state.steady = 0
    return
  }
  state.steady++
  if (state.steady < 1 || state.told === stamp) return
  if (writtenHere().get(manifestPath) === stamp) {
    state.told = stamp
    return
  }
  try {
    const record = readRecord(manifestPath)
    if (!record.manifest) return
  } catch {
    return
  }
  state.told = stamp
  publish({ kind: 'board', stamp })
}

const watchBoard = (outputDir: string) => {
  const state = watch()
  state.watchers++
  state.timer ??= setInterval(() => lookAtBoard(outputDir), EVERY_MS)
  return () => {
    state.watchers--
    if (state.watchers > 0 || !state.timer) return
    clearInterval(state.timer)
    state.timer = null
    state.seen = null
    state.steady = 0
    state.told = null
  }
}

export { lookAtBoard, watchBoard }
