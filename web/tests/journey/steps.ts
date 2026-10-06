import { expect } from 'vitest'
import type { Locator, Page } from 'playwright'
import type { FakeStorage } from './fake-storage'

const USER = 'admin'
const PASSWORD = 'tiny-secret-9'

const folders = (page: Page) => page.getByRole('navigation', { name: 'Folders' })

const place = (page: Page, name: string | RegExp) =>
  folders(page).getByRole('link', { name: typeof name === 'string' ? new RegExp(name) : name })

const fresh = (page: Page) => place(page, /Fresh files/)
const sionLink = (page: Page) => place(page, /Sion/)

const openPlace = (page: Page, name: string | RegExp) => place(page, name).click()

const openSion = async (page: Page) => {
  await openPlace(page, 'Sion')
  await page.getByRole('region', { name: 'Sion' }).waitFor()
}

const addDestination = async (page: Page, name: string) => {
  await page.getByRole('button', { name: /Add a destination/ }).click()
  await page.getByPlaceholder('New destination').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await place(page, name).waitFor()
}

const rowOf = (page: Page, name: string, within = 'main') =>
  page.locator(within).locator('[role=button][data-file]').filter({ hasText: name })

const cardOf = (page: Page, name: string) => page.getByRole('button', { name: `${name},` })

const details = (page: Page) => page.getByRole('complementary', { name: 'Details' })

const showDetails = async (page: Page) => {
  if (await details(page).isVisible()) return
  await page.getByRole('button', { name: 'Details', exact: true }).first().click()
  await details(page).waitFor()
}

const dialogNamed = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })

const preview = (page: Page) => dialogNamed(page, 'Preview')

const openClip = async (page: Page, name: string) => {
  await page.getByText(name, { exact: true }).first().dblclick()
  await preview(page).waitFor()
  await preview(page)
    .getByText(/\d of \d+$/)
    .waitFor()
}

const closeClip = async (page: Page) => {
  await page.keyboard.press('Escape')
  await preview(page).waitFor({ state: 'detached' })
}

const fillConnection = async (
  page: Page,
  storage: FakeStorage,
  { password = PASSWORD, code }: { password?: string; code?: string } = {}
) => {
  const dialog = dialogNamed(page, 'Connect to the storage')
  await dialog.getByLabel('Storage address').fill(storage.url)
  await dialog.getByLabel('Username').fill(USER)
  await dialog.getByLabel('Password').fill(password)
  if (code !== undefined) await dialog.getByLabel('2-step verification code').fill(code)
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  return dialog
}

const connectStorage = async (page: Page, storage: FakeStorage) => {
  await page.getByRole('button', { name: 'Connect the storage' }).click()
  const dialog = await fillConnection(page, storage)
  await dialog.waitFor({ state: 'detached' })
  await page.getByText(`${USER} @ 127.0.0.1`).first().waitFor({ state: 'visible', timeout: 15_000 })
}

const listed = async (dialog: Locator) => {
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
}

const pickInDialog = async (page: Page, steps: string[]) => {
  const dialog = page.locator('[data-nas-folder-dialog]')
  await listed(dialog)
  await dialog.getByRole('button', { name: 'Shares', exact: true }).click()
  for (const [at, step] of steps.entries()) {
    const entry = dialog.getByRole('button', { name: step, exact: true })
    await listed(dialog)
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

const chooseFolder = async (page: Page, steps: string[]) => {
  await showDetails(page)
  await page.getByRole('button', { name: /^(Choose…|Change)$/ }).click()
  await pickInDialog(page, steps)
  await page
    .getByText(`/${steps.join('/')}`)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
}

const uploadButton = (page: Page) => page.getByRole('button', { name: /^Upload \d+ files?$/ })

const LONG = { timeout: 30_000 }

const said = (locator: Locator) =>
  expect.poll(async () => (await locator.allInnerTexts()).join('\n'), LONG)
const counted = (locator: Locator) => expect.poll(() => locator.count(), LONG)
const typed = (locator: Locator) => expect.poll(() => locator.inputValue(), LONG)
const disabled = (locator: Locator) => expect.poll(() => locator.isDisabled(), LONG)
const titled = (locator: Locator) => expect.poll(() => locator.getAttribute('title'), LONG)

const eventually = <T>(check: () => T | Promise<T>) => expect.poll(check, { timeout: 20_000 })

export {
  addDestination,
  cardOf,
  chooseFolder,
  closeClip,
  connectStorage,
  counted,
  details,
  dialogNamed,
  disabled,
  eventually,
  fillConnection,
  folders,
  fresh,
  openClip,
  openPlace,
  openSion,
  PASSWORD,
  pickInDialog,
  place,
  preview,
  rowOf,
  said,
  showDetails,
  sionLink,
  titled,
  typed,
  uploadButton
}
