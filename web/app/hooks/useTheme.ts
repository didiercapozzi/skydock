import { useSyncExternalStore } from 'react'

/* Auto follows the machine; the other two say so regardless of it. Auto is the default because
   most of the time the machine is right — but it is an ambient signal the app cannot see and the
   reader cannot check, which is exactly why overriding it has to be possible. */
type Theme = 'auto' | 'light' | 'dark'

const KEY = 'skydock.theme'

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = (): Theme => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

/* The attribute is what the stylesheet reads; `auto` removes it so the media query decides again.
   The same line runs before first paint from a script in the document head, so the page never
   appears in one theme and then changes to the other. */
const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

const setTheme = (theme: Theme) => {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    /* a browser refusing storage still gets the switch, just not the memory */
  }
  applyTheme(theme)
  for (const listener of listeners) listener()
}

/* `useSyncExternalStore` rather than state for the reason given in useFileView: the server has no
   localStorage, so the server snapshot is the default and the first client paint agrees with it. */
const useTheme = () => useSyncExternalStore(subscribe, readStored, () => 'auto' as Theme)

export { applyTheme, setTheme, useTheme }
export type { Theme }
