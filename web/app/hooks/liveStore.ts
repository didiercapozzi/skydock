import { useSyncExternalStore } from 'react'
import type {
  Bringing,
  CameraCopy,
  Deleting,
  Freeing,
  Importing,
  LiveFile
} from './useLiveProgress'

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
const liveBringing = slice<Bringing | null>(null)
const liveFreeing = slice<Freeing | null>(null)

const NO_DELETING: Record<string, Deleting> = {}
const liveDeleting = slice(NO_DELETING)

const forgetLive = () => {
  liveFiles.update(() => NO_FILES)
  liveCamera.update(() => null)
  liveImporting.update(() => null)
  liveBringing.update(() => null)
  liveFreeing.update(() => null)
  liveDeleting.update(() => NO_DELETING)
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

const useLiveProxies = () => {
  const all = useSyncExternalStore(liveFiles.subscribe, liveFiles.get, () => NO_FILES)
  return Object.entries(all).flatMap(([key, live]) =>
    live.work === 'proxy' ? [{ id: key.slice('proxy:'.length), percent: live.percent }] : []
  )
}

const useCameraCopy = () => useSyncExternalStore(liveCamera.subscribe, liveCamera.get, () => null)

const useCameraLanded = () =>
  useSyncExternalStore(
    liveCamera.subscribe,
    () => {
      const copy = liveCamera.get()
      return copy ? `${copy.camera}:${copy.copied}` : ''
    },
    () => ''
  )

const useCameraCopying = () =>
  useSyncExternalStore(
    liveCamera.subscribe,
    () => liveCamera.get() !== null,
    () => false
  )

const useDeleting = (path: string) =>
  useSyncExternalStore(
    liveDeleting.subscribe,
    () => liveDeleting.get()[path],
    () => undefined
  )

const useDeletingAll = () =>
  useSyncExternalStore(liveDeleting.subscribe, liveDeleting.get, () => NO_DELETING)

const useImporting = () =>
  useSyncExternalStore(liveImporting.subscribe, liveImporting.get, () => null)

const useFreeing = () => useSyncExternalStore(liveFreeing.subscribe, liveFreeing.get, () => null)

const useBringing = () => useSyncExternalStore(liveBringing.subscribe, liveBringing.get, () => null)

const forgetDeleting = () => liveDeleting.update(() => NO_DELETING)

export {
  forgetDeleting,
  forgetLive,
  liveBringing,
  liveCamera,
  liveDeleting,
  liveFreeing,
  liveFiles,
  liveImporting,
  liveKey,
  useBringing,
  useCameraCopy,
  useCameraCopying,
  useCameraLanded,
  useDeleting,
  useDeletingAll,
  useFreeing,
  useImporting,
  useLiveFile,
  useLiveProxies
}
