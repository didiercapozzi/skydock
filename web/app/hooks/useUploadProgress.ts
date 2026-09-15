import { useEffect, useState } from 'react'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'

const progressSchema = z.object({
  groupId: z.string(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  state: z.enum(['uploading', 'done', 'error']),
  error: z.string().optional()
})
type UploadProgressState = z.infer<typeof progressSchema>

const useUploadProgress = (groupId: string | null) => {
  const [rawProgress, setRawProgress] = useState<UploadProgressState | null>(null)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const raw = await routingEngine.loader({
          url: '/api/upload-progress',
          searchParamsArgs: { groupId }
        })
        if (raw === null || raw === undefined) return
        const parsed = progressSchema.safeParse(raw)
        if (parsed.success && parsed.data.groupId === groupId && !cancelled)
          setRawProgress(parsed.data)
      } catch {}
    }
    queueMicrotask(fetchOnce)
    const id = setInterval(fetchOnce, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [groupId])

  const progress = groupId && rawProgress?.groupId === groupId ? rawProgress : null
  return progress
}

export { useUploadProgress }
export type { UploadProgressState }
