import { publish } from './live'
import { loadManifest, pairStamp, writtenHere } from './manifest'
import { getManifestPath } from './utils'

/* The board's record is written by more than the page that has it open: another tab, a script, a hand
   edit, work done outside the page. So while a board is listening the pair — manifest.json and its
   groups — is looked at every couple of seconds, and once it has changed and then stopped changing the
   board is told to look again. Only those two names are looked at: the temporary files an atomic
   write passes through, the copies kept beside them and the history are not the record.

   Looked at rather than watched, for the reason the montages' folders are: a write lands as two
   files, one after the other, and what matters is the moment it is whole; and the folder may be on a
   mount where events do not cross.

   What this process wrote itself is not told: whoever asked was answered with it already, and a
   board that heard about its own edit would draw it twice. */
const EVERY_MS = 2000

type Watch = {
  watchers: number
  timer: ReturnType<typeof setInterval> | null
  /* the last state looked at, how many looks it has stayed so, and the last one told */
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

/* One look. The first look only learns what is there — the board was drawn from the record a moment
   before, and what it holds is what it shows. After that, a change that has stayed for a whole look is
   told once, unless this process made it. A pair that cannot be read whole is not told: the board
   would be given the older copy to fall back on, and a refresh must never show an older board. */
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
    if (!loadManifest(manifestPath)) return
  } catch {
    return
  }
  state.told = stamp
  publish({ kind: 'board', stamp })
}

/* Looked at only while somebody is there to be told: the first board to listen starts it and the last
   one to leave stops it. */
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
