import { describe, expect, test } from 'vitest'
import { drag, jumpsOf, pick, timeOf } from './c2-helpers'
import { harness } from './harness'
import { cardOf, dialogNamed, rowOf } from './steps'

const j = harness({ name: 'c2-merging', state: 'sorted', viewport: { width: 1400, height: 1000 } })
const { see, quiet, open } = j
const FIRST = 'DJI_20260905143000_0004_D.MP4'
const SECOND = 'DJI_20260905143300_0005_D.MP4'
const SIXTH = 'DJI_20260906090000_0006_D.MP4'
const PHOTO = 'DJI_20260906090130_0008_D.JPG'
const SEVENTH = 'DJI_20260906090300_0007_D.MP4'

describe('merging two jumps', () => {
  test('merges two jumps when the files of one are picked in one press and dropped on the other’s card, and the jump left empty disappears', async () => {
    await open()
    await see('2 jumps are waiting for a home')
    const before = [FIRST, SECOND].map((name) => timeOf(j.world, name))
    await cardOf(j.page, 'Jump 1').click()
    await j.page.getByRole('button', { name: 'Select its 2 files' }).click()
    await drag(j.page, rowOf(j.page, FIRST), cardOf(j.page, 'Jump 2'))
    await see('1 jump is waiting for a home')
    await expect.poll(() => jumpsOf(j.world).filter((jump) => !jump.destination)).toHaveLength(1)
    const [merged] = jumpsOf(j.world).filter((jump) => !jump.destination)
    expect([...merged!.files].sort()).toEqual([FIRST, SECOND, SIXTH, PHOTO, SEVENTH].sort())
    expect(await j.page.getByRole('button', { name: /^Jump \d+,/ }).count()).toBe(1)
    expect(
      [FIRST, SECOND].map((name) => timeOf(j.world, name)),
      'the files keep their own times'
    ).toEqual(before)
    await quiet()
  })

  test('starts the jump the merge leaves when its longest run does, flagging the files of the other as off the gap', async () => {
    await see(/Sun 6 Sept · 09:00 · 4 videos, 1 photo/)
    await see(/2 off the gap/)
  })
})

describe('making a jump by hand', () => {
  test('makes a jump of picked loose files, asking only when it started and moving every file by the same amount, and opens its panel', async () => {
    await cardOf(j.page, 'Jump 1').click()
    await pick(rowOf(j.page, FIRST))
    await pick(rowOf(j.page, SECOND))
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await j.page.getByRole('button', { name: 'Loose in Fresh files' }).first().click()
    await cardOf(j.page, 'Loose files').click()
    await pick(rowOf(j.page, FIRST))
    await pick(rowOf(j.page, SECOND))
    const gap = timeOf(j.world, SECOND)! - timeOf(j.world, FIRST)!
    await j.page.getByRole('button', { name: 'Make a jump of these…' }).click()
    await j.page.getByText('Every file moves with it, keeping the gaps between them').waitFor()
    expect(
      await j.page.getByLabel('Name', { exact: true }).count(),
      'a jump has no name here'
    ).toBe(0)
    await j.page.getByLabel('Started').fill('2026-09-07T10:00')
    await j.page.getByRole('button', { name: 'Make the jump' }).click()
    await j.page.getByText('JUMP · 7 SEPTEMBER 2026').waitFor()
    await rowOf(j.page, FIRST).getByText('10:00').waitFor()
    await rowOf(j.page, SECOND).getByText('10:03').waitFor()
    expect(timeOf(j.world, SECOND)! - timeOf(j.world, FIRST)!, 'the gap between them is kept').toBe(
      gap
    )
    await quiet()
  })
})

describe('two jumps side by side', () => {
  test('are opened next to each other by a ctrl-click on a second jump, and merged onto a time typed in', async () => {
    const compare = dialogNamed(j.page, 'Compare jumps')
    await cardOf(j.page, 'Jump 1').click({ modifiers: ['Control'] })
    await compare.waitFor()
    for (const name of [FIRST, SECOND, SIXTH, PHOTO, SEVENTH])
      await compare.getByText(name).first().waitFor()
    await compare.getByRole('button', { name: 'Close' }).click()
    await compare.waitFor({ state: 'detached' })

    const gaps = () => [
      timeOf(j.world, SECOND)! - timeOf(j.world, FIRST)!,
      timeOf(j.world, SEVENTH)! - timeOf(j.world, SIXTH)!
    ]
    const kept = gaps()
    await cardOf(j.page, 'Jump 1').click({ modifiers: ['Control'] })
    await compare.waitFor()
    await compare.getByRole('button', { name: 'Merge' }).click()
    await j.page.locator('[data-date-choice="custom"]').check()
    await j.page.locator('[data-custom-date]').fill('2026-09-08')
    await j.page.locator('[data-custom-time]').fill('08:00')
    await j.page.getByRole('button', { name: 'Confirm merge' }).click()
    await compare.waitFor({ state: 'detached' })
    await see('1 jump is waiting for a home')
    await see(/Tue 8 Sept · 08:00/)
    await expect.poll(() => jumpsOf(j.world).filter((jump) => !jump.destination)).toHaveLength(1)
    expect(gaps(), 'every file moved by the same amount').toEqual(kept)
    await quiet()
  })
})
