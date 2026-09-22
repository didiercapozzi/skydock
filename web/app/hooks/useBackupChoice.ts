import { backupOptionsSchema } from '@skydock/scripts'
import type { BackupOptions } from '@skydock/scripts'
import { useSyncExternalStore } from 'react'

/* How a tandem's upload keeps the originals — one zip or plain files, with or without a copy of the
   film and of the editing project. It is one choice for the whole club rather than a question per
   passenger, so it is remembered and the next tandem opens with it already made. Read through
   `useSyncExternalStore` for the same reason as the file view: the server renders the default, and
   the stored choice follows in the same commit. The snapshot is a string, because a new object every
   read would never settle. */
type BackupChoice = Required<BackupOptions>

const KEY = 'skydock.backup'

/* kind, then the film: `zip:false` */
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
    return localStorage.getItem(KEY) ?? chosen
  } catch {
    return chosen
  }
}

/* A choice stored by an older board carries a third part, for a project that is now always kept: it
   is read and dropped. Anything that does not make sense is the default rather than a guess. */
const parse = (stored: string): BackupChoice => {
  const [backupAs, film] = stored.split(':')
  const parsed = backupOptionsSchema.safeParse({ backupAs, filmToBackup: film === 'true' })
  return parsed.success ? parsed.data : { backupAs: 'zip', filmToBackup: false }
}

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
