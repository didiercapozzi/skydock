import { expect } from 'vitest'
import type { Locator, Page } from 'playwright'
import type { FakeStorage } from './fake-storage'

/* What a person does on the page, written once for every file of the journey: the menu of places, the
   panel on the right, dialogs, a destination added, the storage connected and a folder of it chosen, a clip
   opened in the preview, and the waits a person makes on what is on screen. Everything takes the page, and
   everything is a click, a key or a look. */

const USER = 'admin'
const PASSWORD = 'tiny-secret-9'

/* ---- places ---- */

/* the menu of places down the left */
const folders = (page: Page) => page.getByRole('navigation', { name: 'Folders' })

/* a place's entry in the menu, by its name */
const place = (page: Page, name: string | RegExp) =>
  folders(page).getByRole('link', { name: typeof name === 'string' ? new RegExp(name) : name })

const fresh = (page: Page) => place(page, /Fresh files/)
const sionLink = (page: Page) => place(page, /Sion/)

/* a place is opened from the menu, as a person does */
const openPlace = (page: Page, name: string | RegExp) => place(page, name).click()

/* a destination's page, once it has drawn its head */
const openSion = async (page: Page) => {
  await openPlace(page, 'Sion')
  await page.getByRole('region', { name: 'Sion' }).waitFor()
}

/* a destination made the way a person makes one: the button in the menu, a name, Add */
const addDestination = async (page: Page, name: string) => {
  await page.getByRole('button', { name: /Add a destination/ }).click()
  await page.getByPlaceholder('New destination').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await place(page, name).waitFor()
}

/* the row a file is listed in: a box of its own, the one a person clicks to look at it */
const rowOf = (page: Page, name: string, within = 'main') =>
  page.locator(within).locator('[role=button][data-file]').filter({ hasText: name })

/* a jump's card, found by its name */
const cardOf = (page: Page, name: string) => page.getByRole('button', { name: `${name},` })

/* ---- the panel on the right, and dialogs ---- */

const details = (page: Page) => page.getByRole('complementary', { name: 'Details' })

/* the panel, brought back with its icon when it is away, as a person would */
const showDetails = async (page: Page) => {
  if (await details(page).isVisible()) return
  await page.getByRole('button', { name: 'Details', exact: true }).first().click()
  await details(page).waitFor()
}

const dialogNamed = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })

const preview = (page: Page) => dialogNamed(page, 'Preview')

/* a clip is opened by double-clicking its name where it is listed, and is ready when the preview says where it
   is in its jump */
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

/* ---- the storage ---- */

/* the dialog the footer's Connect opens, filled in; what the storage answers is for the chapter to read */
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

/* connected from the footer, and the footer says who */
const connectStorage = async (page: Page, storage: FakeStorage) => {
  await page.getByRole('button', { name: 'Connect the storage' }).click()
  const dialog = await fillConnection(page, storage)
  await dialog.waitFor({ state: 'detached' })
  await page.getByText(`${USER} @ 127.0.0.1`).first().waitFor({ state: 'visible', timeout: 15_000 })
}

/* the folder dialog's list once the storage has answered for the folder just opened: its listing is not
   replaced any more, which is when a person would read it */
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

/* the folder dialog, once it is open: each step of the way is opened, a folder that is not there yet is
   made, and the last is chosen. `steps` are the names from the share down. */
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

/* a destination's folder, chosen from its panel */
const chooseFolder = async (page: Page, steps: string[]) => {
  await showDetails(page)
  await page.getByRole('button', { name: /^(Choose…|Change)$/ }).click()
  await pickInDialog(page, steps)
  await page
    .getByText(`/${steps.join('/')}`)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
}

/* the destination's own Upload button, which says how many files it sends */
const uploadButton = (page: Page) => page.getByRole('button', { name: /^Upload \d+ files?$/ })

/* ---- waits on what is on screen ---- */

const LONG = { timeout: 30_000 }

/* what the page says, waited for as a person waits for it: the text of what is on screen, how many there are,
   what a field holds, whether a button can be pressed, what it says when it cannot */
const said = (locator: Locator) =>
  expect.poll(async () => (await locator.allInnerTexts()).join('\n'), LONG)
const counted = (locator: Locator) => expect.poll(() => locator.count(), LONG)
const typed = (locator: Locator) => expect.poll(() => locator.inputValue(), LONG)
const disabled = (locator: Locator) => expect.poll(() => locator.isDisabled(), LONG)
const titled = (locator: Locator) => expect.poll(() => locator.getAttribute('title'), LONG)

/* what a person waits for: a page that shows it a moment from now, which a check is asked again until it does */
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
