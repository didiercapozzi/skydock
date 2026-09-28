import { uploadProgressStateSchema } from '@skydock/scripts'
import type { UploadProgressState } from '@skydock/scripts'
import { useEffect, useState } from 'react'
import { routingEngine } from '../helpers/routing'

/* `scope` is what the server keyed the job with — `group:{id}` for one jump, `dest:{name}` for a
   whole destination — so a poller only ever picks up its own upload. */
const useUploadProgress = (scope: string | null) => {
  const [rawProgress, setRawProgress] = useState<UploadProgressState | null>(null)

  useEffect(() => {
    if (!scope) return
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const raw = await routingEngine.loader({
          url: '/api/upload-progress',
          searchParamsArgs: { scope }
        })
        if (raw === null || raw === undefined) return
        const parsed = uploadProgressStateSchema.safeParse(raw)
        if (!parsed.success || parsed.data.scope !== scope || cancelled) return
        /* the same as a second ago draws nothing again */
        const now = parsed.data
        setRawProgress((before) =>
          before && JSON.stringify(before) === JSON.stringify(now) ? before : now
        )
      } catch {}
    }
    queueMicrotask(fetchOnce)
    const id = setInterval(fetchOnce, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [scope])

  return scope && rawProgress?.scope === scope ? rawProgress : null
}

export { useUploadProgress }
export type { UploadProgressState }
