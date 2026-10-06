import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import type { Locator } from 'playwright'
import { gone, isCopyOf, pressed, switchedOff } from './d-helpers'
import { harness } from './harness'
import { originalFile, probe } from './media'
import { recorded } from './record'
import { closeClip, dialogNamed, openClip, place, preview, said } from './steps'

/* The preview of a clip in a destination: what a person does to a clip there — cut its ends, frame it, turn
   it, leave without saving — and what each of those makes of the copy once the files are processed again.
   Starts from the three processed copies of Sion; each clip of the jump is the subject of its own
   chapters, so what one leaves behind is not what another finds. */

const j = harness({ name: 'd-preview', state: 'processed' })
const { see, quiet } = j

beforeAll(() => j.page.setDefaultTimeout(15_000))

const FIRST = 'DJI_20260905100000_0001_D.MP4'
const SECOND = 'DJI_20260905100240_0002_D.MP4'
const THIRD = 'DJI_20260905100520_0003_D.MP4'
const original = (name: string) => originalFile(j.world, '2026-09-05', name)
const copyName = (clip: string) => `sion_${clip.slice(4, 12)}_${clip.slice(12, 18)}.mp4`
const copyOf = (clip: string) => path.join(j.world.output, 'processed', 'Sion', copyName(clip))

const asked = () => dialogNamed(j.page, 'Unsaved changes')
const save = () => preview(j.page).getByRole('button', { name: 'Save', exact: true })
const button = (name: string) => preview(j.page).getByRole('button', { name, exact: true })
const tab = (name: string) =>
  preview(j.page)
    .getByRole('group', { name: 'What to change' })
    .getByRole('button', { name, exact: true })
const rectangle = () => preview(j.page).locator('[aria-label="Part of the picture to keep"]')
const startTile = () => preview(j.page).getByText('Start', { exact: true }).locator('xpath=..')

const saveAndClose = async () => {
  await save().click()
  await preview(j.page).waitFor({ state: 'detached' })
}

/* the files are processed again, as the destination's own button says */
const processAgain = async (count: number) => {
  await j.page
    .getByRole('button', { name: `Process ${count} file${count === 1 ? '' : 's'}` })
    .click()
  await see('3 files are ready to upload', 60_000)
}

/* where the picture is, in the clip's own seconds */
const playhead = () => j.page.evaluate(() => document.querySelector('video')?.currentTime ?? -1)

/* the shape a box takes on screen */
const shapeOf = async (what: Locator) => {
  const box = (await what.boundingBox())!
  return box.width / box.height
}

/* the bottom-right corner of the rectangle is dragged in, towards the middle of the picture */
const shrinkRectangle = async () => {
  const corner = (await preview(j.page).locator('[aria-label="Resize se"]').boundingBox())!
  const from = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }
  await j.page.mouse.move(from.x, from.y)
  await j.page.mouse.down()
  await j.page.mouse.move(from.x - 60, from.y - 45, { steps: 6 })
  await j.page.mouse.up()
}

describe('opening a clip in a destination', () => {
  test('opens a clip already trimmed where its trim starts, and the next clip on its own trim', async () => {
    await j.open()
    await place(j.page, /Sion/).click()
    await see('3 files are ready to upload')

    await openClip(j.page, FIRST)
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await button('Start here').click()
    await saveAndClose()
    await see('1 file needs processing')
    await expect.poll(() => recorded(j.world, FIRST).cropStart).toBeGreaterThan(1.5)
    expect(recorded(j.world, FIRST).cropStart).toBeLessThan(2.5)

    await openClip(j.page, FIRST)
    await expect.poll(playhead).toBeGreaterThan(1.5)
    await expect.poll(() => startTile().innerText()).toMatch(/0:0[12]/)

    /* stepping on shows the next clip whole: its own start, never the one just left */
    await button('Next').click()
    await preview(j.page).getByText('2 of 3').waitFor()
    await expect.poll(playhead).toBeLessThan(0.3)
    await said(startTile()).toContain('0:00')
    await closeClip(j.page)
    await quiet()
  })
})

