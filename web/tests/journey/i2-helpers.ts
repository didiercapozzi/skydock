import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import type { Locator, Page } from 'playwright'
import type { FakeStorage } from './fake-storage'
import type { Journey } from './harness'
import { filesUnder, WHO } from './media'
import { dialogNamed, pickInDialog } from './steps'

/* What the chapters about sending a montage share: the montage that is ready to go, the storage connected,
   and the upload dialog worked by hand. Everything here is what a person clicks; nothing answers for the app. */

/* a template as a person brings one: the project file kdenlive wrote, chosen from the computer */
const TEMPLATE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  'packages',
  'skydock-scripts',
  'tests',
  'fixtures',
  'house.kdenlive'
)

/* a jump dragged onto the Montages heading, named, prepared, given its project from a template */
const makeMontageReady = async (j: Journey) => {
  const { page } = j
  await j.open()
  await j.see('Jump 2')
  await page.getByText('Jump 2', { exact: true }).first().click()
  await page
    .getByText('Jump 2', { exact: true })
    .first()
    .dragTo(page.getByRole('heading', { name: /^Montages/ }))
  await page.getByLabel('Name', { exact: true }).fill(WHO)
  await page.keyboard.press('Enter')
  await j.see('Prepare the files')
  await page.getByRole('button', { name: 'Process', exact: true }).click()
  await page.getByRole('button', { name: 'Make the project' }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Make the project' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose files instead…' }).click()
  await (await chooser).setFiles(TEMPLATE)
  await page.getByRole('radio').first().waitFor()
  await page.getByRole('button', { name: 'Make the montage' }).click()
  await page.getByRole('button', { name: 'Open in kdenlive' }).first().waitFor({ timeout: 30_000 })
}

const uploadDialog = (page: Page) => dialogNamed(page, 'Upload')

/* the dialog opened from the montage's own page */
const openUpload = async (page: Page) => {
  await page.getByRole('button', { name: 'Upload…' }).first().click()
  await uploadDialog(page).waitFor()
}

/* a part of the montage dragged onto a zip, or onto the empty space to make a new one */
const dragPart = async (page: Page, part: string, onto: Locator) => {
  await uploadDialog(page).getByRole('button', { name: part, exact: true }).dragTo(onto)
}

const emptySpace = (page: Page) => uploadDialog(page).getByText(/Drop here/)

/* what an upload left on the storage's disk under a share's folder, as relative paths */
const stored = (storage: FakeStorage, ...folder: string[]) =>
  filesUnder(path.join(storage.root, 'club', ...folder))

/* what a zip on the storage holds, by the names of its entries */
const zipEntries = (file: string) => Object.keys(unzipSync(fs.readFileSync(file))).sort()

const region = (page: Page, name: string) =>
  uploadDialog(page).getByRole('region', { name, exact: true })

/* a destination added in the dialog, with what is to go there dragged onto it and then its folder chosen: the
   dialog is left to choose the folder, and a destination with nothing in it is forgotten when it comes back */
const sendTo = async (
  page: Page,
  destination: string,
  parts: string[],
  folders: string[],
  root = false
) => {
  const dialog = uploadDialog(page)
  if ((await region(page, destination).count()) === 0) {
    await dialog.getByLabel('Add a destination').selectOption(destination)
    await region(page, destination).waitFor()
  }
  for (const part of parts) await dragPart(page, part, region(page, destination))
  await region(page, destination)
    .getByRole('button', { name: 'choose its folder on the storage' })
    .click()
  await pickInDialog(page, folders)
  if (root) await region(page, destination).getByRole('button', { name: 'Straight in' }).click()
}

/* the upload dialog set up the way these chapters send a montage: the zip of the originals, the photos and the
   project to Backup, in a project folder; the film and the photos as they are straight into Club's folder.
   It is left open, nothing sent. */
const arrangeAsUsual = async (page: Page) => {
  await openUpload(page)
  await sendTo(page, 'Backup', [], ['club', 'Backup'])
  await sendTo(page, 'Club', ['The montage', 'Original photos'], ['club', 'Films'], true)
}

/* the same, and Upload pressed */
const sendAsUsual = async (page: Page) => {
  await arrangeAsUsual(page)
  await uploadDialog(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await uploadDialog(page).waitFor({ state: 'detached' })
}

export {
  arrangeAsUsual,
  dragPart,
  emptySpace,
  makeMontageReady,
  openUpload,
  region,
  sendAsUsual,
  sendTo,
  stored,
  uploadDialog,
  zipEntries
}
