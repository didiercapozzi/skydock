import * as path from 'node:path'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import type { Journey } from './harness'
import { chooseFolder, connectStorage, openPlace, PASSWORD, uploadButton } from './steps'

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

const dsmAddress = (storage: FakeStorage, remote: string) =>
  `${storage.url}/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${encodeURIComponent(`openfile=${encodeURIComponent(remote)}`)}`

const onStorage = (storage: FakeStorage, ...parts: string[]) => path.join(storage.root, ...parts)

const uploadsAsked = async (storage: FakeStorage) =>
  (await storage.admin.calls())
    .filter((c) => c.api.endsWith('Upload'))
    .map((c) => c.params.filename)
    .sort()

export { dsmAddress, onStorage, storageOf, uploadSion, uploadsAsked }
