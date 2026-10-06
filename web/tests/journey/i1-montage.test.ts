import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Locator } from 'playwright'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { seedTrim, takeStep } from './i1-helpers'
import { filesUnder, montageFolder, originalsDir, originalsOf, WHO } from './media'
import { groupsOf } from './record'
import { details, dialogNamed, preview } from './steps'

/* A jump becomes a montage by being named, and the montage then walks six steps, which the board shows
   wherever the montage is shown. The saved `sorted` state has the second jump in Fresh files and the first
   filed under Sion. */

const j = harness({ name: 'i1-montage', state: 'sorted', prepare: seedTrim })
const { see, quiet, open } = j

const montageMenu = () => j.page.getByRole('navigation', { name: 'Folders' })
const gone = (locator: Locator) => expect.poll(async () => await locator.count()).toBe(0)
const atStep = () => j.page.locator('ol[aria-hidden="true"] > li[aria-current="step"]')
const stepsRow = () => j.page.locator('ol[aria-hidden="true"] > li')

describe('making a montage', () => {
  test('asks for the name before anything is made, and Escape or Cancel changes nothing', async () => {
    await open()
    await see('Jump 2')
    await j.page.getByText('Jump 2', { exact: true }).first().click()
    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    const name = j.page.getByLabel('Name', { exact: true })
    expect(await j.page.getByRole('button', { name: 'Make montage' }).isDisabled()).toBe(true)
    await name.fill('Luc')
    await name.press('Escape')
    await gone(name)

    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('Luc Favre')
    await details(j.page).getByRole('button', { name: 'Cancel' }).click()
    await gone(j.page.getByLabel('Name', { exact: true }))

    expect(groupsOf(j.world).filter((g) => g.passenger)).toEqual([])
    await gone(montageMenu().getByRole('link', { name: /Luc Favre/ }))
    await quiet()
  })

  test('a jump dropped on the Montages heading asks for its name in a dialog of its own, then makes the montage', async () => {
    const heading = j.page.getByRole('heading', { name: /^Montages/ })
    await j.page.getByText('Jump 2', { exact: true }).first().dragTo(heading)
    const dialog = dialogNamed(j.page, 'Name the montage')
    await dialog.waitFor()
    await dialog.getByLabel('Name', { exact: true }).fill(WHO)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    expect(groupsOf(j.world).filter((g) => g.passenger)).toEqual([])
    await see('Jump 2')

    await j.page.getByText('Jump 2', { exact: true }).first().dragTo(heading)
    await dialog.getByLabel('Name', { exact: true }).fill(WHO)
    await j.page.keyboard.press('Enter')
    await j.page.getByRole('heading', { name: WHO, level: 1 }).waitFor()

    /* made once, named: its page is open and its entry stands in the menu */
    expect(j.page.url()).toContain('/montage/Luc%20Favre')
    await montageMenu()
      .getByRole('link', { name: /Luc Favre/ })
      .waitFor()
    const made = groupsOf(j.world).find((g) => g.passenger?.lastname === 'Favre')
    expect(made?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
    /* a jump of Fresh files moves: it is no longer there to sort, and nothing was copied on the disk */
    expect(made?.destination).toBeUndefined()
    expect(made?.files).toHaveLength(3)
    expect(
      fs.existsSync(path.join(originalsDir(j.world), '2026-09-06', 'DJI_20260906090000_0006_D.MP4'))
    ).toBe(true)
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await see('1 jump is waiting for a home')
    await quiet()
  })

  test('walks the montage through its six steps, each shown where it is', async () => {
    await montageMenu()
      .getByRole('link', { name: /Luc Favre/ })
      .click()
    await j.page.getByRole('heading', { name: WHO, level: 1 }).waitFor()
    /* the row of six, a word under each, and the menu's own segment per step */
    await stepsRow().first().waitFor()
    expect(await stepsRow().count()).toBe(6)
    const words = await stepsRow().locator('b').allInnerTexts()
    expect(words[0]).toContain('done')
    expect(words.map((w) => w.split('\n')[0])).toEqual([
      'Named',
      'Prepared',
      'Project',
      'Film',
      'Uploaded',
      'Sent'
    ])
    await expect.poll(async () => await atStep().innerText()).toContain('Prepared')
    await montageMenu()
      .getByRole('img', { name: /1 of 6 steps done/ })
      .waitFor()
    await expect
      .poll(
        async () =>
          await montageMenu()
            .getByRole('link', { name: /Luc Favre/ })
            .innerText()
      )
      .toContain('to process')
    await see('Prepare the files')

    await takeStep(j.page, 'Process', 'Make the editing project')
    await expect.poll(async () => await atStep().innerText()).toContain('Project')
    await montageMenu()
      .getByRole('img', { name: /2 of 6 steps done/ })
      .waitFor()
    await expect
      .poll(
        async () =>
          await montageMenu()
            .getByRole('link', { name: /Luc Favre/ })
            .innerText()
      )
      .toContain('to edit')
    expect(filesUnder(montageFolder(j.world))).toEqual([
      'photos/luc_favre_20260906_090130.jpg',
      'videos/luc_favre_20260906_090000.mp4',
      'videos/luc_favre_20260906_090300.mp4'
    ])
    await quiet()
  })

  test('lists a montage’s files as a destination’s are, each with its picture, name, time, size and state', async () => {
    const files = j.page.getByRole('region', { name: WHO }).last()
    await files.getByText('prepared').first().waitFor()
    const text = await j.page.locator('main').innerText()
    expect(text).toMatch(/2 videos/)
    for (const copy of [
      'luc_favre_20260906_090000.mp4',
      'luc_favre_20260906_090300.mp4',
      'luc_favre_20260906_090130.jpg'
    ])
      expect(text).toContain(copy)
    await quiet()
  })
})

describe('what else can be done to a montage', () => {
  test('keeps what else can be done in the menu of its page, so the page carries one next step', async () => {
    const page = j.page.getByRole('region', { name: WHO }).last()
    expect(await page.getByRole('button', { name: 'Make the project' }).count()).toBe(1)
    expect(await page.getByRole('button', { name: /^(Upload|Process again|Reset)/ }).count()).toBe(
      0
    )
    await j.page.getByRole('button', { name: 'More' }).click()
    expect(await j.page.getByRole('group', { name: 'More' }).innerText()).toBe(
      'Process again\nReset…\nDelete montage…'
    )
    await j.page.keyboard.press('Escape')
    await quiet()
  })
})

describe('joining and copying', () => {
  test('a name that is already a montage’s, however capitalised, joins that montage and keeps its own times', async () => {
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await j.page.getByText('Jump 1', { exact: true }).first().click()
    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('luc FAVRE')
    await j.page.getByText('Joins Luc Favre’s montage').waitFor()
    await j.page.getByRole('button', { name: 'Join montage' }).click()
    await j.page.getByText('Joined Luc Favre’s montage').waitFor()

    /* the name is saved exactly as already written, and the jump keeps the day it was shot */
    await expect.poll(() => groupsOf(j.world).filter((g) => g.passenger)).toHaveLength(2)
    const joined = groupsOf(j.world).filter((g) => g.passenger)
    expect(joined.map((g) => g.passenger)).toEqual([
      { firstname: 'Luc', lastname: 'Favre' },
      { firstname: 'Luc', lastname: 'Favre' }
    ])
    expect(joined.map((g) => g.day).sort()).toEqual(['05.09.2026', '06.09.2026'])
    /* one name is one folder: one entry in the menu, at the step of the jump furthest behind */
    expect(
      await montageMenu()
        .getByRole('link', { name: /Luc Favre/ })
        .count()
    ).toBe(1)
    await expect
      .poll(
        async () =>
          await montageMenu()
            .getByRole('link', { name: /Luc Favre/ })
            .innerText()
      )
      .toContain('to process')
    await j.page.getByText('2 jumps · 5 files').waitFor()
    await quiet()
  })

  test('files of a destination are copied into a montage, which starts with their trim, and the destination keeps its own', async () => {
    const before = originalsOf(j.world)
    await j.page.getByRole('link', { name: /^Sion/ }).click()
    await see('3 files need processing')
    await j.page
      .getByRole('button', { name: /^Pick DJI_20260905100000/ })
      .getByRole('button', { name: 'Pick' })
      .click()
    await details(j.page).getByRole('button', { name: 'Copy into a montage…' }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('Anna Roux')
    await j.page.getByText('A new montage — copied, Sion keeps its own').waitFor()
    await j.page.keyboard.press('Enter')
    await montageMenu()
      .getByRole('link', { name: /Anna Roux/ })
      .waitFor()

    const groups = groupsOf(j.world)
    const sion = groups.find((g) => g.destination === 'Sion')
    const anna = groups.find((g) => g.passenger?.lastname === 'Roux')
    expect(sion?.files).toHaveLength(3)
    expect(anna?.files).toHaveLength(1)
    /* the copy starts with the file's own trim, and costs no room: no new bytes anywhere */
    expect(anna?.files[0]?.cropStart).toBe(1)
    expect(anna?.destination).toBeUndefined()
    expect(originalsOf(j.world)).toEqual(before)
    await j.page.getByRole('link', { name: /^Sion/ }).click()
    await see('3 files need processing')
    await quiet()
  })

  test('opens the page of a montage made from a destination’s files, every time', async () => {
    await j.page.getByRole('link', { name: /^Sion/ }).click()
    await j.page
      .getByRole('button', { name: /^Pick DJI_20260905100240/ })
      .getByRole('button', { name: 'Pick' })
      .click()
    await details(j.page).getByRole('button', { name: 'Copy into a montage…' }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('Marc Roux')
    await j.page.keyboard.press('Enter')
    await j.page.getByRole('heading', { name: 'Marc Roux', level: 1 }).waitFor()
  })

  test('trimming the montage’s copy again leaves the destination’s file as it was', async () => {
    await j.page.getByRole('link', { name: /Anna Roux/ }).click()
    await j.page.getByRole('heading', { name: 'Anna Roux', level: 1 }).waitFor()
    await j.page.getByText('DJI_20260905100000_0001_D.MP4').first().dblclick()
    const dialog = preview(j.page)
    await dialog.waitFor()
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width * 0.7, y: 10 } })
    await dialog.getByRole('button', { name: 'Start here' }).click()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    await expect
      .poll(
        () => groupsOf(j.world).find((g) => g.passenger?.lastname === 'Roux')?.files[0]?.cropStart
      )
      .toBeGreaterThan(1.5)
    const sion = groupsOf(j.world).find((g) => g.destination === 'Sion')
    expect(sion?.files[0]?.cropStart).toBe(1)
    await quiet()
  })
})

