import { useSyncExternalStore } from 'react'

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

const actions = {
  toggle: () => set({ open: !state.open }),
  close: () => set({ open: false }),
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
