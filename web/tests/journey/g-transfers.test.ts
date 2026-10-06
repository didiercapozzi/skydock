import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { harness } from './harness'
import { dsmAddress, onStorage, storageOf } from './f-helpers'
import {
  chooseFolder,
  connectStorage,
  details,
  folders,
  openPlace,
  openSion,
  preview,
  showDetails,
  uploadButton
} from './steps'

/* What is kept of the afternoon once the files are up there: the Transfers window, the way from a file to
   the storage's own web interface, the links handed out, and what the board does when somebody deletes
   something up there. It starts from the files prepared, and sends them itself. */

const fake = storageOf()
const j = harness({ name: 'g-transfers', state: 'processed' })
const { see, quiet, open } = j
beforeAll(fake.start)
afterAll(fake.stop)

const FILES = ['sion_20260905_100000.mp4', 'sion_20260905_100240.mp4', 'sion_20260905_100520.mp4']
const sion = (...parts: string[]) => onStorage(fake.get(), 'club', 'Dropzones', 'Sion', ...parts)

/* the window of what was sent and copied, opened from the status bar */
const transfers = () => j.page.getByRole('complementary', { name: 'Transfers' })
const showTransfers = async () => {
  if (!(await transfers().isVisible()))
    await j.page.getByRole('button', { name: 'Transfers' }).click()
  await transfers().waitFor()
}

describe('the small copies of the clips', () => {
  test('are made in view in a window of their own, which goes when every clip has its copy', async () => {
    await open()
    const window = j.page.getByRole('complementary', { name: 'Making small copies' })
    await window.waitFor()
    expect(await window.innerText()).toMatch(/\d+ of 8 clips made/)
    await window.getByRole('progressbar').first().waitFor()
    await window.waitFor({ state: 'detached', timeout: 60_000 })
    await quiet()
  })
})

describe('everything with a bar is in transfers too', () => {
  test('lists an upload going now at the head of the transfers, with a window of its own in the corner', async () => {
    const storage = fake.get()
    await openSion(j.page)
    await see('3 files are ready to upload')
    await connectStorage(j.page, storage)
    await chooseFolder(j.page, ['club', 'Dropzones', 'Sion'])

    await storage.admin.latency(1200)
    await uploadButton(j.page).click()
    const corner = j.page.getByRole('complementary', { name: 'Uploading Sion' })
    await corner.waitFor()
    await showTransfers()
    const going = j.page.getByRole('list', { name: 'Going now' })
    await going.getByText('Uploading Sion').waitFor()
    await going.getByRole('progressbar').waitFor()

    /* the work runs on the server: leaving the page changes nothing about it */
    await openPlace(j.page, /Fresh files/)
    await corner.waitFor()
    await going.getByText('Uploading Sion').waitFor()
    await corner.waitFor({ state: 'detached', timeout: 120_000 })
    await storage.admin.latency(0)
    await going.waitFor({ state: 'detached' })
    await quiet()
  })

  test('has the whole of it up there, reached by opening the board again', async () => {
    await open()
    await openSion(j.page)
    await see('3 of 3 on the storage')
    expect(fs.readdirSync(sion()).sort()).toEqual(FILES)
    await quiet()
  })
})

describe('transfers, looked at afterwards', () => {
  test('lists what the machine kept, the latest first, each with how it ended and how many files', async () => {
    await showTransfers()
    const kept = transfers().getByRole('button', { name: /^(Uploaded|Copied in) · / })
    await expect.poll(() => kept.count()).toBe(2)
    expect(await kept.nth(0).innerText()).toMatch(
      /Uploaded · sion_20260905_1000\d\d\.mp4[\s\S]*3 done[\s\S]*done/
    )
    expect(await kept.nth(1).innerText()).toMatch(/Copied in · GX010001\.MP4[\s\S]*1 done/)
    await quiet()
  })

  test('opens one to list every item with its size, where it went and a button to its folder in the storage’s interface', async () => {
    const latest = transfers().getByRole('button', { name: /^Uploaded · / })
    expect(await latest.getAttribute('aria-expanded')).toBe('true')
    for (const name of FILES) {
      await transfers().getByText(`/club/Dropzones/Sion/${name}`).waitFor()
    }
    const links = transfers().getByRole('link', { name: 'Open in DSM' })
    expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual(
      FILES.map((name) => dsmAddress(fake.get(), `/club/Dropzones/Sion/${name}`))
    )

    await transfers()
      .getByRole('button', { name: /^Copied in · / })
      .click()
    expect(await latest.getAttribute('aria-expanded')).toBe('false')
    await quiet()
  })

  test('keeps them after the app is stopped and started again', async () => {
    await j.restart()
    await open()
    await showTransfers()
    await expect
      .poll(() =>
        transfers()
          .getByRole('button', { name: /^(Uploaded|Copied in) · / })
          .count()
      )
      .toBe(2)
    await quiet()
  })
})