describe('renaming a montage', () => {
  const field = () => details(j.page).getByRole('textbox', { name: 'Name' })
  const anna = () => groupsOf(j.world).find((g) => g.passenger?.firstname === 'Anna')

  test('is saved only by Enter or Save, never by clicking away, and Escape puts the name back', async () => {
    await j.page.getByRole('link', { name: /Anna Roux/ }).click()
    await j.page.getByRole('heading', { name: 'Anna Roux', level: 1 }).waitFor()
    /* what was picked to be trimmed is put down, and the montage's own panel is back */
    await j.page.keyboard.press('Escape')
    await j.page.getByRole('button', { name: 'Change the name' }).click()
    await field().fill('Marie Roux')
    await details(j.page).getByRole('heading', { name: 'Who it is for' }).click()
    expect(anna()?.passenger).toEqual({ firstname: 'Anna', lastname: 'Roux' })
    await field().press('Escape')
    await expect.poll(async () => await field().inputValue()).toBe('Anna Roux')
    await quiet()
  })

  test('saves nothing for an emptied name, and says a name that is another montage’s will join it before anything is saved', async () => {
    await field().fill('')
    await field().press('Enter')
    expect(anna()?.passenger).toEqual({ firstname: 'Anna', lastname: 'Roux' })
    await field().fill('luc favre')
    await details(j.page).getByText('Joins Luc Favre’s montage').waitFor()
    expect(anna()?.passenger).toEqual({ firstname: 'Anna', lastname: 'Roux' })
    await field().press('Escape')
    await expect.poll(async () => await field().inputValue()).toBe('Anna Roux')
    await quiet()
  })

  test('is the same as naming it: a new name moves the montage to it, saved by Enter', async () => {
    await field().fill('Marie Roux')
    await field().press('Enter')
    await expect
      .poll(() => groupsOf(j.world).some((g) => g.passenger?.firstname === 'Marie'))
      .toBe(true)
    expect(groupsOf(j.world).some((g) => g.passenger?.firstname === 'Anna')).toBe(false)
    await montageMenu()
      .getByRole('link', { name: /Marie Roux/ })
      .waitFor()
    expect(
      await montageMenu()
        .getByRole('link', { name: /Anna Roux/ })
        .count()
    ).toBe(0)
    await quiet()
  })
})
