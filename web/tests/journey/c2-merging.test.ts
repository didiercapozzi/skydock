import { describe, expect, test } from 'vitest'
import { cardOf, drag, jumpsOf, pick, rowOf, timeOf } from './c2-helpers'
import { harness } from './harness'

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

  // BUG: RULES.md (Merging and making jumps by hand) says the merged jump is dated by its earliest file.
  // Done: picked both files of "Jump 1" (Sat 5 Sept 14:30) and dropped them on "Jump 2" (Sun 6 Sept 09:00).
  // Saw: one card "Sun 6 Sept · 09:00 · 4 videos, 1 photo" flagged "2 off the gap"; the earliest file is 14:30 on the 5th.
  // (RULES, Jumps, says a file dragged in changes nothing about the jump it joins: the two sentences meet here.)
  // Suspect: the start of a jump follows its longest run, whichever way the files came in.
  test.skip('dates the jump the merge leaves by its earliest file', async () => {
    await see(/Sat 5 Sept · 14:30/)
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
    const compare = j.page.getByRole('dialog', { name: 'Compare jumps' })
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

  // BUG: RULES.md (Jumps) says two jumps are merged "choosing when the merged jump started — one or the other's
  // start". Done: opened the two jumps side by side, Merge, chose the first jump (group_2, 05.09.2026) as the date,
  // Confirm merge. Saw: the merged card reads "Sun 6 Sept · 09:00", the other jump's start, with its two files flagged
  // "off the gap" and nothing moved: the chosen date has no effect. Suspect: the comparison dialog's merge
  // (web/app/components/comparison-dialog.tsx) or the start being taken from the longest run.
  test.skip('merges onto the start of the jump chosen, not onto the start of the longest run', async () => {
    await see(/Sat 5 Sept · 14:30/)
  })
})
