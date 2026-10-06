import * as path from 'node:path'
import { afterEach, beforeAll, describe, test } from 'vitest'
import { cardsOf, eventually, minutesAfter, photosAt } from './c1-helpers'
import { harness } from './harness'
import { makeClip } from './media'

/* A long card is drawn a page at a time — forty rows or a hundred and twenty thumbnails — the next page by
   itself as the end of the last comes near, and a clip shorter than the moment its thumbnail is taken at
   shows its first frame (RULES, Showing files). One jump of a hundred and thirty photos, and a jump of two
   clips shorter than half a second. */

const DAY = '2026-09-05'
const PHOTOS = Array.from({ length: 130 }, (_, i) => minutesAfter(`${DAY}T08:00:00`, i * 2))
const SHORT = [`${DAY}T20:00:00`, `${DAY}T20:05:00`]

const j = harness({
  name: 'c1-lists',
  prepare: (world) => {
    photosAt(world, PHOTOS)
    for (const [i, when] of SHORT.entries())
      makeClip(
        path.join(
          world.output,
          'original_files',
          DAY,
          `DJI_${when.replace(/\D/g, '')}_${900 + i}_D.MP4`
        ),
        when,
        0.3 + i / 10
      )
  }
})
const { quiet } = j
beforeAll(() => j.page.setDefaultTimeout(20_000))
afterEach(() => j.page.keyboard.press('Escape'))

const files = (within: string) => j.page.locator(within).locator('[role=button][data-file]')
const long = 'section[aria-label="Jump 1"]'

describe('a long card', () => {
  test('is drawn forty rows at a time, the next page by itself as the end of the last comes near, and all the rest at once when asked', async () => {
    await j.open()
    await j.page.getByRole('button', { name: /^Jump 1, .*130 photos/ }).click()
    await eventually(() => files(long).count()).toBe(40)
    await j.page.getByText('40 of 130 shown').waitFor()

    await files(long).last().scrollIntoViewIfNeeded()
    await eventually(() => files(long).count()).toBe(80)

    /* the button moves as pages are drawn, so it is reached with the keyboard */
    const all = j.page.getByRole('button', { name: 'Show all 130' })
    await all.focus()
    await j.page.keyboard.press('Enter')
    /* what is scrolled out of sight is not drawn, so the rest comes as it is scrolled to */
    await eventually(async () => {
      await files(long).last().scrollIntoViewIfNeeded()
      return files(long).count()
    }).toBe(130)
    const fewer = j.page.getByRole('button', { name: 'Show fewer' })
    await fewer.focus()
    await j.page.keyboard.press('Enter')
    await eventually(() => files(long).count()).toBeLessThan(130)
    await quiet()
  })

  test('is drawn as thumbnails a page at a time, the rest as the end of each page comes near', async () => {
    await j.page.getByRole('button', { name: 'Thumbnails' }).click()
    /* a page at a time, the rest drawn as the end of each comes near */
    await eventually(async () => {
      await files(long).last().scrollIntoViewIfNeeded()
      return files(long).count()
    }).toBe(130)
    await j.page.getByRole('button', { name: 'Rows' }).click()
    await quiet()
  })
})

describe('a clip shorter than the moment its thumbnail is taken at', () => {
  test('shows its first frame, so no picture is missing', async () => {
    await j.page.getByRole('button', { name: 'Thumbnails' }).click()
    await eventually(() => cardsOf(j).then((cards) => cards.length)).toBe(2)
    await j.page.getByRole('button', { name: /^Jump 2, / }).click()
    const tiles = files('section[aria-label="Jump 2"]')
    await eventually(() => tiles.count()).toBe(2)
    for (const index of [0, 1])
      await eventually(() =>
        tiles
          .nth(index)
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
      ).toBe(true)
    await j.page.getByRole('button', { name: 'Rows' }).click()
    await quiet()
  })
})
