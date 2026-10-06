import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { gone, isCopyOf, makeJumpClip } from './d-helpers'
import { harness } from './harness'
import { dayFolder, makeClip, originalsDir, probe } from './media'
import { recorded } from './record'
import { closeClip, openClip, place, preview, said } from './steps'

/* Where the jump is in a clip: a clip off a camera that wrote down what it felt has its door, opening, canopy
   and ground found, shown on its timeline and on a graph, and trimmed to in one press. The clip is made
   the way a DJI makes one — a track of readings beside the picture — beside one that has none. */

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

const save = () => preview(j.page).getByRole('button', { name: 'Save', exact: true })

/* where a second of the clip is on the timeline, on screen */
const barAt = async (seconds: number) => {
  const box = (await j.page.locator('[data-crop-bar]').boundingBox())!
  return { x: box.x + (seconds / 40) * box.width, y: box.y + box.height / 2 }
}

/* a mark is taken where it stands and let go where it is dragged to, in as many moves as asked */
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

    /* the clip is asked once, in the background; the one that measures nothing says nothing */
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
    await openClip(j.page, JUMPED)
    for (const which of ['exit', 'opening', 'canopy', 'landing'])
      await preview(j.page).locator(`[data-moment=${which}]`).waitFor()
    const row = (moment: string) => preview(j.page).getByTitle(`Go to the ${moment}`)
    await said(row('exit')).toContain('0:05')
    await said(row('opening')).toContain('0:14')
    await said(row('canopy')).toContain('0:17')
    await said(row('ground')).toContain('0:28')

    /* going to a mark puts the footage there, and the corner says where in the jump that is */
    await row('opening').click()
    await expect.poll(playhead).toBeGreaterThan(14)
    await expect.poll(playhead).toBeLessThan(15)
    await preview(j.page).getByText('the opening').first().waitFor()
    await quiet()
  })

  test('says plainly that a clip off a camera that measures nothing has no exit to hang a cut on', async () => {
    await closeClip(j.page)
    await openClip(j.page, PLAIN)
    await preview(j.page).getByText('No exit found — nothing to hang a cut on.').waitFor()
    await gone(preview(j.page).getByRole('button', { name: 'Trim to the jump' }))
    await closeClip(j.page)
    await quiet()
  })
})

describe('the jump on a graph', () => {
  test('draws what the camera felt under the timeline, with the least and the most in g', async () => {
    await openClip(j.page, JUMPED)
    await preview(j.page).locator('[data-jump-graph]').waitFor()
    await preview(j.page).getByText('What the camera felt').waitFor()
    await said(preview(j.page).locator('[data-graph-extremes]')).toContain('0.30 g')
    await said(preview(j.page).locator('[data-graph-extremes]')).toContain('2.00 g')
    /* nobody invents what the camera did not write down */
    await preview(j.page).getByText('no height or speed — this camera wrote none').waitFor()
    await preview(j.page)
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Info' })
      .click()
    await preview(j.page).getByText('Felt, least').waitFor()
    await preview(j.page).getByText('0.30 g').first().waitFor()
    await quiet()
  })

  test('moves the footage to the instant a point on the graph is dragged to, and reads out what it weighed', async () => {
    const graph = preview(j.page).locator('[data-jump-graph]')
    const box = (await graph.boundingBox())!
    await j.page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
    await j.page.mouse.down()
    await j.page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 })
    await j.page.mouse.up()
    /* a fifth of forty seconds: in freefall, which weighs a gravity */
    await expect.poll(playhead).toBeGreaterThan(6)
    await expect.poll(playhead).toBeLessThan(10)
    await said(preview(j.page).locator('[data-graph-readout]')).toContain(' g · ')
    await said(preview(j.page).locator('[data-graph-readout]')).toContain('freefall')

    /* the wheel on the timeline zooms it, and the graph follows to the same stretch */
    const bar = await barAt(8)
    await j.page.mouse.move(bar.x, bar.y)
    await j.page.mouse.wheel(0, -400)
    await expect
      .poll(() => preview(j.page).locator('[data-zoom-display]').innerText())
      .not.toBe('1.00x')
    await quiet()
  })
})

describe('correcting the marks', () => {
  test('moves the exit by dragging it, and offers to put every mark back where the camera measured them', async () => {
    await preview(j.page)
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Cut' })
      .click()
    /* the whole clip on the timeline again, after the zoom */
    await preview(j.page).locator('[data-action=reset-zoom]').click()
    await expect
      .poll(() => preview(j.page).locator('[data-zoom-display]').innerText())
      .toBe('1.00x')
    const from = await barAt(5)
    const to = await barAt(10)
    await dragMark(from, to)
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBeGreaterThan(10)
    await said(preview(j.page).getByTitle('Go to the exit')).toContain('0:10')
    expect(recorded(j.world, JUMPED).foundMoments?.exit, 'what the camera measured is kept').toBe(6)

    await preview(j.page).getByRole('button', { name: 'Back to the measured marks' }).click()
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBe(6)
    await gone(preview(j.page).getByRole('button', { name: 'Back to the measured marks' }))
    await quiet()
  })

  test('moves the exit by dragging it slowly along the timeline without anything breaking in the console', async () => {
    const from = await barAt(5)
    const to = await barAt(10)
    await dragMark(from, to, 8)
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBeGreaterThan(9)
    await preview(j.page).getByRole('button', { name: 'Back to the measured marks' }).click()
    await expect.poll(() => recorded(j.world, JUMPED).moments?.exit).toBe(6)
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
    await gone(preview(j.page).getByRole('button', { name: 'Back to the measured marks' }))
    await quiet()
  })
})

describe('trimming to the jump', () => {
  test('trims a clip to its jump in one press: from the exit, a second early, to eight seconds after the ground', async () => {
    await preview(j.page)
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Cut' })
      .click()
    await preview(j.page).getByRole('button', { name: 'Trim to the jump' }).click()
    await preview(j.page).getByText('Unsaved changes').waitFor()
    await said(preview(j.page).getByText('Start', { exact: true }).locator('xpath=..')).toContain(
      '0:05'
    )
    await said(preview(j.page).getByText('End', { exact: true }).locator('xpath=..')).toContain(
      '0:36'
    )
    await save().click()
    await preview(j.page).waitFor({ state: 'detached' })
    /* the record is written a moment after the dialog goes */
    await expect.poll(() => recorded(j.world, JUMPED).cropStart).toBeCloseTo(5, 0)
    await expect.poll(() => recorded(j.world, JUMPED).cropEnd).toBeCloseTo(36, 0)
    await quiet()
  })

  test('trims every clip of a jump at once from the jump’s panel, and says how many had no exit found', async () => {
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
    const sion = place(j.page, /Sion/)
    await j.page.getByRole('button', { name: /^Jump 3,/ }).dragTo(sion)
    await sion.click()
    await see('2 files need processing')
    await j.page.getByRole('button', { name: 'Process 2 files' }).click()
    await see('5 files are ready to upload', 60_000)
    const copy = copyOf(JUMPED)
    expect(probe(copy).seconds).toBeGreaterThan(30)
    expect(probe(copy).seconds).toBeLessThan(32.5)
    expect(isCopyOf(copy, path.join(originalsDir(j.world), '2026-09-07', JUMPED))).toBe(true)
    expect(probe(copyOf(PLAIN)).seconds).toBeGreaterThan(3.5)
    await quiet()
  })
})
