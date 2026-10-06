import * as path from 'node:path'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import type { Journey } from './harness'
import { chooseFolder, connectStorage, openPlace, PASSWORD, uploadButton } from './steps'

/* What a person does about the storage, once, for every file of the journey that needs one: send what is
   ready, and look at what is up there. Connecting and choosing a folder are in steps.ts. Everything goes
   through the page, as a person does it; the fake storage is read off its disk. */

/* the storage a file of the journey talks to, started with the world and stopped with the file */
const storageOf = () => {
  const held: { storage?: FakeStorage } = {}
  return {
    start: async () => {
      held.storage = await startFakeStorage({ password: PASSWORD })
    },
    stop: async () => {
      await held.storage?.stop()
    },
    get: () => {
      if (!held.storage) throw new Error('the fake storage is not started')
      return held.storage
    }
  }
}

/* The afternoon's end: the storage connected, the destination's folder chosen, its three prepared files
   sent, and the app opened again so the page shows what the record says. A file that follows on this starts
   from the state `processed`. */
const uploadSion = async (j: Journey, storage: FakeStorage) => {
  await j.open()
  await openPlace(j.page, 'Sion')
  await j.see('3 files are ready to upload')
  await connectStorage(j.page, storage)
  await chooseFolder(j.page, ['club', 'Dropzones', 'Sion'])
  await uploadButton(j.page).click()
  await j.see('Uploaded 3 files', 60_000)
  await j.open()
  await openPlace(j.page, 'Sion')
  await j.see('3 of 3 on the storage')
}

/* where the storage's own web interface opens on a file: the address the board was connected with and the
   path, in the form File Station reads its launch parameter */
const dsmAddress = (storage: FakeStorage, remote: string) =>
  `${storage.url}/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${encodeURIComponent(`openfile=${encodeURIComponent(remote)}`)}`

/* a file as the storage holds it, on its disk */
const onStorage = (storage: FakeStorage, ...parts: string[]) => path.join(storage.root, ...parts)

/* every upload the storage was asked for, by the name of the file */
const uploadsAsked = async (storage: FakeStorage) =>
  (await storage.admin.calls())
    .filter((c) => c.api.endsWith('Upload'))
    .map((c) => c.params.filename)
    .sort()

export { dsmAddress, onStorage, storageOf, uploadSion, uploadsAsked }
