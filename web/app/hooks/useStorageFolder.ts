import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { storageFolderSchema } from '../../../packages/skydock-scripts/src/storageEntry'
import type { StorageFolder } from '../../../packages/skydock-scripts/src/storageEntry'
import { routingEngine } from '../helpers/routing'

/* which folder on the storage: a dropzone's, a montage's, or one the storage's own list names */
type Where = { destination?: string; groupId?: string; folder?: string }

/* What a place's folder on the storage holds, asked once when the place is opened and again when
   `stamp` changes — after an upload, or when asked to look again. Never on a timer: the storage is
   another machine, and nothing up there changes unless somebody here sends it. */
const useStorageFolder = (where: Where | null, stamp: unknown) => {
  const { destination, groupId, folder } = where ?? {}
  const key = where ? `${destination ?? ''}\0${groupId ?? ''}\0${folder ?? ''}` : null
  const [answered, setAnswered] = useState<{ key: string; folder: StorageFolder } | null>(null)

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    const answer = (told: StorageFolder) => {
      if (!cancelled) setAnswered({ key, folder: told })
    }
    routingEngine
      .loader({ url: '/api/storage-folder', searchParamsArgs: { destination, groupId, folder } })
      .then((raw) => {
        const parsed = storageFolderSchema.safeParse(raw)
        answer(
          parsed.success
            ? parsed.data
            : { ok: false, reason: t`The storage’s answer could not be read.` }
        )
      })
      .catch(() => answer({ ok: false, reason: t`The storage could not be reached.` }))
    return () => {
      cancelled = true
    }
  }, [key, destination, groupId, folder, stamp])

  /* an answer for another place is no answer for this one */
  return answered && answered.key === key ? answered.folder : null
}

export { useStorageFolder }
export type { Where as StorageWhere }