describe('what a trim costs, and weighs', () => {
  test('says what a trim will weigh with a tilde before the copy exists, and the copy’s own size after', async () => {
    const before = recorded(j.world, FIRST)
    await openClip(j.page, FIRST)
    /* the estimate sits beside the size in the header, marked */
    await preview(j.page)
      .getByText(/KB\s*→\s*~[\d.]+ ?KB/)
      .first()
      .waitFor()
    await said(preview(j.page)).toContain('Size after')
    await closeClip(j.page)

    await processAgain(1)
    /* the copy exists, so the list says its own size, with no tilde */
    const size = recorded(j.world, FIRST).processed!.size
    expect(size).toBeLessThan(before.size!)
    await j.page
      .getByText(/83 KB → \d+ KB/)
      .first()
      .waitFor()
    await gone(j.page.getByText(/→\s*~/))
    await quiet()
  })

  test('copies a clip that is only trimmed, losing nothing: the same pictures with the ends cut off', async () => {
    const copy = copyOf(FIRST)
    expect(probe(copy).seconds).toBeLessThan(2.5)
    expect(isCopyOf(copy, original(FIRST)), 'the pictures were not encoded again').toBe(true)
    expect(probe(copy).width).toBe(320)
    await quiet()
  })
})

describe('framing a clip', () => {
  test('cuts a rectangle out of the picture by dragging a corner, keeping the shape the clip has', async () => {
    await openClip(j.page, SECOND)
    await tab('Frame').click()
    await button('Same').click()
    await rectangle().waitFor()
    const whole = await shapeOf(rectangle())

    await shrinkRectangle()

    await preview(j.page)
      .getByText(/keeps \d+% of the picture/)
      .first()
      .waitFor()
    expect(Math.abs((await shapeOf(rectangle())) - whole), 'the shape is kept').toBeLessThan(0.08)
    const picture = (await preview(j.page).locator('video').boundingBox())!
    expect((await rectangle().boundingBox())!.width).toBeLessThan(picture.width)
    await said(preview(j.page)).toContain('% across')
    await pressed(button('Same'), true)
    await quiet()
  })

  test('gives the rectangle other shapes, and a free one', async () => {
    for (const [name, shape] of [
      ['16:9', 16 / 9],
      ['1:1', 1],
      ['9:16', 9 / 16],
      ['4:5', 4 / 5]
    ] as const) {
      await button(name).click()
      await pressed(button(name), true)
      await expect.poll(() => shapeOf(rectangle())).toBeGreaterThan(shape * 0.9)
      await expect.poll(() => shapeOf(rectangle())).toBeLessThan(shape * 1.1)
    }
    await button('Free').click()
    await pressed(button('Free'), true)
    /* back on the clip's own shape, which is what is then handed over */
    await button('Same').click()
    await expect.poll(() => shapeOf(rectangle())).toBeGreaterThan(1.2)
    await shrinkRectangle()
    await said(preview(j.page)).toContain('% across')
    await quiet()
  })

  test('leaves a clip already landscape as it is when asked for blurred sides', async () => {
    await switchedOff(button('Landscape, blurred sides'), true)
    await said(preview(j.page)).toContain(
      'Only for a clip that stands upright. This one is landscape.'
    )
    await quiet()
  })

  test('saves the rectangle, makes the copy out of date, and encodes the clip again at the size it came at', async () => {
    await saveAndClose()
    await see('1 file needs processing')
    await expect.poll(() => recorded(j.world, SECOND).frame?.width).toBeLessThan(1)
    await j.page
      .getByTitle(/Frame saved/)
      .first()
      .waitFor()

    await processAgain(1)
    const copy = copyOf(SECOND)
    expect(probe(copy), 'a 4:3 clip stays the size it came at').toMatchObject({
      width: 320,
      height: 240
    })
    expect(
      isCopyOf(copy, original(SECOND)),
      'a frame changes the picture, so it is encoded again'
    ).toBe(false)
    await j.page
      .getByTitle(/Framed when this file was processed/)
      .first()
      .waitFor()
    await quiet()
  })

  test('opens a clip again with its rectangle where it was saved and its shape marked, and the next clip whole', async () => {
    await openClip(j.page, SECOND)
    await tab('Frame').click()
    await rectangle().waitFor()
    await pressed(button('Same'), true)
    await button('Next').click()
    await preview(j.page).getByText('3 of 3').waitFor()
    await pressed(button('None'), true)
    await gone(rectangle())
    await closeClip(j.page)
    await quiet()
  })
})

