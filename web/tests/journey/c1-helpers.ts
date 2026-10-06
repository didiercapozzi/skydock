import * as path from 'node:path'
import type { Page } from 'playwright'
import { dayFolder, makeClip, makeOwnPhoto } from './media'
import type { World } from './app'

const stampOf = (when: string) => when.replace(/[-:T]/g, '')

const clipName = (when: string, n: number) =>
  `DJI_${stampOf(when)}_${String(n).padStart(4, '0')}_D.MP4`

const clipsAt = (world: World, moments: readonly string[], first = 100) =>
  moments.map((when, i) => {
    const name = clipName(when, first + i)
    makeClip(path.join(dayFolder(world, when), name), when, 2)
    return name
  })

const photosAt = (world: World, moments: readonly string[], first = 500) =>
  moments.map((when, i) => {
    const name = `DJI_${stampOf(when)}_${String(first + i).padStart(4, '0')}_D.JPG`
    makeOwnPhoto(path.join(dayFolder(world, when), name), when, first + i)
    return name
  })

const minutesAfter = (when: string, minutes: number) => {
  const at = new Date(`${when}Z`)
  at.setUTCMinutes(at.getUTCMinutes() + minutes)
  return at.toISOString().slice(0, 19)
}

const cardsOf = (page: Page) =>
  page
    .getByRole('button', { name: /^(Loose files|Jump \d+), / })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))

const namesListed = (page: Page, within = 'main') =>
  page
    .locator(within)
    .getByRole('button', { name: /^(Un)?[Pp]ick \S+\.(MP4|JPG)/ })
    .evaluateAll((rows) =>
      rows.map((row) => /[\w-]+\.(?:MP4|JPG)/.exec(row.textContent ?? '')?.[0] ?? '')
    )

export { cardsOf, clipName, clipsAt, minutesAfter, namesListed, photosAt }
