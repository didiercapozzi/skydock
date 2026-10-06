import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import type { Locator, Page } from 'playwright'
import { expect } from 'vitest'
import type { FakeStorage } from './fake-storage'
import type { harness } from './harness'
import { filesUnder, makeClip } from './media'

/* What the chapters about sending a montage share: the montage that is ready to go, the storage connected,
   and the upload dialog worked by hand. Everything here is what a person clicks; nothing answers for the app. */

type Journey = ReturnType<typeof harness>

/* the montage made from the second jump of the saved `sorted` state: two videos and a photo, for Luc Favre */
const WHO = 'Luc Favre'
const STEM = 'luc_favre_20260906_090000'
const FILM = 'luc_favre_20260906.mp4'

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

const montageFolder = (j: Journey) => path.join(j.world.output, 'processed', 'Montages', WHO)

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

/* The editor is not here, so the film is what the editor would have left: an mp4 under the name the project
   was told to render to, in the montage's folder. The board looks at that folder every couple of seconds. */
const renderFilm = async (j: Journey, name = FILM, seconds = 3) => {
  makeClip(path.join(montageFolder(j), name), '2026-09-06T09:00:00', seconds)
}

/* a destination made from the sidebar */
const addDestination = async (page: Page, name: string) => {
  await page.getByRole('button', { name: /Add a destination/ }).click()
  await page.getByPlaceholder('New destination').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('link', { name: new RegExp(name) })
    .waitFor()
}

/* the storage connected from the status bar, the way its first use goes */
const connectStorage = async (page: Page, storage: FakeStorage, password = 'skydock') => {
  await page.getByRole('button', { name: 'Connect the storage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Connect to the storage' })
  await dialog.getByLabel('Storage address').fill(storage.url)
  await dialog.getByLabel('Username').fill('admin')
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/* the folder chooser answered: down into the share, into (and made, when it is not there) each folder of the path */
const chooseStorageFolder = async (page: Page, folders: string[]) => {
  const chooser = page.getByRole('dialog', { name: /storage folder/i })
  await chooser.waitFor()
  for (const [i, name] of folders.entries()) {
    const entry = chooser.getByRole('button', { name, exact: true })
    if (i > 0 && (await entry.count()) === 0) {
      await chooser.getByRole('button', { name: '+ New folder' }).click()
      await chooser.getByLabel('New folder name').fill(name)
      await chooser.getByRole('button', { name: 'Create' }).click()
    }
    await entry.waitFor()
    if (i < folders.length - 1) await entry.dblclick()
    else await entry.click()
  }
  await chooser.getByRole('button', { name: 'Use this folder' }).click()
  await chooser.waitFor({ state: 'detached' })
}

const uploadDialog = (page: Page) => page.getByRole('dialog', { name: 'Upload' })

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

/* what the page says, waited for as a person waits for it: the text of what is on screen, how many there are,
   what a field holds, whether a button can be pressed, what it says when it cannot */
const said = (locator: Locator) =>
  expect.poll(async () => (await locator.allInnerTexts()).join('\n'), { timeout: 30_000 })
const counted = (locator: Locator) => expect.poll(() => locator.count(), { timeout: 30_000 })
const typed = (locator: Locator) => expect.poll(() => locator.inputValue(), { timeout: 30_000 })
const disabled = (locator: Locator) => expect.poll(() => locator.isDisabled(), { timeout: 30_000 })
const titled = (locator: Locator) =>
  expect.poll(() => locator.getAttribute('title'), { timeout: 30_000 })

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
  await chooseStorageFolder(page, folders)
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
  addDestination,
  arrangeAsUsual,
  counted,
  disabled,
  said,
  titled,
  typed,
  chooseStorageFolder,
  connectStorage,
  dragPart,
  emptySpace,
  FILM,
  filesUnder,
  makeMontageReady,
  montageFolder,
  openUpload,
  region,
  renderFilm,
  sendAsUsual,
  sendTo,
  STEM,
  stored,
  uploadDialog,
  WHO,
  zipEntries
}
export type { Journey }
