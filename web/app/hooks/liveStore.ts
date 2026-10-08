import { useSyncExternalStore } from 'react'
import type { Job, LiveFile } from './useLiveProgress'
import type { JobRow } from '@skydock/scripts'

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
/* the tasks with no file of their own that are under way, or have failed and not been put away */
const NO_JOBS: Record<string, Job> = {}
const liveJobs = slice(NO_JOBS)

/* everything heard so far let go of, for a line to the machine opened afresh */
const forgetLive = () => {
  liveFiles.update(() => NO_FILES)
  liveJobs.update(() => NO_JOBS)
}

/* What is under way is kept by the work and the file, since the proxy and the jump are made side by
   side and one ending must not take the other's bar with it. */
const liveKey = (work: LiveFile['work'], fileId: string) => `${work}:${fileId}`

/* Which of a file's works the row shows when several are under way: the one it is being made
   ready by hand for first, then the jump, then the proxy. */
const SHOWN_FIRST: LiveFile['work'][] = ['process', 'moments', 'proxy']

/* one file's progress, and nothing else: a row is drawn again only when its own file moves */
const useLiveFile = (id: string | undefined) =>
  useSyncExternalStore(
    liveFiles.subscribe,
    () => {
      if (!id) return undefined
      const now = liveFiles.get()
      for (const work of SHOWN_FIRST) {
        const live = now[liveKey(work, id)]
        if (live) return live
      }
      return undefined
    },
    () => undefined
  )

/* only which card, and how many files have come off it so far — what the board itself needs */
const useCameraLanded = () =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => {
      const copy = Object.values(liveJobs.get()).find((job) => job.type === 'camera-copy')
      return copy ? `${copy.label}:${copy.done}` : ''
    },
    () => ''
  )

/* only whether a card is being copied at all — changes twice a copy */
const useCameraCopying = () =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => Object.values(liveJobs.get()).some((job) => job.type === 'camera-copy'),
    () => false
  )

/* every job under way, in the order they began */
const useJobs = () =>
  Object.values(useSyncExternalStore(liveJobs.subscribe, liveJobs.get, () => NO_JOBS))

const NO_ROWS: JobRow[] = []

/* what a job of one kind is doing to each of its files, in order — the first of them, since a person
   deletes or fetches one batch at a time. The list is the one the store holds, so it is the same list
   until something in it changes. */
const useJobRows = (type: Job['type']) =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => Object.values(liveJobs.get()).find((job) => job.type === type)?.rows ?? NO_ROWS,
    () => NO_ROWS
  )

/* one file of a job of that kind, and how far through — a row is drawn again only for its own */
const useJobRow = (type: Job['type'], key: string) =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () =>
      Object.values(liveJobs.get())
        .find((job) => job.type === type)
        ?.rows.find((row) => row.key === key),
    () => undefined
  )

/* the jobs of one kind let go of, once the page that asked for them has its answer and says the rest */
const forgetJobsOf = (type: Job['type']) =>
  liveJobs.update((jobs) =>
    Object.fromEntries(Object.entries(jobs).filter(([, job]) => job.type !== type))
  )

export {
  forgetJobsOf,
  forgetLive,
  liveJobs,
  liveFiles,
  liveKey,
  useCameraCopying,
  useCameraLanded,
  useJobRow,
  useJobRows,
  useJobs,
  useLiveFile
}
