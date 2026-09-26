import { stoppable } from './tools'

/* What is being uploaded right now (RULES, Uploading). One upload at a time: two at once would share
   the montage's folder being made ready, write the same zip together and fight over the storage's
   lists, so a second is refused and says what is going instead. The server outlives the page that
   asked — a page left, reloaded or reopened asks here rather than offering to start the same thing
   again on top of it — and an upload can be stopped at any moment, from anywhere it is shown.

   The stop reaches every step through the same cancellable context processing uses, so the code
   that sends, lists and zips asks for it where it is rather than having it handed down. Kept on the
   global object, as that context is, so a reload of this module during an upload still knows it. */

class UploadCancelled extends Error {
  /* what a fetch cut short by its own signal is called too, so a retry treats both alike */
  override name = 'AbortError'
  constructor() {
    super(
      'Upload cancelled — nothing was recorded; what was already sent is found again next time.'
    )
  }
}

type Upload = { key: string; label: string; done: Promise<unknown>; stop: AbortController }

declare global {
  var skydockUpload: Upload | undefined
}

const uploadingNow = () => {
  const upload = globalThis.skydockUpload
  return upload ? { key: upload.key, label: upload.label } : null
}

/* settles when the upload going now has finished, however it ended */
const whenUploaded = async () => {
  await globalThis.skydockUpload?.done.catch(() => undefined)
}

/* Stops the upload going now: the file being sent is cut off and nothing more starts. False when
   nothing was uploading. */
const cancelUploading = () => {
  const upload = globalThis.skydockUpload
  if (!upload) return false
  upload.stop.abort()
  return true
}

/* the stop of the work this runs for, when that work can be stopped */
const stopSignal = () => stoppable().getStore()

/* checked between steps: an upload that was cancelled starts nothing more */
const stopIfUploadCancelled = () => {
  if (stopSignal()?.aborted) throw new UploadCancelled()
}

/* What follows an upload once it is recorded — telling the storage's lists, looking at what it now
   holds — runs out of reach of a cancel: what is recorded is done, and a cancel then would only
   leave the board saying otherwise. */
const pastCancelling = <T>(work: () => Promise<T>) => stoppable().exit(work)

const runUpload = async <T>(
  { key, label }: { key: string; label: string },
  work: () => Promise<T>
) => {
  const going = globalThis.skydockUpload
  if (going) throw new Error(`Already uploading ${going.label} — wait for it, or cancel it, first.`)
  const job: Upload = { key, label, done: Promise.resolve(), stop: new AbortController() }
  const done = stoppable().run(job.stop.signal, work)
  job.done = done
  globalThis.skydockUpload = job
  try {
    return await done
  } catch (e) {
    /* whatever a cancel cut short — a request dropped, a zip abandoned — is the cancel it is */
    if (job.stop.signal.aborted) throw new UploadCancelled()
    throw e
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
