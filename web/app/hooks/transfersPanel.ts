import { useSyncExternalStore } from 'react'

/* The panel of what was sent and copied, shared by whoever opens it: the header's button, the line
   that says an upload was turned away, the board itself when it opens it by itself. `shown` counts
   the times it was asked to show the latest, so a panel already open comes back to it. `trouble` is
   whether the line above, if it is a problem, is about a transfer that just failed — what makes it
   a way into the panel. */
type State = { open: boolean; shown: number; trouble: boolean }

let state: State = { open: false, shown: 0, trouble: false }
const listeners = new Set<() => void>()

const set = (next: Partial<State>) => {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* the same functions on every render, so that an effect that uses them is not run again by them */
const actions = {
  toggle: () => set({ open: !state.open }),
  close: () => set({ open: false }),
  /* open, and at the latest transfer */
  show: () => set({ open: true, shown: state.shown + 1 }),
  setTrouble: (trouble: boolean) => {
    if (state.trouble !== trouble) set({ trouble })
  }
}

const useTransfersPanel = () => {
  const now = useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  )
  return { ...now, ...actions }
}

export { useTransfersPanel }
