import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect } from 'vitest'
import { z } from 'zod'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import type { harness } from './harness'
import type { World } from './app'

type Journey = ReturnType<typeof harness>

const USER = 'admin'
const PASSWORD = 'tiny-secret-9'

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

const folders = (j: Journey) => j.page.getByRole('navigation', { name: 'Folders' })

const openPlace = async (j: Journey, name: string | RegExp) => {
  await folders(j)
    .getByRole('link', { name: typeof name === 'string' ? new RegExp(name) : name })
    .click()
}

const fillConnection = async (
  j: Journey,
  storage: FakeStorage,
  { password = PASSWORD, code }: { password?: string; code?: string } = {}
) => {
  const dialog = j.page.getByRole('dialog', { name: 'Connect to the storage' })
  await dialog.getByLabel('Storage address').fill(storage.url)
  await dialog.getByLabel('Username').fill(USER)
  await dialog.getByLabel('Password').fill(password)
  if (code !== undefined) await dialog.getByLabel('2-step verification code').fill(code)
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  return dialog
}

const connect = async (j: Journey, storage: FakeStorage) => {
  await j.page.getByRole('button', { name: 'Connect the storage' }).click()
  const dialog = await fillConnection(j, storage)
  await dialog.waitFor({ state: 'detached' })
  await j.see(`${USER} @ 127.0.0.1`)
}

const showDetails = async (j: Journey) => {
  const asked = j.page.getByRole('button', { name: /^(Choose…|Change)$/ })
  if (!(await asked.isVisible()))
    await j.page.getByRole('button', { name: 'Details' }).first().click()
  await asked.waitFor()
}

const listed = async (j: Journey, dialog: ReturnType<Journey['page']['locator']>) => {
  await dialog.getByText('Loading…').waitFor({ state: 'detached' })
  let before = ''
  await expect
    .poll(async () => {
      const now = (await dialog.locator('button[aria-selected]').allInnerTexts()).join('|')
      const same = now === before
      before = now
      return same
    })
    .toBe(true)
  return j
}

const pickInDialog = async (j: Journey, steps: string[]) => {
  const dialog = j.page.locator('[data-nas-folder-dialog]')
  await listed(j, dialog)
  await dialog.getByRole('button', { name: 'Shares', exact: true }).click()
  for (const [at, step] of steps.entries()) {
    const entry = dialog.getByRole('button', { name: step, exact: true })
    await listed(j, dialog)
    if (!(await entry.isVisible())) {
      await dialog.getByRole('button', { name: '+ New folder' }).click()
      await dialog.getByLabel('New folder name').fill(step)
      await dialog.getByRole('button', { name: 'Create' }).click()
      await entry.waitFor()
    }
    if (at < steps.length - 1) await entry.dblclick()
    else await entry.click()
  }
  await dialog.getByRole('button', { name: 'Use this folder' }).click()
  await dialog.waitFor({ state: 'detached' })
}

const chooseFolder = async (j: Journey, steps: string[]) => {
  await showDetails(j)
  await j.page.getByRole('button', { name: /^(Choose…|Change)$/ }).click()
  await pickInDialog(j, steps)
  await j.see(`/${steps.join('/')}`)
}

const uploadSion = async (j: Journey, storage: FakeStorage) => {
  await j.open()
  await openPlace(j, 'Sion')
  await j.see('3 files are ready to upload')
  await connect(j, storage)
  await chooseFolder(j, ['club', 'Dropzones', 'Sion'])
  await uploadButton(j).click()
  await j.see('Uploaded 3 files', 60_000)
  await j.open()
  await openPlace(j, 'Sion')
  await j.see('3 of 3 on the storage')
}

const uploadButton = (j: Journey) => j.page.getByRole('button', { name: /^Upload \d+ files?$/ })

const manifestSchema = z
  .object({
    files: z.array(
      z
        .object({
          id: z.string().nullish(),
          filename: z.string(),
          path: z.string(),
          destination: z.string().nullish(),
          uploaded: z.object({ remotePath: z.string(), md5: z.string() }).passthrough().nullish()
        })
        .passthrough()
    )
  })
  .passthrough()

const recordedUploads = (world: World) => {
  const parsed = manifestSchema.parse(
    JSON.parse(fs.readFileSync(path.join(world.output, 'manifest.json'), 'utf8'))
  )
  return new Map(parsed.files.map((f) => [f.filename, f.uploaded ?? null]))
}

const idOf = (world: World, filename: string) => {
  const parsed = manifestSchema.parse(
    JSON.parse(fs.readFileSync(path.join(world.output, 'manifest.json'), 'utf8'))
  )
  const id = parsed.files.find((f) => f.filename === filename)?.id
  if (!id) throw new Error(`the record has no ${filename}`)
  return id
}

const recordedJumps = (world: World) =>
  z
    .object({ groups: z.array(z.object({ id: z.string() }).passthrough()) })
    .parse(JSON.parse(fs.readFileSync(path.join(world.output, 'groups.json'), 'utf8')))
    .groups.map((g) => g.id)

const recordedFolders = (world: World) =>
  Object.fromEntries(
    z
      .object({
        destinations: z.array(
          z.object({ name: z.string(), path: z.string().nullish() }).passthrough()
        )
      })
      .parse(JSON.parse(fs.readFileSync(path.join(world.output, 'manifest.json'), 'utf8')))
      .destinations.map((d) => [d.name, d.path ?? null])
  )

const recordedRemotePaths = (world: World) =>
  [...recordedUploads(world).values()].flatMap((u) => (u ? [u.remotePath] : [])).sort()

const dsmAddress = (storage: FakeStorage, remote: string) =>
  `${storage.url}/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${encodeURIComponent(`openfile=${encodeURIComponent(remote)}`)}`

const onStorage = (storage: FakeStorage, ...parts: string[]) => path.join(storage.root, ...parts)

const uploadsAsked = async (storage: FakeStorage) =>
  (await storage.admin.calls())
    .filter((c) => c.api.endsWith('Upload'))
    .map((c) => c.params.filename)
    .sort()

export {
  chooseFolder,
  connect,
  dsmAddress,
  fillConnection,
  folders,
  idOf,
  onStorage,
  openPlace,
  PASSWORD,
  pickInDialog,
  recordedFolders,
  recordedJumps,
  recordedRemotePaths,
  recordedUploads,
  storageOf,
  uploadButton,
  uploadSion,
  uploadsAsked
}
