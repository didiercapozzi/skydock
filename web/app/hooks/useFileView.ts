import { useSyncExternalStore } from 'react'

type FileView = 'rows' | 'grid'

const KEY = 'skydock.fileView'

/* Remembered for the session but read through `useSyncExternalStore` rather than state: a
   `useState` initialiser reading sessionStorage renders something the server never rendered, and
   reading it in an effect means setting state from an effect. The server snapshot is the default,
   so the first client paint matches and then corrects itself in the same commit. */
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = (): FileView => {
  try {
    return sessionStorage.getItem(KEY) === 'grid' ? 'grid' : 'rows'
  } catch {
    return 'rows'
  }
}

const setFileView = (view: FileView) => {
  try {
    sessionStorage.setItem(KEY, view)
  } catch {
    /* a browser refusing storage still gets the toggle, just not the memory */
  }
  for (const listener of listeners) listener()
}

const useFileView = () => useSyncExternalStore(subscribe, readStored, (): FileView => 'rows')

export { setFileView, useFileView }
export type { FileView }
