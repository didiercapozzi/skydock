import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  cardOf,
  drag,
  holds,
  jumpHolding,
  listing,
  menuOf,
  pick,
  recordsOf,
  rowOf
} from './c2-helpers'
import { harness } from './harness'

/* Files that already belong somewhere are copied, never moved, when a montage is made of them: the place they
   come from keeps its own, as it was processed. It starts from the footage found, a destination made and its
   files processed. */

const j = harness({
  name: 'c2-copies',
  state: 'processed',
  viewport: { width: 1400, height: 1000 }
})
const { see, quiet, open } = j
const SION = [
  'DJI_20260905100000_0001_D.MP4',
  'DJI_20260905100240_0002_D.MP4',
  'DJI_20260905100520_0003_D.MP4'
]
const FIRST_COPY = 'sion_20260905_100000.mp4'
const LOOSE = 'GX010001.MP4'
const place = (name: string | RegExp) => menuOf(j.page).getByRole('link', { name })
const processedSion = () => listing(path.join(j.world.output, 'processed', 'Sion'))
const originals = () => listing(path.join(j.world.output, 'original_files'))
const before = { processed: [] as string[], originals: [] as string[] }
const removeFiles = () => j.page.getByRole('button', { name: /Remove…/ })

describe('files that already belong to a destination', () => {
  test('are copied into a montage, which says so before anything is made, and the destination keeps its own as processed', async () => {
    await open()
    await place(/Sion/).click()
    await see('3 files are ready to upload')
    before.processed = processedSion()
    before.originals = originals()
    await rowOf(j.page, FIRST_COPY).click()
    await j.page.keyboard.press('Control+a')
    await j.page.getByRole('button', { name: 'Copy into a montage…' }).click()
    await j.page.getByLabel('Name').fill('Ana Test')
    await j.page.getByText('A new montage — copied, Sion keeps its own').waitFor()
    await j.page.getByRole('button', { name: 'Copy into montage' }).click()
    await see('Copied 3 files into the jump — they stay where they were as well')

    expect(jumpHolding(j.world, SION[0]!).find((jump) => jump.montage)?.copies).toBe(3)
    expect(holds(j.world, 'Sion'), 'the destination keeps its own').toEqual(SION)
    expect(processedSion(), 'what was processed is as it was').toEqual(before.processed)
    expect(originals(), 'a copy costs no room on the disk').toEqual(before.originals)
    for (const name of SION) await rowOf(j.page, name).getByText('copy').waitFor()
    await place(/Sion/).click()
    await see('3 files are ready to upload')
    expect(await rowOf(j.page, FIRST_COPY).getByText('copy', { exact: true }).count()).toBe(0)
    await quiet()
  })
})

describe('a copy and its original', () => {
  test('keeps the original out of the bin while a montage still holds a copy of it, and says so', async () => {
    await place(/Sion/).click()
    await pick(rowOf(j.page, FIRST_COPY))
    await removeFiles().click()
    await j.page.getByRole('button', { name: 'Put in the bin' }).click()
    await j.page
      .getByRole('alert')
      .getByText(
        `${SION[0]} was copied into a jump, which still needs it — take the copy out first.`
      )
      .waitFor()
    expect(holds(j.world, 'Sion')).toEqual(SION)
    expect(originals()).toEqual(before.originals)
    await quiet()
  })
})

describe('trimming a file that has been copied', () => {
  test('leaves the montage’s copy as it was, each side changing without the other', async () => {
    await rowOf(j.page, FIRST_COPY).dblclick()
    const preview = j.page.getByRole('dialog', { name: 'Preview' })
    await preview.waitFor()
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await preview.getByRole('button', { name: 'Start here' }).click()
    await preview.getByRole('button', { name: 'Save', exact: true }).click()
    await preview.waitFor({ state: 'detached' })
    await see('1 file needs processing')
    await expect
      .poll(() => recordsOf(j.world, SION[0]!), { timeout: 15_000 })
      .toEqual([
        { copy: false, trimmed: true },
        { copy: true, trimmed: false }
      ])
    await place(/Ana Test/).click()
    await rowOf(j.page, SION[0]!).getByText('copy').waitFor()
    await quiet()
  })
})

describe('taking copies out of a montage', () => {
  test('refuses the bin for a copy alongside others, and says that a copy can only be taken out', async () => {
    await place(/Fresh files/).click()
    await cardOf(j.page, 'Loose files').click()
    await drag(j.page, rowOf(j.page, LOOSE), place(/Ana Test/))
    await place(/Ana Test/).click()
    await pick(rowOf(j.page, LOOSE))
    await pick(rowOf(j.page, SION[0]!))
    await removeFiles().click()
    const dialog = j.page.getByRole('dialog', { name: 'Remove files' })
    await dialog.waitFor()
    await dialog
      .getByText(/a copy can only be taken out, and its original stays where it is/)
      .waitFor()
    expect(await dialog.getByRole('button', { name: 'Put in the bin' }).isDisabled()).toBe(true)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    await quiet()
  })

  test('takes copies out without asking, the originals staying where they are', async () => {
    await j.page.keyboard.press('Escape')
    await pick(rowOf(j.page, SION[1]!))
    await j.page.getByRole('button', { name: /Remove this copy/ }).click()
    await rowOf(j.page, SION[1]!).waitFor({ state: 'detached' })
    expect(await j.page.getByRole('dialog').count(), 'nothing was asked').toBe(0)
    expect(recordsOf(j.world, SION[1]!)).toEqual([{ copy: false, trimmed: false }])
    expect(holds(j.world, 'Sion')).toEqual(SION)
    expect(originals()).toEqual(before.originals)
    expect(processedSion()).toEqual(before.processed)
    await quiet()
  })
})
