import { useEffect, useState } from 'react'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'

const progressSchema = z.object({
  jumpId: z.string(),
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number(),
  totalFiles: z.number(),
  state: z.enum(['uploading', 'done', 'error']),
  error: z.string().optional()
})
type UploadProgressState = z.infer<typeof progressSchema>

const useUploadProgress = (jumpId: string | null) => {
  const [rawProgress, setRawProgress] = useState<UploadProgressState | null>(null)

  useEffect(() => {
    if (!jumpId) return
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const raw = await routingEngine.loader({
          url: '/api/upload-progress',
          searchParamsArgs: { jumpId }
        })
        if (raw === null || raw === undefined) return
        const parsed = progressSchema.safeParse(raw)
        if (parsed.success && parsed.data.jumpId === jumpId && !cancelled)
          setRawProgress(parsed.data)
      } catch {}
    }
    queueMicrotask(fetchOnce)
    const id = setInterval(fetchOnce, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [jumpId])

  const progress = jumpId && rawProgress?.jumpId === jumpId ? rawProgress : null
  return progress
}

export { useUploadProgress }
export type { UploadProgressState }
