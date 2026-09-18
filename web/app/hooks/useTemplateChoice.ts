import { useSyncExternalStore } from 'react'

/* Which editing template was chosen last. A club mostly edits with one template, so the one picked
   for the last tandem is the one offered for the next — offered, never applied by itself. Read
   through `useSyncExternalStore` for the same reason as the backup choice: the server renders
   without it, and the stored choice follows in the same commit. */
const KEY = 'skydock.template'

let chosen = ''

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = () => {
  try {
    return localStorage.getItem(KEY) ?? chosen
  } catch {
    return chosen
  }
}

const setTemplateChoice = (name: string) => {
  chosen = name
  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* a browser refusing storage still gets the choice, just not the memory */
  }
  for (const listener of listeners) listener()
}

const useTemplateChoice = () => useSyncExternalStore(subscribe, readStored, () => '')

export { setTemplateChoice, useTemplateChoice }
