import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  cardOf,
  drag,
  holds,
  jumpHolding,
  jumpsOf,
  listing,
  menuOf,
  pick,
  rowOf
} from './c2-helpers'
import { harness } from './harness'

/* Filing: a jump or picked files go where they belong by being dragged onto a place in the menu or onto another
   jump, or by Move to… for whoever cannot drag. It starts from the footage found, a destination made and a
   jump filed into it, and goes on in the one afternoon: each chapter finds what the one before left. */

const j = harness({ name: 'c2-sorting', state: 'sorted', viewport: { width: 1400, height: 1000 } })
const { see, quiet, open } = j
const FIRST = 'DJI_20260905143000_0004_D.MP4'
const SECOND = 'DJI_20260905143300_0005_D.MP4'
const SIXTH = 'DJI_20260906090000_0006_D.MP4'
const SEVENTH = 'DJI_20260906090300_0007_D.MP4'
const LOOSE = 'GX010001.MP4'

const place = (name: string | RegExp) => menuOf(j.page).getByRole('link', { name })
const pane = (name: string) => j.page.getByRole('region', { name })
const moveTo = () => j.page.getByRole('button', { name: 'Move to…' })
const menu = () => j.page.getByRole('group', { name: 'Move to…' })
const originalsNow = () => listing(path.join(j.world.output, 'original_files'))
/* what the originals folder held when the afternoon began */
const kept: { originals: string[] } = { originals: [] }

describe('filing by drag', () => {
  test('files a whole jump by dragging its card onto a place in the menu, and the destination opens with it', async () => {
    await open()
    await see('2 jumps are waiting for a home')
    kept.originals = originalsNow()
    await j.page.getByRole('button', { name: /Add a destination/ }).click()
    await j.page.getByPlaceholder('New destination').fill('Yverdon')
    await j.page.getByRole('button', { name: 'Add', exact: true }).click()
    await place(/Yverdon/).waitFor()

    await drag(j.page, cardOf(j.page, 'Jump 1'), place(/Yverdon/))
    await see('2 files need processing')
    await pane('Yverdon').waitFor()
    await rowOf(j.page, FIRST).waitFor()
    expect(holds(j.world, 'Yverdon')).toEqual([FIRST, SECOND])
    await quiet()
  })

  test('moves a loose file onto another jump by dragging it onto the jump', async () => {
    await place(/Fresh files/).click()
    await cardOf(j.page, 'Loose files').click()
    await drag(j.page, rowOf(j.page, LOOSE), cardOf(j.page, 'Jump 1'))
    await see('1 off the gap')
    expect(jumpHolding(j.world, LOOSE)[0]?.files).toContain(SIXTH)
    expect(jumpHolding(j.world, LOOSE)[0]?.files).toContain(LOOSE)
    await quiet()
  })

  test('copies a file into a montage when alt is held while it is dragged onto the montage in the menu', async () => {
    await cardOf(j.page, 'Jump 1').click()
    await j.page.getByRole('button', { name: 'Make a montage…' }).click()
    await j.page.getByLabel('Name').fill('Ana Test')
    await j.page.getByLabel('Name').press('Enter')
    await see('Made Ana Test’s montage')
    await place(/Yverdon/).click()
    await rowOf(j.page, FIRST).waitFor()

    await drag(j.page, rowOf(j.page, FIRST), place(/Ana Test/), 'Alt')
    await see('Copied 1 file into the jump — it stays where it was as well')
    expect(holds(j.world, 'Yverdon'), 'Yverdon keeps its own').toEqual([FIRST, SECOND])
    expect(jumpHolding(j.world, FIRST).find((jump) => jump.montage)?.copies).toBe(1)
    expect(originalsNow(), 'a copy is no second file on the disk').toEqual(kept.originals)

    await place(/Ana Test/).click()
    await rowOf(j.page, FIRST).getByText('copy').waitFor()
    await quiet()
  })

  test('moves a file into a montage when it is dragged onto it with no key held', async () => {
    await place(/Yverdon/).click()
    await drag(j.page, rowOf(j.page, SECOND), place(/Ana Test/))
    await rowOf(j.page, SECOND).waitFor({ state: 'detached' })
    expect(holds(j.world, 'Yverdon')).toEqual([FIRST])
    expect(jumpHolding(j.world, SECOND).map((jump) => [jump.montage, jump.copies])).toEqual([
      ['Ana Test', 1]
    ])
    await quiet()
  })
})

describe('filing from a menu', () => {
  const only = (name: string) => menu().getByRole('button', { name })

  test('lists Fresh files, every destination, every named montage and a new montage for picked files, leaving out where they are', async () => {
    await place(/Yverdon/).click()
    await pick(rowOf(j.page, FIRST))
    await moveTo().click()
    await menu().getByRole('button').first().waitFor()
    expect(await menu().getByRole('button').allInnerTexts()).toEqual([
      'Fresh files',
      'Sion',
      'Ana Test’s montage',
      'A new montage…'
    ])
    await moveTo().click()
    await menu().waitFor({ state: 'detached' })
    await quiet()
  })

  test('asks for the name before anything moves when a new montage is chosen, and Escape leaves the files where they were', async () => {
    await moveTo().click()
    await only('A new montage…').click()
    const dialog = j.page.getByRole('dialog', { name: 'Name the montage' })
    await dialog.waitFor()
    expect(holds(j.world, 'Yverdon')).toEqual([FIRST])
    await j.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    expect(holds(j.world, 'Yverdon'), 'nothing moved').toEqual([FIRST])
    await quiet()
  })

  test('files picked files under a destination chosen in the menu, and that destination opens with them', async () => {
    await moveTo().click()
    await only('Sion').click()
    await pane('Sion').waitFor()
    await rowOf(j.page, FIRST).waitFor()
    expect(holds(j.world, 'Sion')).toContain(FIRST)
    expect(holds(j.world, 'Yverdon')).toEqual([])
    await quiet()
  })

  test('moves one file from its own panel with Move to…, and the montage keeps the rest', async () => {
    await place(/Ana Test/).click()
    await rowOf(j.page, SIXTH).click()
    await moveTo().click()
    await only('Fresh files').click()
    await rowOf(j.page, SIXTH).waitFor({ state: 'detached' })
    expect(jumpHolding(j.world, SIXTH)).toEqual([])
    expect(jumpHolding(j.world, SECOND).map((jump) => jump.montage)).toEqual(['Ana Test'])
    await quiet()
  })

  test('goes to Fresh files with the last files of a montage taken back there, and the montage is gone', async () => {
    await place(/Ana Test/).click()
    await rowOf(j.page, SECOND).click()
    await j.page.keyboard.press('Control+a')
    await moveTo().click()
    await only('Fresh files').click()
    await pane('Fresh files').waitFor()
    await place(/Ana Test/).waitFor({ state: 'detached' })
    await expect.poll(() => jumpsOf(j.world).filter((jump) => jump.montage)).toEqual([])
    for (const name of [SECOND, LOOSE, SEVENTH])
      expect(jumpHolding(j.world, name), `${name} is in no jump`).toEqual([])
    expect(holds(j.world, 'Sion')).toContain(FIRST)
    expect(originalsNow(), 'filing never touches the originals').toEqual(kept.originals)
    await quiet()
  })
})
