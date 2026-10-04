import { useSyncExternalStore } from 'react'
import type { Job, LiveFile } from './useLiveProgress'
import type { JobRow } from '@skydock/scripts'

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
const NO_JOBS: Record<string, Job> = {}
const liveJobs = slice(NO_JOBS)

const forgetLive = () => {
  liveFiles.update(() => NO_FILES)
  liveJobs.update(() => NO_JOBS)
}

const liveKey = (work: LiveFile['work'], fileId: string) => `${work}:${fileId}`

const SHOWN_FIRST: LiveFile['work'][] = ['process', 'moments', 'proxy']

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

const useJobOf = (type: Job['type']) =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => Object.values(liveJobs.get()).find((job) => job.type === type),
    () => undefined
  )

const useCameraCopy = () => useJobOf('camera-copy') ?? null

const useCameraLanded = () =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => {
      const copy = Object.values(liveJobs.get()).find((job) => job.type === 'camera-copy')
      return copy ? `${copy.label}:${copy.done}` : ''
    },
    () => ''
  )

const useCameraCopying = () =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => Object.values(liveJobs.get()).some((job) => job.type === 'camera-copy'),
    () => false
  )

const useJobs = () =>
  Object.values(useSyncExternalStore(liveJobs.subscribe, liveJobs.get, () => NO_JOBS))

const NO_ROWS: JobRow[] = []

const useJobRows = (type: Job['type']) =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () => Object.values(liveJobs.get()).find((job) => job.type === type)?.rows ?? NO_ROWS,
    () => NO_ROWS
  )

const useJobRow = (type: Job['type'], key: string) =>
  useSyncExternalStore(
    liveJobs.subscribe,
    () =>
      Object.values(liveJobs.get())
        .find((job) => job.type === type)
        ?.rows.find((row) => row.key === key),
    () => undefined
  )

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
  useCameraCopy,
  useCameraCopying,
  useCameraLanded,
  useJobOf,
  useJobRow,
  useJobRows,
  useJobs,
  useLiveFile
}
