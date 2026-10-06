import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { cardsOf, clipName, clipsAt, minutesAfter, namesListed } from './c1-helpers'
import { harness } from './harness'
import { filesUnder, makeClip, originalsDir } from './media'
import { dropFiles } from './page'
import { addDestination, details, eventually, folders, rowOf, showDetails } from './steps'

const DAY = '2026-09-05'
const FIRST = ['08:00', '08:14', '08:28', '08:42'].map((time) => `${DAY}T${time}:00`)
const SECOND = ['09:00', '09:10'].map((time) => `${DAY}T${time}:00`)
const ALONE = `${DAY}T12:00:00`
const LONG = Array.from({ length: 9 }, (_, i) => minutesAfter(`${DAY}T14:00:00`, i * 14))
const NEXT_DAY = ['2026-09-06T10:00:00', '2026-09-06T10:05:00']
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

    expect(await cardsOf(j.page)).toEqual([
      'Loose files, 1 video · 0 photos',
      'Jump 4, 6 September 2026 10:00, 2 videos · 0 photos',
      'Jump 3, 5 September 2026 14:00, 9 videos · 0 photos',
      'Jump 2, 5 September 2026 09:00, 2 videos · 0 photos',
      'Jump 1, 5 September 2026 08:00, 4 videos · 0 photos'
    ])

    await card(/^Jump 1, /).click()
    expect(await namesListed(j.page)).toEqual(
      FIRST.map((when, i) => clipName(when, 100 + i)).reverse()
    )
    await card(/^Jump 3, /).click()
    expect(await namesListed(j.page)).toHaveLength(9)

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
    await addDestination(j.page, 'Sion')
    await j.page
      .getByText('Jump 3', { exact: true })
      .dragTo(folders(j.page).getByRole('link', { name: /Sion/ }))
    await see('9 files need processing', 60_000)

    const [afterFiled] = clipsAt(j.world, [minutesAfter(LONG.at(-1)!, 13)], 700)
    const [afterFresh] = clipsAt(j.world, [minutesAfter(NEXT_DAY[1]!, 10)], 710)
    clipsAt(j.world, [`${DAY}T20:00:00`, `${DAY}T20:05:00`], 720)
    await j.page.getByRole('button', { name: 'Rescan cameras' }).click()
    await see('Scan: +4 new', 90_000)
    await folders(j.page)
      .getByRole('link', { name: /Fresh files/ })
      .click()

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
