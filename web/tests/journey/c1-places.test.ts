import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cardsOf, eventually, folders, namesListed, rowOf } from './c1-helpers'
import { harness } from './harness'

/* A destination is a place: its files all sit directly in its folder, many days sharing it. A file that
   belongs to no jump can be filed to it, and the destination can be taken off the board when nobody shoots
   there any more (RULES, Places: destinations and montages). Started from the work folder the story left
   processed. */

const j = harness({ name: 'c1-places', state: 'processed' })
const { quiet } = j
beforeAll(() => j.page.setDefaultTimeout(15_000))
afterEach(() => j.page.keyboard.press('Escape'))

const sion = () => folders(j).getByRole('link', { name: /Sion/ })
const fresh = () => folders(j).getByRole('link', { name: /Fresh files/ })
const original = (day: string, name: string) =>
  path.join(j.world.output, 'original_files', day, name)

describe('a destination', () => {
  test('takes a loose file filed to it without the file belonging to any jump, and hands it over with its own day among the others', async () => {
    await j.open()
    await j.page.getByRole('button', { name: 'Loose files, 1 video · 0 photos' }).waitFor()
    await rowOf(j, 'GX010001.MP4').dragTo(sion())
    await j.page.getByRole('heading', { name: '1 file needs processing' }).waitFor()
    await eventually(() => j.page.locator('main [role=button][data-file]').count()).toBe(4)
    await eventually(() => namesListed(j)).toContain('GX010001.MP4')

    await j.page.getByRole('button', { name: 'Process 1 file' }).click()
    await j.page
      .getByRole('heading', { name: '4 files are ready to upload' })
      .waitFor({ timeout: 90_000 })
    const handed = fs.readdirSync(path.join(j.world.output, 'processed', 'Sion')).sort()
    expect(handed).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4',
      'sion_20260906_160000.mp4'
    ])
    await quiet()
  })

  test('is taken off the board when asked, after asking first, and the jump filed there comes back to Fresh files whole with every original where it is', async () => {
    await eventually(() => sion().getAttribute('aria-current')).toBe('page')
    await j.page
      .getByRole('region', { name: 'Sion' })
      .getByRole('button', { name: 'More', exact: true })
      .click()
    await j.page
      .getByRole('button', {
        name: 'Remove destination…',
        description: /Take this destination off the board/
      })
      .click()
    const dialog = j.page.getByRole('dialog', { name: 'Remove a destination' })
    await dialog.getByRole('heading', { name: 'Remove Sion' }).waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await sion().waitFor()

    await j.page
      .getByRole('region', { name: 'Sion' })
      .getByRole('button', { name: 'More', exact: true })
      .click()
    await j.page
      .getByRole('button', {
        name: 'Remove destination…',
        description: /Take this destination off the board/
      })
      .click()
    await dialog.getByRole('button', { name: 'Remove Sion' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await sion().waitFor({ state: 'detached' })

    await fresh().click()
    /* the jump is whole, with its three clips, and the file filed on its own is loose again */
    await eventually(() => cardsOf(j)).toEqual([
      'Loose files, 1 video · 0 photos',
      'Jump 3, 6 September 2026 09:00, 2 videos · 1 photo',
      'Jump 2, 5 September 2026 14:30, 2 videos · 0 photos',
      expect.stringMatching(/^Jump 1, 5 September 2026 10:00, 3 videos · 0 photos$/)
    ])
    for (const [day, name] of [
      ['2026-09-05', 'DJI_20260905100000_0001_D.MP4'],
      ['2026-09-05', 'DJI_20260905100520_0003_D.MP4'],
      ['2026-09-06', 'GX010001.MP4']
    ] as const)
      expect(fs.existsSync(original(day, name)), `${name} is still where it was`).toBe(true)
    await quiet()
  })
})