describe('Open in DSM, and the files up there', () => {
  test('carries the same address from a file’s right panel and from its row on the storage tab, with the file preselected', async () => {
    const storage = fake.get()
    await transfers().getByRole('button', { name: 'Close' }).click()
    await openSion(j.page)
    await j.page.getByRole('button', { name: /Saturday 5 September 2026/ }).click()
    await j.page.getByText('sion_20260905_100240.mp4', { exact: true }).first().click()
    const wanted = dsmAddress(storage, '/club/Dropzones/Sion/sion_20260905_100240.mp4')
    await showDetails(j.page)
    const link = details(j.page).getByRole('link', { name: 'Open in DSM' })
    await link.waitFor()
    expect(await link.getAttribute('href')).toBe(wanted)

    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    const row = j.page.getByRole('link', { name: /sion_20260905_100240\.mp4/ })
    await row.waitFor()
    expect(await row.getAttribute('href')).toBe(wanted)
    const folder = j.page.getByRole('link', { name: '/club/Dropzones/Sion' })
    expect(await folder.getAttribute('href')).toBe(dsmAddress(storage, '/club/Dropzones/Sion'))

    const [opened] = await Promise.all([j.context.waitForEvent('page'), row.click()])
    await opened.waitForURL(wanted, { waitUntil: 'commit' })
    expect(opened.url()).toBe(wanted)
    await opened.close()
    await quiet()
  })
})

describe('share links', () => {
  test('makes the folder’s link on asking, shows it with Copy link, and takes it away leaving the folder and its files', async () => {
    const storage = fake.get()
    await j.context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openPlace(j.page, /Fresh files/)
    await openSion(j.page)
    await showDetails(j.page)
    const panel = details(j.page)
    await panel.getByRole('button', { name: 'Create link' }).waitFor()
    expect(await storage.admin.shareLinks()).toEqual([])

    await panel.getByRole('button', { name: 'Create link' }).click()
    await panel.getByRole('button', { name: 'Remove link' }).waitFor()
    const [made] = await storage.admin.shareLinks()
    expect(made?.path).toBe('/club/Dropzones/Sion')
    await panel.getByRole('link', { name: made?.url }).waitFor()

    await panel.getByRole('button', { name: 'Copy', exact: true }).click()
    await expect.poll(() => j.page.evaluate(() => navigator.clipboard.readText())).toBe(made?.url)

    await panel.getByRole('button', { name: 'Remove link' }).click()
    await panel.getByRole('button', { name: 'Create link' }).waitFor()
    expect(await storage.admin.shareLinks()).toEqual([])
    expect(fs.readdirSync(sion()).sort()).toEqual(FILES)
    await quiet()
  })
})

