import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { gone, isCopyOf, makeJumpClip, probe, recorded, said } from './d-helpers'
import { harness } from './harness'
import { dayFolder, makeClip } from './media'

const j = harness({
  name: 'd-jump',
  state: 'processed',
  prepare: (world) => {
    const folder = dayFolder(world, '2026-09-07T11:00:00')
    makeJumpClip(path.join(folder, 'DJI_20260907110000_0010_D.MP4'), '2026-09-07T11:00:00')
    makeClip(path.join(folder, 'DJI_20260907110200_0011_D.MP4'), '2026-09-07T11:02:00')
  }
})
const { see, quiet } = j

beforeAll(() => j.page.setDefaultTimeout(15_000))

const JUMPED = 'DJI_20260907110000_0010_D.MP4'
const PLAIN = 'DJI_20260907110200_0011_D.MP4'
const copyOf = (name: string) =>
  path.join(
    j.world.output,
    'processed',
    'Sion',
    `sion_${name.slice(4, 12)}_${name.slice(12, 18)}.mp4`
  )

const dialog = () => j.page.getByRole('dialog', { name: 'Preview' })
const save = () => dialog().getByRole('button', { name: 'Save', exact: true })
const rowOf = (name: string) => j.page.getByText(name, { exact: true }).first()

const openClip = async (name: string) => {
  await rowOf(name).dblclick()
  await dialog().waitFor()
  await dialog()
    .getByText(/\d of \d$/)
    .waitFor()
}
const closeClip = async () => {
  await j.page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'detached' })
}

const barAt = async (seconds: number) => {
  const box = (await j.page.locator('[data-crop-bar]').boundingBox())!
  return { x: box.x + (seconds / 40) * box.width, y: box.y + box.height / 2 }
}

const dragMark = async (
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 1
) => {
  await j.page.mouse.move(from.x, from.y)
  await j.page.mouse.down()
  await j.page.mouse.move(to.x, to.y, { steps })
  await j.page.mouse.up()
}

const playhead = () => j.page.evaluate(() => document.querySelector('video')?.currentTime ?? -1)

describe('finding the jump in a clip', () => {
  test('finds the door of a clip off a camera that records what it felt, and flags it on its row', async () => {
    await j.open()
    await j.page.getByRole('button', { name: 'Scan' }).click()
    await see(/11 files in 4 jumps/, 60_000)
    await j.page.getByText('Jump 3', { exact: true }).click()

    await j.page.getByText('↓ exit').first().waitFor({ timeout: 60_000 })
    await expect.poll(() => j.page.getByText('↓ exit').count()).toBe(1)
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit, { timeout: 30_000 }).toBe(6)
    expect(recorded(j.world, JUMPED).moments).toMatchObject({
      opening: 14.2,
      canopy: 17.5,
      landing: 28
    })
    await expect.poll(() => recorded(j.world, PLAIN).moments, { timeout: 30_000 }).toBeNull()
    await quiet()
  })

  test('shows the marks on the clip’s timeline and as rows that go to each, the exit a second early on a fun jump', async () => {
    await openClip(JUMPED)
    for (const which of ['exit', 'opening', 'canopy', 'landing'])
      await dialog().locator(`[data-moment=${which}]`).waitFor()
    const row = (moment: string) => dialog().getByTitle(`Go to the ${moment}`)
    await said(row('exit'), '0:05')
    await said(row('opening'), '0:14')
    await said(row('canopy'), '0:17')
    await said(row('ground'), '0:28')

    await row('opening').click()
    await expect.poll(playhead).toBeGreaterThan(14)
    await expect.poll(playhead).toBeLessThan(15)
    await dialog().getByText('the opening').first().waitFor()
    await quiet()
  })

  test('says plainly that a clip off a camera that measures nothing has no exit to hang a cut on', async () => {
    await closeClip()
    await openClip(PLAIN)
    await dialog().getByText('No exit found — nothing to hang a cut on.').waitFor()
    await gone(dialog().getByRole('button', { name: 'Trim to the jump' }))
    await closeClip()
    await quiet()
  })
})

