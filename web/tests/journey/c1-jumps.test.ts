import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { cardsOf, clipName, clipsAt, minutesAfter, namesListed } from './c1-helpers'
import { harness } from './harness'
import { filesUnder, makeClip, originalsDir } from './media'
import { dropFiles } from './page'
import { addDestination, details, eventually, folders, rowOf, showDetails } from './steps'

/* How a camera copy becomes jumps: a run of files with no pause of fifteen minutes in it, measured from
   each file to the next (RULES, Jumps). The footage is built to sit on both sides of the gap: fourteen
   minutes apart is one filming, eighteen is two. */

const DAY = '2026-09-05'
/* four clips, fourteen minutes apart: one jump that lasts forty-two minutes */
const FIRST = ['08:00', '08:14', '08:28', '08:42'].map((time) => `${DAY}T${time}:00`)
/* eighteen minutes after the last of them, so a jump of its own */
const SECOND = ['09:00', '09:10'].map((time) => `${DAY}T${time}:00`)
/* alone for hours on either side */
const ALONE = `${DAY}T12:00:00`
/* nine clips each fourteen minutes after the one before: a jump that lasts almost two hours */
const LONG = Array.from({ length: 9 }, (_, i) => minutesAfter(`${DAY}T14:00:00`, i * 14))
/* the next day */
const NEXT_DAY = ['2026-09-06T10:00:00', '2026-09-06T10:05:00']
/* on the computer, to be dropped: loose until they are asked to be grouped */
const DROPPED = [
  ['GX010101.MP4', `${DAY}T21:00:00`],
  ['GX010102.MP4', `${DAY}T21:08:00`]
] as const

const j = harness({
  name: 'c1-jumps',
  prepare: (world) => {
    clipsAt(world, FIRST, 100)
    clipsAt(world, SECOND, 200)
    clipsAt(world, [ALONE], 300)
    clipsAt(world, LONG, 400)
    clipsAt(world, NEXT_DAY, 600)
    for (const [name, when] of DROPPED) makeClip(path.join(world.computer, name), when, 2)
  }
})
const { see, quiet } = j

const originals = (day: string) => filesUnder(path.join(originalsDir(j.world), day))
const card = (label: RegExp) => j.page.getByRole('button', { name: label })

describe('the jumps a camera copy leaves', () => {
  test('groups the files by the fifteen-minute pause, names the jumps by position oldest first through the days, and lets a jump last hours', async () => {
    await j.open()
    await see('Scan: +18 new, −0 gone, 0 moved — 18 files in 4 jumps', 90_000)
    await see('4 jumps are waiting for a home')

    /* newest first, so the numbers count down to Jump 1; Jump 3 and 4 are on different days and do not restart */
    expect(await cardsOf(j.page)).toEqual([
      'Loose files, 1 video · 0 photos',
      'Jump 4, 6 September 2026 10:00, 2 videos · 0 photos',
      'Jump 3, 5 September 2026 14:00, 9 videos · 0 photos',
      'Jump 2, 5 September 2026 09:00, 2 videos · 0 photos',
      'Jump 1, 5 September 2026 08:00, 4 videos · 0 photos'
    ])

    /* the first jump lasts 42 minutes and the third nearly two hours, each file within the pause of the next */
    await card(/^Jump 1, /).click()
    expect(await namesListed(j.page)).toEqual(
      FIRST.map((when, i) => clipName(when, 100 + i)).reverse()
    )
    await card(/^Jump 3, /).click()
    expect(await namesListed(j.page)).toHaveLength(9)

    /* grouping reads the files and moves none of them */
    expect(originals(DAY)).toHaveLength(16)
    expect(originals('2026-09-06')).toHaveLength(2)
    await quiet()
  })

  test('leaves a file with no neighbours loose, listed on a card of its own, rather than making a jump of one', async () => {
    await card(/^Loose files, /).click()
    const loose = j.page.getByRole('region', { name: 'Loose files' })
    await loose.waitFor()
    expect(await namesListed(j.page, 'section[aria-label="Loose files"]')).toEqual([
      'DJI_20260905120000_0300_D.MP4'
    ])
    await eventually(() => cardsOf(j.page).then((cards) => cards.length)).toBe(5)
    await quiet()
  })
})

