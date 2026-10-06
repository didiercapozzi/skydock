import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cardsOf, eventually, folders, namesListed, rowOf } from './c1-helpers'
import { harness } from './harness'

/* A time can be wrong: a camera whose clock was never set, a clip from a second camera, a photo off a phone.
   It is corrected for a whole jump, or for one file, and what SkyDock names and orders by follows
   (RULES, Times and dates). Started from the work folder the story left sorted. */

const j = harness({ name: 'c1-times', state: 'sorted' })
const { see, quiet } = j
beforeAll(() => j.page.setDefaultTimeout(10_000))
afterEach(() => j.page.keyboard.press('Escape'))

const fresh = () => folders(j).getByRole('link', { name: /Fresh files/ })
const sion = () => folders(j).getByRole('link', { name: /Sion/ })
const card = (label: RegExp) => j.page.getByRole('button', { name: label })
const panel = () => j.page.getByRole('complementary', { name: 'Details' })
const processed = () => fs.readdirSync(path.join(j.world.output, 'processed', 'Sion')).sort()

/* the panel, brought back with its icon when it is away, as a person would */
const showPanel = async () => {
  if (await panel().isVisible()) return
  await j.page.getByRole('button', { name: 'Details', exact: true }).click()
  await panel().waitFor()
}

/* a file looked at with a click, which shows it in the panel: from the card it is listed under, since a click
   on the file already marked as looked at puts it away again */
const lookAt = async (name: string, from: RegExp) => {
  await card(from).click()
  /* another file first, so the one asked for is never the one already looked at */
  const another = j.page
    .locator('main [role=button][data-file]')
    .filter({ hasNotText: name })
    .first()
  if ((await another.count()) > 0) await another.click()
  await rowOf(j, name).click()
  await showPanel()
  await panel().getByRole('heading', { name }).waitFor()
}

/* the editor a time is corrected in: a day, a time and Set, which a person fills in */
const correct = async (day: string, time: string) => {
  await j.page.getByRole('textbox', { name: 'Day' }).fill(day)
  await j.page.getByRole('textbox', { name: 'Time' }).fill(time)
  await j.page.getByRole('button', { name: 'Set', exact: true }).click()
}

describe('a file re-timed on its own', () => {
  test('moves nothing but its place in the jump when the new time is among the others', async () => {
    await j.open()
    await see('Jump 1')
    await card(/^Jump 1, /).click()
    await eventually(() => namesListed(j)).toEqual([
      'DJI_20260905143300_0005_D.MP4',
      'DJI_20260905143000_0004_D.MP4'
    ])
    await lookAt('DJI_20260905143000_0004_D.MP4', /^Jump 1, /)
    await panel().getByRole('button', { name: '14:30' }).click()
    await correct('2026-09-05', '14:40:00')

    /* the order inside the jump changes, the file stays in its jump and the jump keeps its day */
    await eventually(() => namesListed(j)).toEqual([
      'DJI_20260905143000_0004_D.MP4',
      'DJI_20260905143300_0005_D.MP4'
    ])
    expect((await cardsOf(j)).filter((label) => label.startsWith('Jump 1, '))).toEqual([
      expect.stringMatching(/^Jump 1, 5 September 2026 \d\d:\d\d, 2 videos · 0 photos$/)
    ])
    expect(
      fs.existsSync(
        path.join(j.world.output, 'original_files', '2026-09-05', 'DJI_20260905143000_0004_D.MP4')
      )
    ).toBe(true)
    await quiet()
  })

  test('keeps a file in its jump and the jump under its day when the new time is on another day, and flags the file off the gap', async () => {
    await lookAt('DJI_20260905143000_0004_D.MP4', /^Jump 1, /)
    await eventually(() => panel().innerText()).toMatch(/14:40/)
    await panel().getByRole('button', { name: '14:40' }).click()
    await correct('2026-09-07', '09:00:00')

    await card(/^Jump 1, /)
      .getByText(/1 off the gap/)
      .waitFor()
    expect(await card(/^Jump 1, /).getAttribute('aria-label')).toMatch(/^Jump 1, 5 September 2026 /)
    expect(await rowOf(j, 'DJI_20260905143000_0004_D.MP4').textContent()).toMatch(/gap/)
    await eventually(() => namesListed(j)).toHaveLength(2)
    await quiet()
  })

  test('sends a loose file to whichever day its new time falls on', async () => {
    await card(/^Loose files, /).click()
    await lookAt('GX010001.MP4', /^Loose files, /)
    await eventually(() => panel().innerText()).toMatch(/6 Sept/)
    await panel().getByRole('button', { name: '16:00' }).click()
    await correct('2026-09-08', '16:00:00')
    await eventually(() => panel().innerText()).toMatch(/8 Sept/)
    await quiet()
  })
})

