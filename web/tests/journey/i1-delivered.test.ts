import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import { harness } from './harness'
import { dragPart, openUpload, region, sendAsUsual, uploadDialog } from './i2-helpers'
import { filesUnder, montageFolder, renderFilm, WHO } from './media'
import { makeMontage, makeEdit, nameJump } from './i1-helpers'
import { groupsOf } from './record'
import { addDestination, connectStorage, details, dialogNamed, folders, PASSWORD } from './steps'

let storage: FakeStorage
const j = harness({
  name: 'i1-delivered',
  state: 'sorted',
  prepare: async () => {
    storage = await startFakeStorage({ password: PASSWORD })
  }
})
afterAll(async () => storage?.stop())
const { quiet } = j

const main = () => j.page.getByRole('region', { name: WHO }).last()

describe('a montage that is delivered', () => {
  test('is made, edited and given its film, and sent to the storage', async () => {
    await makeMontage(j)
    await addDestination(j.page, 'Backup')
    await addDestination(j.page, 'Club')
    await folders(j.page)
      .getByRole('link', { name: /Luc Favre/ })
      .click()
    await makeEdit(j)
    renderFilm(j.world)
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor({ timeout: 30_000 })
    await connectStorage(j.page, storage)
    await sendAsUsual(j.page)
    await j.see('Send Luc the link', 60_000)
    await quiet()
  })

  test('shrinks the steps to one line of names and gives way to two cards, what is here and what is on the storage', async () => {
    const steps = j.page.locator('ol[aria-hidden="true"] > li')
    expect(await steps.count()).toBe(4)
    const text = await main().innerText()
    expect((text.match(/— done/g) ?? []).length).toBe(3)
    expect(text).not.toContain('Next up')
    expect(text).not.toContain('Its files')
    for (const title of ['On this machine', 'On the storage'])
      await main().getByRole('heading', { name: title }).waitFor()
    expect(text).toContain('Everything here is also on the storage.')
    await main().getByRole('button', { name: 'Free up space…' }).waitFor()
    expect(text).toContain('/club/Films')
    expect(text).toContain('/club/Backup/luc-favre')
    await main().getByRole('button', { name: 'Watch' }).waitFor()
    await folders(j.page)
      .getByRole('img', { name: /3 of 4 steps done/ })
      .waitFor()
    await quiet()
  })

  test('keeps the link out of those cards, in the panel at the right, with the way to copy it or remove it and where the film and the originals went', async () => {
    expect(await main().innerText()).not.toContain('/sharing/')
    const side = await details(j.page).innerText()
    expect(side).toContain('/sharing/')
    await details(j.page).getByRole('button', { name: 'Copy link' }).waitFor()
    await details(j.page).getByRole('button', { name: 'Remove link' }).waitFor()
    expect(side.replace(/\s+/g, ' ')).toContain('Film Club Originals Backup')
    await quiet()
  })

  test('keeps what else can be done to a delivered montage in the menu of its page, so the page carries the one next step', async () => {
    expect(
      await main()
        .getByRole('button', { name: /^Email Luc/ })
        .count()
    ).toBe(1)
    await j.page.getByRole('button', { name: 'More' }).click()
    const items = (await j.page.getByRole('group', { name: 'More' }).innerText()).split('\n')
    expect(items).toEqual([
      'Email Luc…',
      'Edit the film',
      'Upload again…',
      'Free up space…',
      'Start the edit again…',
      'Reset…',
      'Delete montage…'
    ])
    await j.page.keyboard.press('Escape')
    await quiet()
  })

  test('lists the montage among the montages done once it is freed, and says no montage is left to do', async () => {
    await main().getByRole('button', { name: 'Free up space…' }).click()
    await dialogNamed(j.page, /Free up space/)
      .getByRole('button', { name: /^Check and free/ })
      .click()
    await j.page
      .getByRole('heading', { name: 'Montages done', level: 1 })
      .waitFor({ timeout: 90_000 })
    const email = dialogNamed(j.page, 'Email the link')
    if ((await email.count()) > 0) await email.getByRole('button', { name: 'Close' }).click()

    const done = j.page.getByRole('region', { name: 'Montages done' })
    const row = (await done.getByRole('listitem').innerText()).split('\n').filter(Boolean)
    expect(row).toEqual(
      expect.arrayContaining(['Luc Favre', '2 videos · 1 photo', '6 Sept 2026', '—', 'active'])
    )
    expect(row.some((cell) => /^\d+ KB$/.test(cell))).toBe(true)
    await done.getByRole('button', { name: 'Storage' }).waitFor()
    await done.getByRole('button', { name: 'Open' }).waitFor()
    await folders(j.page).getByText('Nothing left to do').waitFor()
    await folders(j.page)
      .getByRole('link', { name: /Montages done/ })
      .waitFor()
    await quiet()
  })

  test('says in three cards what is stored, the link, and that this machine holds nothing, over what is only on the storage now', async () => {
    await j.page
      .getByRole('region', { name: 'Montages done' })
      .getByRole('button', { name: 'Open' })
      .click()
    await j.page.getByRole('heading', { name: WHO, level: 1 }).waitFor()
    const text = await main().innerText()
    for (const card of [/stored/i, /link/i, /this machine/i]) expect(text).toMatch(card)
    expect(text).toContain('3 items')
    expect(text).toContain('Empty')
    expect(text).toContain('Only on the storage now')
    expect(text).toContain('/club/Films')
    expect(text).toContain('/club/Backup/luc-favre')
    expect(filesUnder(montageFolder(j.world)).filter((f) => !f.endsWith('.edit.json'))).toEqual([])
    expect(
      await details(j.page)
        .getByRole('button', { name: /^(Reset|Delete montage)/ })
        .count()
    ).toBe(0)
    await quiet()
  })
})