describe('turning a clip', () => {
  test('turns a clip a quarter at a time with the button or R, a half turn, and back to as shot, the picture following', async () => {
    await openClip(j.page, THIRD)
    await tab('Turn').click()
    await button('↻ +180°').click()
    await pressed(button('↻ +180°'), true)
    await j.page.keyboard.press('r')
    await pressed(button('↻ +180°'), false)
    await button('0°').click()
    await pressed(button('0°'), true)

    /* a quarter turn makes the picture portrait, in the shape it will come out in */
    await button('↻ +90°').click()
    await pressed(button('↻ +90°'), true)
    await preview(j.page).locator('[style*="aspect-ratio: 240 / 320"]').waitFor()
    await said(preview(j.page)).toContain('a quarter turn makes it portrait')
    await quiet()
  })

  test('saves the turn, makes the copy out of date, and encodes the clip again turned', async () => {
    await saveAndClose()
    await see('1 file needs processing')
    await expect.poll(() => recorded(j.world, THIRD).rotation).toBe(90)
    await j.page
      .getByText(/turn ¼/)
      .first()
      .waitFor()

    await processAgain(1)
    const copy = copyOf(THIRD)
    expect(probe(copy), 'a quarter turn makes a clip portrait').toMatchObject({
      width: 240,
      height: 320
    })
    expect(isCopyOf(copy, original(THIRD))).toBe(false)
    await quiet()
  })

  test('delivers an upright clip as a landscape one, its sides filled with the picture blurred', async () => {
    await openClip(j.page, THIRD)
    await tab('Frame').click()
    const sides = button('Landscape, blurred sides')
    await switchedOff(sides, false)

    /* its own switch takes it away again, and nothing is left to save */
    await sides.click()
    await pressed(sides, true)
    await switchedOff(save(), false)
    await sides.click()
    await pressed(sides, false)
    await switchedOff(save(), true)

    await sides.click()
    await saveAndClose()
    await see('1 file needs processing')
    await processAgain(1)
    const delivered = probe(copyOf(THIRD))
    expect(delivered.height, 'as high as the upright clip was wide').toBe(240)
    expect(delivered.width / delivered.height).toBeCloseTo(16 / 9, 1)
    await quiet()
  })

  test('puts the clip back whole with Reset: no turn, no blurred sides, and the copy is as shot again', async () => {
    await openClip(j.page, THIRD)
    await button('Reset trim, frame and turn').click()
    await said(preview(j.page)).toContain('Unsaved changes')
    await saveAndClose()
    await see('1 file needs processing')
    await processAgain(1)
    expect(probe(copyOf(THIRD))).toMatchObject({ width: 320, height: 240 })
    expect(recorded(j.world, THIRD).rotation ?? 0).toBe(0)
    expect(recorded(j.world, THIRD).frame ?? null).toBeNull()
    await quiet()
  })

  test('gives the turn to every clip of the jump in one press', async () => {
    await openClip(j.page, THIRD)
    await tab('Turn').click()
    await button('↻ +90°').click()
    await button('Give to every clip in the jump').click()
    /* it is given and written there and then: nothing is left to save */
    await switchedOff(save(), true)
    await closeClip(j.page)
    for (const clip of [FIRST, SECOND, THIRD])
      await expect.poll(() => recorded(j.world, clip).rotation).toBe(90)
    await see('3 files need processing')
    await quiet()
  })
})

describe('leaving a clip with changes not saved', () => {
  test('asks before Escape, a click outside, Cancel, Previous or Next leave, and Keep editing keeps the change', async () => {
    await openClip(j.page, SECOND)
    await tab('Turn').click()
    await button('0°').click()
    await said(preview(j.page)).toContain('Unsaved changes')

    const leaves = [
      () => j.page.keyboard.press('Escape'),
      () => j.page.mouse.click(4, 4),
      () => button('Cancel').click(),
      () => button('Previous').click(),
      () => button('Next').click()
    ]
    for (const leave of leaves) {
      await leave()
      await said(asked()).toContain('Save the changes to this file?')
      await asked().getByRole('button', { name: 'Keep editing' }).click()
      await asked().waitFor({ state: 'detached' })
      await preview(j.page).getByText('2 of 3').waitFor()
      await pressed(button('0°'), true)
    }
    await quiet()
  })

  test('puts everything back when the change is discarded, and keeps it when it is saved on the way out', async () => {
    expect(recorded(j.world, SECOND).rotation).toBe(90)
    await button('Cancel').click()
    await asked().getByRole('button', { name: 'Discard' }).click()
    await preview(j.page).waitFor({ state: 'detached' })
    expect(recorded(j.world, SECOND).rotation, 'nothing was written').toBe(90)

    /* Next, saved on the way: the clip is saved and the next one opens */
    await openClip(j.page, SECOND)
    await tab('Turn').click()
    await button('0°').click()
    await button('Next').click()
    await asked().getByRole('button', { name: 'Save', exact: true }).click()
    await preview(j.page).getByText('3 of 3').waitFor()
    await expect.poll(() => recorded(j.world, SECOND).rotation ?? 0).toBe(0)
    await closeClip(j.page)
    await quiet()
  })
})
