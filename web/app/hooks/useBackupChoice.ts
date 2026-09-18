import { useSyncExternalStore } from 'react'

/* How a delivery keeps the originals — one zip or plain files, with or without a copy of the film.
   It is one choice for the whole club rather than a question per passenger, so it is remembered and
   the next tandem opens with it already made. Read through `useSyncExternalStore` for the same
   reason as the file view: the server renders the default, and the stored choice follows in the
   same commit. The snapshot is a string, because a new object every read would never settle. */
type BackupChoice = { backupAs: 'zip' | 'folder'; filmToBackup: boolean }

const KEY = 'skydock.backup'

const DEFAULT = 'zip:false'

/* what was chosen in this page, for a browser that will not store it */
let chosen = DEFAULT

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const readStored = () => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored && /^(zip|folder):(true|false)$/.test(stored) ? stored : chosen
  } catch {
    return chosen
  }
}

const parse = (stored: string): BackupChoice => ({
  backupAs: stored.startsWith('folder') ? 'folder' : 'zip',
  filmToBackup: stored.endsWith(':true')
})

const setBackupChoice = (choice: BackupChoice) => {
  chosen = `${choice.backupAs}:${choice.filmToBackup}`
  try {
    localStorage.setItem(KEY, chosen)
  } catch {
    /* a browser refusing storage still gets the choice, just not the memory */
  }
  for (const listener of listeners) listener()
}

const useBackupChoice = () => parse(useSyncExternalStore(subscribe, readStored, () => DEFAULT))

export { setBackupChoice, useBackupChoice }
export type { BackupChoice }
