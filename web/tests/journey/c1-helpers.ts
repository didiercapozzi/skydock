import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect } from 'vitest'
import { dayFolder, makeClip } from './media'
import type { World } from './app'
import type { harness } from './harness'

type Journey = ReturnType<typeof harness>

/* More footage than the story's, for a chapter that is about how files are grouped: a clip or a photo for
   each moment, put where a camera copy puts it — the originals, one folder a day — and named the way a DJI
   camera names it, with a number of its own so none shares a name with the story's. */

const stampOf = (when: string) => when.replace(/[-:T]/g, '')

/* the name a camera gives the clip it shot at a moment, as its n-th file */
const clipName = (when: string, n: number) =>
  `DJI_${stampOf(when)}_${String(n).padStart(4, '0')}_D.MP4`

const clipsAt = (world: World, moments: readonly string[], first = 100) =>
  moments.map((when, i) => {
    const name = clipName(when, first + i)
    makeClip(path.join(dayFolder(world, when), name), when, 2)
    return name
  })

/* each photo a colour of its own: the board recognises the same bytes under another name, and two photos
   cut from one picture would be taken for one */
const makePicture = (file: string, when: string, shade: number) => {
  execFileSync(process.env.SKYDOCK_FFMPEG_PATH ?? 'ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x${((shade * 40503) % 0xffffff).toString(16).padStart(6, '0')}:size=320x240`,
    '-frames:v',
    '1',
    file
  ])
  fs.utimesSync(file, new Date(when), new Date(when))
}

const photosAt = (world: World, moments: readonly string[], first = 500) =>
  moments.map((when, i) => {
    const name = `DJI_${stampOf(when)}_${String(first + i).padStart(4, '0')}_D.JPG`
    makePicture(path.join(dayFolder(world, when), name), when, first + i)
    return name
  })

/* a moment some minutes after another, in the same notation */
const minutesAfter = (when: string, minutes: number) => {
  const at = new Date(`${when}Z`)
  at.setUTCMinutes(at.getUTCMinutes() + minutes)
  return at.toISOString().slice(0, 19)
}

/* a destination made the way a person makes one: the button in the menu, a name, Add */
const addDestination = async (j: Journey, name: string) => {
  await j.page.getByRole('button', { name: /Add a destination/ }).click()
  await j.page.getByPlaceholder('New destination').fill(name)
  await j.page.getByRole('button', { name: 'Add', exact: true }).click()
  await folders(j)
    .getByRole('link', { name: new RegExp(name) })
    .waitFor()
}

/* the menu of places down the left */
const folders = (j: Journey) => j.page.getByRole('navigation', { name: 'Folders' })

/* the cards of Fresh files, as each says itself, in the order they are drawn */
const cardsOf = (j: Journey) =>
  j.page
    .getByRole('button', { name: /^(Loose files|Jump \d+), / })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))

/* the files listed under the cards, in the order they are drawn: each row says its name first */
const namesListed = (j: Journey, within = 'main') =>
  j.page
    .locator(within)
    .getByRole('button', { name: /^(Un)?[Pp]ick \S+\.(MP4|JPG)/ })
    .evaluateAll((rows) =>
      rows.map((row) => /[\w-]+\.(?:MP4|JPG)/.exec(row.textContent ?? '')?.[0] ?? '')
    )

/* the row a file is listed in: a box of its own, the one a person clicks to look at it */
const rowOf = (j: Journey, name: string, within = 'main') =>
  j.page.locator(within).locator('[role=button][data-file]').filter({ hasText: name })

/* what a person waits for: a page that shows it a moment from now, which a check is asked again until it does */
const eventually = <T>(check: () => T | Promise<T>) => expect.poll(check, { timeout: 20_000 })

export {
  addDestination,
  cardsOf,
  clipName,
  clipsAt,
  eventually,
  folders,
  minutesAfter,
  namesListed,
  photosAt,
  rowOf
}
export type { Journey }
