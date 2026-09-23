import { backupOptionsSchema } from '@skydock/scripts'
import type { BackupOptions } from '@skydock/scripts'
import { remembered } from './remembered'

/* How a tandem's upload keeps the originals — one zip or plain files, with or without a copy of the
   film. It is one choice for the whole club rather than a question per passenger, so it is
   remembered and the next tandem opens with it already made. */
type BackupChoice = Required<BackupOptions>

/* A choice stored by an older board carries a third part, for a project that is now always kept: it
   is read and dropped. Anything that does not make sense is the default rather than a guess. */
const choice = remembered<BackupChoice>({
  key: 'skydock.backup',
  fallback: { backupAs: 'zip', filmToBackup: false },
  from: (stored) => {
    const [backupAs, film] = stored.split(':')
    return backupOptionsSchema.safeParse({ backupAs, filmToBackup: film === 'true' }).data ?? null
  },
  /* kind, then the film: `zip:false` */
  to: (made) => `${made.backupAs}:${made.filmToBackup}`
})

const setBackupChoice = choice.set
const useBackupChoice = choice.use

export { setBackupChoice, useBackupChoice }
export type { BackupChoice }
