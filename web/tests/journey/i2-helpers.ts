import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import type { Locator, Page } from 'playwright'
import type { FakeStorage } from './fake-storage'
import type { Journey } from './harness'
import { makeEdit } from './i1-helpers'
import { filesUnder, WHO } from './media'
import { dialogNamed, pickInDialog } from './steps'

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
  await page.getByText('Edit the film').first().waitFor({ timeout: 60_000 })
  await makeEdit(j)
}

const uploadDialog = (page: Page) => dialogNamed(page, 'Upload')

const openUpload = async (page: Page) => {
  await page.getByRole('button', { name: 'Upload…' }).first().click()
  await uploadDialog(page).waitFor()
}

const dragPart = async (page: Page, part: string, onto: Locator) => {
  await uploadDialog(page).getByRole('button', { name: part, exact: true }).dragTo(onto)
}

const emptySpace = (page: Page) => uploadDialog(page).getByText(/Drop here/)

const stored = (storage: FakeStorage, ...folder: string[]) =>
  filesUnder(path.join(storage.root, 'club', ...folder))

const zipEntries = (file: string) => Object.keys(unzipSync(fs.readFileSync(file))).sort()

const region = (page: Page, name: string) =>
  uploadDialog(page).getByRole('region', { name, exact: true })

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

const arrangeAsUsual = async (page: Page) => {
  await openUpload(page)
  await sendTo(page, 'Backup', [], ['club', 'Backup'])
  await sendTo(page, 'Club', ['The montage', 'Original photos'], ['club', 'Films'], true)
}

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