describe('the jumps a later scan finds', () => {
  test('groups only the files it had not seen: new files within the gap join a jump still in Fresh files, and a jump already filed never grows', async () => {
    /* the long jump is filed to a destination, so it is no longer in Fresh files */
    await addDestination(j.page, 'Sion')
    await j.page
      .getByText('Jump 3', { exact: true })
      .dragTo(folders(j.page).getByRole('link', { name: /Sion/ }))
    await see('9 files need processing', 60_000)

    const [afterFiled] = clipsAt(j.world, [minutesAfter(LONG.at(-1)!, 13)], 700)
    const [afterFresh] = clipsAt(j.world, [minutesAfter(NEXT_DAY[1]!, 10)], 710)
    /* two new files with each other and nobody else near: a jump of their own, in between the others by its day */
    clipsAt(j.world, [`${DAY}T20:00:00`, `${DAY}T20:05:00`], 720)
    await j.page.getByRole('button', { name: 'Rescan cameras' }).click()
    await see('Scan: +4 new', 90_000)
    await folders(j.page)
      .getByRole('link', { name: /Fresh files/ })
      .click()

    /* Jump 4 (the next day) took the clip within its gap, the new pair is the third jump by position */
    await expect
      .poll(() => cardsOf(j.page), { timeout: 30_000 })
      .toEqual([
        'Loose files, 2 videos · 0 photos',
        'Jump 4, 6 September 2026 10:00, 3 videos · 0 photos',
        'Jump 3, 5 September 2026 20:00, 2 videos · 0 photos',
        'Jump 2, 5 September 2026 09:00, 2 videos · 0 photos',
        'Jump 1, 5 September 2026 08:00, 4 videos · 0 photos'
      ])
    await card(/^Jump 4, /).click()
    expect(await namesListed(j.page)).toContain(afterFresh)

    /* the filed jump still holds the nine it had, and the clip after it is loose */
    await card(/^Loose files, /).click()
    expect(await namesListed(j.page, 'section[aria-label="Loose files"]')).toContain(afterFiled)
    await folders(j.page).getByRole('link', { name: /Sion/ }).click()
    await see('9 files need processing')
    expect(await namesListed(j.page)).toHaveLength(9)
    await quiet()
  })

  test('gathers the loose files into jumps by the gap rule when asked, which forgets nothing', async () => {
    await folders(j.page)
      .getByRole('link', { name: /Fresh files/ })
      .click()
    await dropFiles(
      j.page,
      DROPPED.map(([name]) => path.join(j.world.computer, name))
    )
    await see('2 files have been added to Fresh files', 60_000)
    await card(/^Loose files, /).click()

    /* the two dropped files are minutes apart; the two others are hours from anything */
    const group = j.page.getByRole('button', { name: 'Group 2 loose files' })
    await group.click()
    await expect
      .poll(() => cardsOf(j.page), { timeout: 30_000 })
      .toEqual([
        'Loose files, 2 videos · 0 photos',
        'Jump 5, 6 September 2026 10:00, 3 videos · 0 photos',
        'Jump 4, 5 September 2026 21:00, 2 videos · 0 photos',
        'Jump 3, 5 September 2026 20:00, 2 videos · 0 photos',
        'Jump 2, 5 September 2026 09:00, 2 videos · 0 photos',
        'Jump 1, 5 September 2026 08:00, 4 videos · 0 photos'
      ])
    await eventually(() => group.count()).toBe(0)
    await quiet()
  })
})

describe('a jump that should not exist', () => {
  test('is deleted from its panel, and its files stay, loose, each at the time its camera gave it', async () => {
    const [first, second] = SECOND.map((when, i) => clipName(when, 200 + i))
    await card(/^Jump 2, 5 September 2026 09:00/).click()
    await showDetails(j.page)
    await details(j.page).getByRole('button', { name: 'Delete jump' }).click()

    await eventually(() => cardsOf(j.page)).toEqual(
      [
        'Loose files, 4 videos · 0 photos',
        'Jump 5, 6 September 2026 10:00, 3 videos · 0 photos',
        'Jump 4, 5 September 2026 21:00, 2 videos · 0 photos',
        'Jump 3, 5 September 2026 20:00, 2 videos · 0 photos',
        'Jump 1, 5 September 2026 08:00, 4 videos · 0 photos'
      ].map((label) =>
        label.replace(/^Jump (\d)/, (_, n) =>
          Number(n) > 1 ? `Jump ${Number(n) - 1}` : `Jump ${n}`
        )
      )
    )
    await card(/^Loose files, /).click()
    await eventually(() => namesListed(j.page, 'section[aria-label="Loose files"]')).toEqual(
      expect.arrayContaining([first!, second!])
    )
    const times = await rowOf(j.page, first!).textContent()
    expect(times).toMatch(/09:00/)
    expect(await rowOf(j.page, second!).textContent()).toMatch(/09:10/)
    expect(originals(DAY).includes(first!), 'the file is still among the originals').toBe(true)
    await quiet()
  })
})
