import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect } from 'vitest'
import { z } from 'zod'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import type { harness } from './harness'
import type { World } from './app'

/* What a person does about the storage, once, for every file of the journey that needs one: connect in
   the dialog, choose the folder of a destination, send what is ready, and look at what is up there.
   Everything goes through the page, as a person does it; the fake storage is read off its disk. */

type Journey = ReturnType<typeof harness>

const USER = 'admin'
const PASSWORD = 'tiny-secret-9'

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

const folders = (j: Journey) => j.page.getByRole('navigation', { name: 'Folders' })

/* a place is opened from the rail, as a person does */
const openPlace = async (j: Journey, name: string | RegExp) => {
  await folders(j)
    .getByRole('link', { name: typeof name === 'string' ? new RegExp(name) : name })
    .click()
}

/* the dialog the footer's Connect opens, filled in; what the storage answers is for the chapter to read */
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

/* connected from the footer, and the footer says who */
const connect = async (j: Journey, storage: FakeStorage) => {
  await j.page.getByRole('button', { name: 'Connect the storage' }).click()
  const dialog = await fillConnection(j, storage)
  await dialog.waitFor({ state: 'detached' })
  await j.see(`${USER} @ 127.0.0.1`)
}

/* the right panel of the page, where a destination's folder is chosen */
const showDetails = async (j: Journey) => {
  const asked = j.page.getByRole('button', { name: /^(Choose…|Change)$/ })
  if (!(await asked.isVisible()))
    await j.page.getByRole('button', { name: 'Details' }).first().click()
  await asked.waitFor()
}

/* the folder dialog's list once the storage has answered for the folder just opened: its listing is not
   replaced any more, which is when a person would read it */
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

/* the folder dialog, once it is open: each step of the way is opened, a folder that is not there yet is
   made, and the last is chosen. `steps` are the names from the share down. */
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

/* A destination's folder, chosen from its panel */
const chooseFolder = async (j: Journey, steps: string[]) => {
  await showDetails(j)
  await j.page.getByRole('button', { name: /^(Choose…|Change)$/ }).click()
  await pickInDialog(j, steps)
  await j.see(`/${steps.join('/')}`)
}

/* The afternoon's end: the storage connected, the destination's folder chosen, its three prepared files
   sent, and the app opened again so the page shows what the record says. A file that follows on this starts
   from the state `processed`. */
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

/* the destination's own Upload button, which says how many files it sends */
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

/* what the board's record says about each file's upload, read off the disk by the file's name */
const recordedUploads = (world: World) => {
  const parsed = manifestSchema.parse(
    JSON.parse(fs.readFileSync(path.join(world.output, 'manifest.json'), 'utf8'))
  )
  return new Map(parsed.files.map((f) => [f.filename, f.uploaded ?? null]))
}

/* the board's own name for a file, by what it was called on the camera */
const idOf = (world: World, filename: string) => {
  const parsed = manifestSchema.parse(
    JSON.parse(fs.readFileSync(path.join(world.output, 'manifest.json'), 'utf8'))
  )
  const id = parsed.files.find((f) => f.filename === filename)?.id
  if (!id) throw new Error(`the record has no ${filename}`)
  return id
}

/* the jumps the board's record holds, by their ids */
const recordedJumps = (world: World) =>
  z
    .object({ groups: z.array(z.object({ id: z.string() }).passthrough()) })
    .parse(JSON.parse(fs.readFileSync(path.join(world.output, 'groups.json'), 'utf8')))
    .groups.map((g) => g.id)

/* every destination the board's record holds, with the folder it was given */
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

/* what the board's record says is up there, as the paths it sent them to */
const recordedRemotePaths = (world: World) =>
  [...recordedUploads(world).values()].flatMap((u) => (u ? [u.remotePath] : [])).sort()

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
