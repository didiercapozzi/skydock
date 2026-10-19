import { useSyncExternalStore } from 'react'

type Remembering<T> = {
  key: string
  fallback: T
  from: (stored: string) => T | null
  to?: (value: T) => string
  kept?: 'local' | 'session'
  then?: (value: T) => void
}

const remembered = <T>({
  key,
  fallback,
  from,
  to = String as (value: T) => string,
  kept = 'local',
  then
}: Remembering<T>) => {
  let held = fallback
  const listeners = new Set<() => void>()

  const store = () => (kept === 'session' ? sessionStorage : localStorage)

  const heard = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return
    if (e.storageArea && e.storageArea !== store()) return
    if (e.newValue === null) held = fallback
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void) => {
    if (!listeners.size) window.addEventListener('storage', heard)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) window.removeEventListener('storage', heard)
    }
  }

  let seen: { stored: string; value: T } | null = null

  const read = (): T => {
    try {
      const stored = store().getItem(key)
      if (stored === null) return held
      if (seen?.stored !== stored) {
        const value = from(stored)
        seen = value === null ? null : { stored, value }
      }
      return seen?.value ?? held
    } catch {
      return held
    }
  }

  const set = (value: T) => {
    held = value
    const written = to(value)
    try {
      if (written === to(fallback)) store().removeItem(key)
      else store().setItem(key, written)
    } catch {}
    then?.(value)
    for (const listener of listeners) listener()
  }

  const use = () => useSyncExternalStore(subscribe, read, () => fallback)

  return { read, set, use }
}

export { remembered }
