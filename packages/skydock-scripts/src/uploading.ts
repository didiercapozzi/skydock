import { stoppable } from './tools'

class UploadCancelled extends Error {
  override name = 'AbortError'
  constructor() {
    super(
      'Upload cancelled — nothing was recorded; what was already sent is found again next time.'
    )
  }
}

type Upload = {
  key: string
  label: string
  groupIds: string[]
  done: Promise<unknown>
  stop: AbortController
}

declare global {
  var skydockUpload: Upload | undefined
}

const uploadingNow = () => {
  const upload = globalThis.skydockUpload
  return upload ? { key: upload.key, label: upload.label, groupIds: upload.groupIds } : null
}

const whenUploaded = async () => {
  await globalThis.skydockUpload?.done.catch(() => undefined)
}

const cancelUploading = () => {
  const upload = globalThis.skydockUpload
  if (!upload) return false
  upload.stop.abort()
  return true
}

const stopSignal = () => stoppable().getStore()

const stopIfUploadCancelled = () => {
  if (stopSignal()?.aborted) throw new UploadCancelled()
}

const pastCancelling = <T>(work: () => Promise<T>) => stoppable().exit(work)

const runUpload = async <T>(
  { key, label, groupIds = [] }: { key: string; label: string; groupIds?: string[] },
  work: () => Promise<T>
) => {
  const going = globalThis.skydockUpload
  if (going) throw new Error(`Already uploading ${going.label} — wait for it, or cancel it, first.`)
  const job: Upload = { key, label, groupIds, done: Promise.resolve(), stop: new AbortController() }
  const done = stoppable().run(job.stop.signal, async () => {
    try {
      return await work()
    } catch (e) {
      throw job.stop.signal.aborted ? new UploadCancelled() : e
    }
  })
  job.done = done
  globalThis.skydockUpload = job
  try {
    return await done
  } finally {
    if (globalThis.skydockUpload === job) globalThis.skydockUpload = undefined
  }
}

export {
  cancelUploading,
  pastCancelling,
  runUpload,
  stopIfUploadCancelled,
  stopSignal,
  UploadCancelled,
  uploadingNow,
  whenUploaded
}