describe('deleting a montage that was uploaded', () => {
  const ANNA = 'Anna Roux'
  const FILM_OF_ANNA = 'anna_roux_20260905.mp4'

  test('is asked first, says the record of what was uploaded goes with it, and leaves everything on the storage where it is', async () => {
    await folders(j.page)
      .getByRole('link', { name: /Montages done/ })
      .waitFor()
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await nameJump(j.page, 'Jump 1', ANNA)
    await j.page.getByText('Edit the film').first().waitFor({ timeout: 60_000 })
    await makeEdit(j, ANNA, '20260905')
    renderFilm(j.world, ANNA, FILM_OF_ANNA)
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor({ timeout: 30_000 })
    await openUpload(j.page)
    const dialog = uploadDialog(j.page)
    if ((await region(j.page, 'Club').count()) === 0) {
      await dialog.getByLabel('Add a destination').selectOption('Club')
      await region(j.page, 'Club').waitFor()
    }
    await dragPart(j.page, 'The montage', region(j.page, 'Club'))
    await region(j.page, 'Club').getByRole('button', { name: 'Straight in' }).click()
    await uploadDialog(j.page).getByRole('button', { name: 'Upload', exact: true }).click()
    await uploadDialog(j.page).waitFor({ state: 'detached' })
    await j.page
      .getByText('Send Anna the link', { exact: false })
      .first()
      .waitFor({ timeout: 60_000 })
    const onStorage = filesUnder(path.join(storage.root, 'club'))
    expect(onStorage.some((f) => f.includes('anna_roux'))).toBe(true)

    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: 'Delete montage…' }).click()
    const ask = dialogNamed(j.page, 'Delete montage')
    await ask.waitFor()
    expect(await ask.innerText()).toMatch(/what was uploaded|nothing is deleted from the storage/i)
    await ask
      .getByRole('button', { name: /^Delete/ })
      .last()
      .click()
    await ask.waitFor({ state: 'detached' })

    await expect
      .poll(() => groupsOf(j.world).some((g) => g.passenger?.firstname === 'Anna'))
      .toBe(false)
    expect(fs.existsSync(montageFolder(j.world, ANNA))).toBe(false)
    expect(filesUnder(path.join(storage.root, 'club'))).toEqual(onStorage)
    await quiet()
  })
})
