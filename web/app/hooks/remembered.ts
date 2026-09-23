import { useSyncExternalStore } from 'react'

/* A choice this machine remembers.
 *
 * Six of these had grown, each with its own copy of the same twenty lines. What differs between
 * them is only ever three things: where it is kept, how a stored string is read back, and — for the
 * theme — something to do once it is set. Everything else is the same machinery, and the machinery
 * is the part with the reasons in it:
 *
 * It is read through `useSyncExternalStore` rather than state. A `useState` initialiser reading
 * storage renders something the server never rendered, and reading it in an effect means setting
 * state from an effect. The server's answer is the fallback, so the first paint matches what the
 * server sent and corrects itself in the same commit.
 *
 * A browser refusing storage — a private window, storage turned off — still gets the choice for as
 * long as the page is open: what was set is held here as well, and every read falls back to it.
 */
type Remembering<T> = {
  /* what it is called in storage, which is the same name across versions of the app */
  key: string
  /* what it is until somebody says otherwise, and what the server renders */
  fallback: T
  /* a stored string read back, or null when it says nothing this app understands any more */
  from: (stored: string) => T | null
  /* how it is written down; the value itself, unless it is not a string */
  to?: (value: T) => string
  /* the session only, for a choice about this visit rather than about this person */
  kept?: 'local' | 'session'
  /* anything the choice does besides being remembered, done when it is set and not when it is read */
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

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /* What was read last, and what it said. `useSyncExternalStore` asks for the value on every render
     and stops only when it is handed the same one twice, so a choice that is an object has to be
     the same object until what is stored changes — reading it afresh each time never settles. */
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
      /* what everything is until somebody says otherwise is not worth storing, and storing it would
         be one more thing to keep in step with the fallback the server renders */
      if (written === to(fallback)) store().removeItem(key)
      else store().setItem(key, written)
    } catch {
      /* the choice still stands for this visit, it is only the memory that is refused */
    }
    then?.(value)
    for (const listener of listeners) listener()
  }

  const use = () => useSyncExternalStore(subscribe, read, () => fallback)

  return { read, set, use }
}

export { remembered }
export type { Remembering }