describe('the jump on a graph', () => {
  test('draws what the camera felt under the timeline, with the least and the most in g', async () => {
    await openClip(JUMPED)
    await dialog().locator('[data-jump-graph]').waitFor()
    await dialog().getByText('What the camera felt').waitFor()
    await said(dialog().locator('[data-graph-extremes]'), '0.30 g')
    await said(dialog().locator('[data-graph-extremes]'), '2.00 g')
    await dialog().getByText('no height or speed — this camera wrote none').waitFor()
    await dialog()
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Info' })
      .click()
    await dialog().getByText('Felt, least').waitFor()
    await dialog().getByText('0.30 g').first().waitFor()
    await quiet()
  })

  test('moves the footage to the instant a point on the graph is dragged to, and reads out what it weighed', async () => {
    const graph = dialog().locator('[data-jump-graph]')
    const box = (await graph.boundingBox())!
    await j.page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
    await j.page.mouse.down()
    await j.page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 })
    await j.page.mouse.up()
    await expect.poll(playhead).toBeGreaterThan(6)
    await expect.poll(playhead).toBeLessThan(10)
    await said(dialog().locator('[data-graph-readout]'), ' g · ')
    await said(dialog().locator('[data-graph-readout]'), 'freefall')

    const bar = await barAt(8)
    await j.page.mouse.move(bar.x, bar.y)
    await j.page.mouse.wheel(0, -400)
    await expect.poll(() => dialog().locator('[data-zoom-display]').innerText()).not.toBe('1.00x')
    await quiet()
  })
})

describe('correcting the marks', () => {
  test('moves the exit by dragging it, and offers to put every mark back where the camera measured them', async () => {
    await dialog()
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Cut' })
      .click()
    await dialog().locator('[data-action=reset-zoom]').click()
    await expect.poll(() => dialog().locator('[data-zoom-display]').innerText()).toBe('1.00x')
    const from = await barAt(5)
    const to = await barAt(10)
    await dragMark(from, to)
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBeGreaterThan(10)
    await said(dialog().getByTitle('Go to the exit'), '0:10')
    expect(recorded(j.world, JUMPED).foundMoments?.exit, 'what the camera measured is kept').toBe(6)

    await dialog().getByRole('button', { name: 'Back to the measured marks' }).click()
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBe(6)
    await gone(dialog().getByRole('button', { name: 'Back to the measured marks' }))
    await quiet()
  })

  test.skip('moves the exit by dragging it slowly along the timeline without anything breaking in the console', async () => {
    const from = await barAt(5)
    const to = await barAt(10)
    await dragMark(from, to, 8)
    await quiet()
  })

  test('refuses a mark moved out of the order of a jump, door, opening, canopy, ground', async () => {
    const from = await barAt(5)
    const past = await barAt(25)
    await dragMark(from, past)
    await j.page
      .getByText('A jump goes door, opening, canopy, ground — the marks have to say the same.')
      .first()
      .waitFor()
    const moments = recorded(j.world, JUMPED).moments!
    expect(moments.exit, 'the door stays before the opening').toBeLessThan(moments.opening!)
    expect(moments.exit, 'nothing was moved').toBe(6)
    await gone(dialog().getByRole('button', { name: 'Back to the measured marks' }))
    await quiet()
  })
})

describe('trimming to the jump', () => {
  test('trims a clip to its jump in one press: from the exit, a second early, to eight seconds after the ground', async () => {
    await dialog()
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Cut' })
      .click()
    await dialog().getByRole('button', { name: 'Trim to the jump' }).click()
    await dialog().getByText('Unsaved changes').waitFor()
    await said(dialog().getByText('Start', { exact: true }).locator('xpath=..'), '0:05')
    await said(dialog().getByText('End', { exact: true }).locator('xpath=..'), '0:36')
    await save().click()
    await dialog().waitFor({ state: 'detached' })
    expect(recorded(j.world, JUMPED).cropStart).toBeCloseTo(5, 0)
    expect(recorded(j.world, JUMPED).cropEnd).toBeCloseTo(36, 0)
    await quiet()
  })

  test.skip('trims every clip of a jump at once from the jump’s panel, and says how many had no exit found', async () => {
    await j.page.getByText('Jump 3', { exact: true }).click()
    await j.page.getByRole('button', { name: 'Trim every clip to the jump' }).click()
    await see('1 clip trimmed to the jump — 1 clip has no exit found, and kept its trim.')
    expect(
      recorded(j.world, PLAIN).cropStart ?? null,
      'a clip with no exit keeps its trim'
    ).toBeNull()
    await quiet()
  })

  test('files the jump into Sion and makes the copy of the trimmed clip from the exit to the end of the jump, a clip with no exit whole', async () => {
    const sion = j.page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
    await j.page.getByText('Jump 3', { exact: true }).dragTo(sion)
    await sion.click()
    await see('2 files need processing')
    await j.page.getByRole('button', { name: 'Process 2 files' }).click()
    await see('5 files are ready to upload', 60_000)
    const copy = copyOf(JUMPED)
    expect(probe(copy).seconds).toBeGreaterThan(30)
    expect(probe(copy).seconds).toBeLessThan(32.5)
    expect(isCopyOf(copy, path.join(j.world.output, 'original_files', '2026-09-07', JUMPED))).toBe(
      true
    )
    expect(probe(copyOf(PLAIN)).seconds).toBeGreaterThan(3.5)
    await quiet()
  })
})
