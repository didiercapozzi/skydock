import { useSyncExternalStore } from 'react'

/* Which mail the passenger email is opened in — Gmail in the browser, or the computer's own mail
   program — remembered, so the one used last is the one offered first. */
type MailApp = 'gmail' | 'mailto'

const KEY = 'skydock.mailApp'

let chosen: MailApp = 'gmail'

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = (): MailApp => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'mailto' || stored === 'gmail' ? stored : chosen
  } catch {
    return chosen
  }
}

const setMailApp = (app: MailApp) => {
  chosen = app
  try {
    localStorage.setItem(KEY, app)
  } catch {
    /* a browser refusing storage still gets the choice, just not the memory */
  }
  for (const listener of listeners) listener()
}

const useMailApp = () => useSyncExternalStore(subscribe, readStored, (): MailApp => 'gmail')

export { setMailApp, useMailApp }
export type { MailApp }
