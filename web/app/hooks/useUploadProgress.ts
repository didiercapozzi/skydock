import { useEffect, useState } from 'react'
import { z } from 'zod'

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
    let closed = false
    const es = new EventSource(`/api/upload-progress?jumpId=${encodeURIComponent(jumpId)}`)
    es.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data as string)
        if (raw === null) return
        const parsed = progressSchema.safeParse(raw)
        if (parsed.success) {
          if (parsed.data.jumpId === jumpId) setRawProgress(parsed.data)
        }
      } catch {}
    }
    es.onerror = () => {
      if (closed) return
    }
    return () => {
      closed = true
      es.close()
    }
  }, [jumpId])

  const progress = jumpId && rawProgress?.jumpId === jumpId ? rawProgress : null
  return progress
}

export { useUploadProgress }
export type { UploadProgressState }