describe('a link of its own for one file', () => {
  /* the file's row on the storage tab, with the ⋯ menu it keeps its other doings in */
  const row = () => j.page.getByRole('link', { name: /sion_20260905_100520\.mp4/ })
  const menuOf = () => row().locator('xpath=..').getByRole('button', { name: 'More' })
  const clip = '/club/Dropzones/Sion/sion_20260905_100520.mp4'
  const choose = (item: string) =>
    j.page.getByRole('group', { name: 'More' }).getByRole('button', { name: item }).click()

  test('is made from the row, shown there by a mark that copies it, and taken away from the same place', async () => {
    const storage = fake.get()
    await openPlace(j.page, /Fresh files/)
    await openSion(j.page)
    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    await row().waitFor()

    await menuOf().click()
    await choose('Create a link')
    const mark = row().locator('xpath=..').getByRole('button', { name: 'Copy the link' })
    await mark.waitFor()
    const [made] = await storage.admin.shareLinks()
    expect(made?.path).toBe(clip)
    await mark.click()
    await expect.poll(() => j.page.evaluate(() => navigator.clipboard.readText())).toBe(made?.url)

    await menuOf().click()
    await choose('Remove the link')
    await mark.waitFor({ state: 'detached' })
    expect(await storage.admin.shareLinks()).toEqual([])
    expect(fs.existsSync(sion('sion_20260905_100520.mp4'))).toBe(true)
    await quiet()
  })

  test('shows a link the storage no longer honours as no link at all, and offers a new one', async () => {
    const storage = fake.get()
    await menuOf().click()
    await choose('Create a link')
    const mark = row().locator('xpath=..').getByRole('button', { name: 'Copy the link' })
    await mark.waitFor()
    const [first] = await storage.admin.shareLinks()

    await storage.admin.revokeLink(first?.id ?? '')
    await open()
    await openSion(j.page)
    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    await row().waitFor()
    await mark.waitFor({ state: 'detached' })
    await menuOf().click()
    await choose('Create a link')
    await mark.waitFor()
    const links = await storage.admin.shareLinks()
    expect(links.map((link) => link.status)).toEqual(['invalid', 'valid'])
    expect(links[1]?.url).not.toBe(first?.url)
    await quiet()
  })

  test('drops the mark of a link the storage revoked when the folder is looked at again', async () => {
    const storage = fake.get()
    await menuOf().click()
    await choose('Remove the link')
    await menuOf().click()
    await choose('Create a link')
    const mark = row().locator('xpath=..').getByRole('button', { name: 'Copy the link' })
    await mark.waitFor()
    const valid = (await storage.admin.shareLinks()).find((link) => link.status === 'valid')
    await storage.admin.revokeLink(valid?.id ?? '')
    await j.page.getByRole('button', { name: 'Look again' }).click()
    await mark.waitFor({ state: 'detached' })
    await quiet()
  })
})

describe('uploaded is the end of editing', () => {
  test('shows a lock with the reason in the preview of a file that is up there, and no way to trim, frame or turn it', async () => {
    await openPlace(j.page, /Fresh files/)
    await openSion(j.page)
    await j.page.getByRole('button', { name: 'Local', exact: true }).click()
    await j.page.getByRole('button', { name: /Saturday 5 September 2026/ }).click()
    await j.page.getByText('sion_20260905_100000.mp4').first().dblclick()
    const shown = preview(j.page)
    await shown.waitFor()
    await shown.getByText(/cropping, re-timing and moving are closed/).waitFor()
    await expect.poll(() => shown.getByRole('button', { name: 'Start here' }).count()).toBe(0)
    await expect
      .poll(() => shown.getByRole('button', { name: 'Save', exact: true }).count())
      .toBe(0)
    await j.page.keyboard.press('Escape')
    await shown.waitFor({ state: 'detached' })
    await quiet()
  })

  test('refuses to move a file that is up there to another place, and says so', async () => {
    await j.page
      .getByText('sion_20260905_100000.mp4')
      .first()
      .dragTo(folders(j.page).getByRole('link', { name: /Fresh files/ }))
    await see(/On the storage already, so it cannot move/)
    await j.page.getByText('sion_20260905_100000.mp4').first().waitFor()
    expect(fs.existsSync(path.join(j.world.output, 'processed', 'Sion', FILES[0]!))).toBe(true)
    await quiet()
  })
})

