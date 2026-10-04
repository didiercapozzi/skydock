import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { storageFolderSchema } from '../../../packages/skydock-scripts/src/storageEntry'
import type { StorageFolder } from '../../../packages/skydock-scripts/src/storageEntry'
import { routingEngine } from '../helpers/routing'

type Where = { destination?: string; groupId?: string; folder?: string }

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

  return answered && answered.key === key ? answered.folder : null
}

export { useStorageFolder }
export type { Where as StorageWhere }
