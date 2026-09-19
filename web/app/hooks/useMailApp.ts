import { useSyncExternalStore } from 'react'
import { z } from 'zod'

/* Which mail the passenger email is opened in — Gmail in the browser, or the computer's own mail
   program — remembered, so the one used last is the one offered first. */
const mailAppSchema = z.enum(['gmail', 'mailto'])
type MailApp = z.infer<typeof mailAppSchema>

const KEY = 'skydock.mailApp'

let chosen: MailApp = 'gmail'

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = (): MailApp => {
  try {
    const stored = mailAppSchema.safeParse(localStorage.getItem(KEY))
    return stored.success ? stored.data : chosen
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