describe('noticing deletions', () => {
  test('goes on saying what it last proved until the board is opened, a place is opened or the check is pressed', async () => {
    fs.rmSync(sion('sion_20260905_100520.mp4'))
    /* the storage is never looked at on a timer, so nothing signals that it was not: the board has two seconds,
       the longest period of anything it does by itself, to say otherwise */
    await j.page.waitForTimeout(2_000)
    await see('3 of 3 on the storage')
    await quiet()
  })

  test('stops counting a file the storage no longer holds when a place is opened, leaving the local file', async () => {
    await openPlace(j.page, /Fresh files/)
    await openSion(j.page)
    await see('2 of 3 on the storage')
    await quiet()
  })

  test('stops counting a file the storage no longer holds when the board is opened, ready to be sent again and the local file left', async () => {
    await open()
    await openSion(j.page)
    await see('2 of 3 on the storage')
    await see('1 file is ready to upload')
    expect(
      fs.existsSync(path.join(j.world.output, 'processed', 'Sion', 'sion_20260905_100520.mp4'))
    ).toBe(true)
    await quiet()
  })

  test('notices another deletion when the check button is pressed, without the page being left', async () => {
    fs.rmSync(sion('sion_20260905_100240.mp4'))
    await j.page.getByRole('button', { name: 'Check the storage again' }).click()
    await see('1 of 3 on the storage')
    await quiet()
  })
})

describe('being listed can take a claim away, never grant one', () => {
  test('demotes nothing when the storage cannot be reached: what the record says went up still reads as up', async () => {
    await fake.get().admin.unreachable(true)
    await open()
    await openSion(j.page)
    await see('3 of 3 on the storage')
    await see('Everything is on the storage')
    expect(fs.readdirSync(sion()).sort()).toEqual(FILES.filter((name) => name.endsWith('000.mp4')))
    await fake.get().admin.unreachable(false)
    await quiet()
  })
})

describe('forgetting what was kept', () => {
  test('forgets one transfer with its cross and the whole list with Clear, touching nothing that was sent', async () => {
    const files = fs.readdirSync(sion()).sort()
    await open()
    await showTransfers()
    const kept = transfers().getByRole('button', { name: /^(Uploaded|Copied in) · / })
    await expect.poll(() => kept.count()).toBe(2)

    await transfers()
      .getByRole('button', { name: /^Forget Copied in · / })
      .click()
    await expect.poll(() => kept.count()).toBe(1)
    expect(await kept.first().innerText()).toContain('Uploaded · ')

    await transfers().getByRole('button', { name: 'Clear' }).click()
    await see('Nothing has been sent or copied yet')
    expect(fs.readdirSync(sion()).sort()).toEqual(files)
    for (const name of files)
      expect(fs.existsSync(path.join(j.world.output, 'processed', 'Sion', name)), name).toBe(true)
    await quiet()
  })
})

/* last, since a storage that is slow leaves the page with an error that arrives when it likes */
describe('never held', () => {
  test('draws the board from this machine at once while the storage is still being asked, and says so', async () => {
    const storage = fake.get()
    await storage.admin.latency(60_000)
    const began = Date.now()
    /* the page is looked at as soon as it starts to arrive, not once its last part has */
    await j.page.goto(j.page.url(), { waitUntil: 'commit' })
    await j.page.getByText('Checking the storage…').waitFor()
    await folders(j.page).getByRole('link', { name: /Sion/ }).waitFor()
    await openSion(j.page)
    await j.page.getByRole('button', { name: /Saturday 5 September 2026/ }).click()
    await j.page.getByText('sion_20260905_100000.mp4').first().waitFor()
    expect(Date.now() - began, 'the board waited for the storage').toBeLessThan(10_000)
    await storage.admin.latency(0)
    await quiet()
  })

  test('takes a storage that does not answer within seconds for unreachable instead of waiting for it', async () => {
    await fake.get().admin.latency(60_000)
    await open()
    await j.page.getByText('Checking the storage…').waitFor({ state: 'detached', timeout: 20_000 })
    await j.page.getByRole('button', { name: 'Connect the storage' }).waitFor()
    await fake.get().admin.latency(0)
    await quiet()
  })

  test('opens on a slow storage without anything breaking unnoticed', async () => {
    await fake.get().admin.latency(8_000)
    await open()
    /* the page asks the storage while it draws and says so until the answer, or its giving up, is drawn */
    await j.page.getByText('Checking the storage…').waitFor({ state: 'detached', timeout: 30_000 })
    await fake.get().admin.latency(0)
    await quiet()
  })
})
