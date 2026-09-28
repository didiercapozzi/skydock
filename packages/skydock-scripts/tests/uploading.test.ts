// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelUploading,
  runUpload,
  stopIfUploadCancelled,
  UploadCancelled,
  uploadingNow,
  whenUploaded
} from '../src/uploading'

/* One upload at a time, known to the server whichever page asked for it, and stoppable at any moment
   (RULES, Uploading). */

const going = { key: 'montage:g1', label: 'Luc Favre' }

/* an upload that runs until it is let go, stopping when cancelled */
const held = () => {
  let letGo = () => {}
  const until = new Promise<void>((resolve) => (letGo = resolve))
  const work = async () => {
    for (;;) {
      stopIfUploadCancelled()
      if (await Promise.race([until.then(() => true), tick().then(() => false)])) return 'sent'
    }
  }
  return { work, letGo: () => letGo() }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

afterEach(async () => {
  cancelUploading()
  await whenUploaded()
})

describe('one upload at a time', () => {
  it('says what is being uploaded while it is', async () => {
    const upload = held()
    const done = runUpload(going, upload.work)

    expect(uploadingNow()).toEqual({ ...going, groupIds: [] })
    upload.letGo()
    await expect(done).resolves.toBe('sent')
    expect(uploadingNow()).toBeNull()
  })

  it('refuses a second upload while one is going, naming the one going', async () => {
    const upload = held()
    const first = runUpload(going, upload.work)

    await expect(
      runUpload({ key: 'dest:Yverdon', label: 'Yverdon' }, async () => 'sent')
    ).rejects.toThrow(/Already uploading Luc Favre/)
    upload.letGo()
    await first
  })

  it('takes the next upload once one has failed', async () => {
    await expect(
      runUpload(going, async () => {
        throw new Error('the storage said no')
      })
    ).rejects.toThrow(/the storage said no/)

    await expect(runUpload(going, async () => 'sent')).resolves.toBe('sent')
  })
})

describe('cancelling an upload', () => {
  it('stops it at any moment, and says it was cancelled', async () => {
    const upload = held()
    const done = runUpload(going, upload.work)

    expect(cancelUploading()).toBe(true)
    await expect(done).rejects.toBeInstanceOf(UploadCancelled)
    expect(uploadingNow()).toBeNull()
  })

  it('has nothing to stop when nothing is uploading', () => {
    expect(cancelUploading()).toBe(false)
  })
})
