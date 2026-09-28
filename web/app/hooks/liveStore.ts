import { useSyncExternalStore } from 'react'
import type { CameraCopy, Importing, LiveFile } from './useLiveProgress'

/* What moves many times a second — how far each file being processed or proxied has got, the bytes
   of a card being copied, the bytes of a file being copied in — kept here rather than in the board.
   Kept in the board, every tick drew the whole board again: every row, the rail, the dialogs.
   Kept here, a tick draws the one row or the one panel that shows it, and the board is drawn only
   when something it shows changes.

   Ticks are also gathered to the screen: however many arrive, what is shown is changed at most once
   a frame, which is as often as anybody can see it change. */
type Slice<T> = {
  get: () => T
  update: (next: (before: T) => T) => void
  subscribe: (listener: () => void) => () => void
}

const nextFrame = (then: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(then) : setTimeout(then, 16)

const slice = <T>(initial: T) => {
  let value = initial
  let waiting = false
  const listeners = new Set<() => void>()
  const tell = () => {
    waiting = false
    for (const listener of listeners) listener()
  }
  const made: Slice<T> = {
    get: () => value,
    update: (next) => {
      const was = value
      value = next(value)
      if (value === was || waiting) return
      waiting = true
      nextFrame(tell)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  return made
}

const NO_FILES: Record<string, LiveFile> = {}

const liveFiles = slice(NO_FILES)
const liveCamera = slice<CameraCopy | null>(null)
const liveImporting = slice<Importing | null>(null)

/* everything heard so far let go of, for a line to the machine opened afresh */
const forgetLive = () => {
  liveFiles.update(() => NO_FILES)
  liveCamera.update(() => null)
  liveImporting.update(() => null)
}

/* one file's progress, and nothing else: a row is drawn again only when its own file moves */
const useLiveFile = (id: string | undefined) =>
  useSyncExternalStore(
    liveFiles.subscribe,
    () => (id ? liveFiles.get()[id] : undefined),
    () => undefined
  )

/* the card being copied, every byte of it — for the panel that shows it */
const useCameraCopy = () => useSyncExternalStore(liveCamera.subscribe, liveCamera.get, () => null)

/* only which card, and how many files have come off it so far — what the board itself needs */
const useCameraLanded = () =>
  useSyncExternalStore(
    liveCamera.subscribe,
    () => {
      const copy = liveCamera.get()
      return copy ? `${copy.camera}:${copy.copied}` : ''
    },
    () => ''
  )

/* only whether a card is being copied at all — changes twice a copy */
const useCameraCopying = () =>
  useSyncExternalStore(
    liveCamera.subscribe,
    () => liveCamera.get() !== null,
    () => false
  )

/* the file being copied in from the computer, and how far through */
const useImporting = () =>
  useSyncExternalStore(liveImporting.subscribe, liveImporting.get, () => null)

export {
  forgetLive,
  liveCamera,
  liveFiles,
  liveImporting,
  useCameraCopy,
  useCameraCopying,
  useCameraLanded,
  useImporting,
  useLiveFile
}