describe('a jump whose clock was never set', () => {
  test('is given the time it really started, and every file in it moves by the same amount, the gaps and the order staying as they were', async () => {
    await card(/^Jump 2, /).click()
    await eventually(() => namesListed(j)).toEqual([
      'DJI_20260906090300_0007_D.MP4',
      'DJI_20260906090000_0006_D.MP4',
      'DJI_20260906090130_0008_D.JPG'
    ])
    await panel()
      .getByRole('button', { name: /click to correct/ })
      .click()
    await correct('2026-09-07', '11:30:00')

    /* 09:00 became 11:30 the next day, so 09:01:30 is 11:31:30 and 09:03 is 11:33 */
    await eventually(() => cardsOf(j)).toContain(
      'Jump 2, 7 September 2026 11:30, 2 videos · 1 photo'
    )
    const times = await j.page
      .getByRole('region', { name: 'Jump 2' })
      .locator('[role=button][data-file]')
      .evaluateAll((rows) => rows.map((row) => /\d\d:\d\d/.exec(row.textContent ?? '')?.[0]))
    expect(times).toEqual(['11:33', '11:30', '11:31'])
    await quiet()
  })

  test('is named by the corrected time once its files are filed to a destination and processed', async () => {
    await card(/^Jump 2, /).click()
    await panel().getByRole('button', { name: 'Sion', exact: true }).click()
    await j.page.getByRole('heading', { name: '6 files need processing' }).waitFor()
    await j.page.getByRole('button', { name: 'Process 6 files' }).click()
    await j.page
      .getByRole('heading', { name: '6 files are ready to upload' })
      .waitFor({ timeout: 90_000 })

    /* the destination's files carry their own days: the corrected one, and the first jump's as it was */
    expect(processed()).toEqual(
      expect.arrayContaining([
        'sion_20260905_100000.mp4',
        'sion_20260907_113000.mp4',
        'sion_20260907_113300.mp4'
      ])
    )
    expect(processed().filter((name) => name.startsWith('sion_20260907_1131'))).toHaveLength(1)
    await sion().click()
    await quiet()
  })
})

describe('Fresh files reset by the times alone', () => {
  test('forgets every corrected time, so no file is held off the gap, and keeps the jumps', async () => {
    await fresh().click()
    await card(/^Jump 1, /)
      .getByText(/1 off the gap/)
      .waitFor()
    await j.page
      .getByRole('region', { name: 'Fresh files' })
      .getByRole('button', { name: 'More', exact: true })
      .click()
    await j.page.getByRole('button', { name: 'Reset Fresh files…' }).click()
    const dialog = j.page.getByRole('dialog', { name: 'Reset Fresh files' })
    await dialog.getByRole('button', { name: /^Times only/ }).click()
    await dialog.waitFor({ state: 'hidden' })

    await eventually(() => card(/^Jump 1, /).innerText()).not.toMatch(/off the gap/)
    expect((await cardsOf(j)).some((label) => label.startsWith('Jump 1, '))).toBe(true)
    await quiet()
  })
})
