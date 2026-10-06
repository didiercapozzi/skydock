import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect } from 'vitest'
import { dayFolder, makeClip } from './media'
import type { World } from './app'
import type { harness } from './harness'

type Journey = ReturnType<typeof harness>

const stampOf = (when: string) => when.replace(/[-:T]/g, '')

const clipName = (when: string, n: number) =>
  `DJI_${stampOf(when)}_${String(n).padStart(4, '0')}_D.MP4`

const clipsAt = (world: World, moments: readonly string[], first = 100) =>
  moments.map((when, i) => {
    const name = clipName(when, first + i)
    makeClip(path.join(dayFolder(world, when), name), when, 2)
    return name
  })

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

const minutesAfter = (when: string, minutes: number) => {
  const at = new Date(`${when}Z`)
  at.setUTCMinutes(at.getUTCMinutes() + minutes)
  return at.toISOString().slice(0, 19)
}

const addDestination = async (j: Journey, name: string) => {
  await j.page.getByRole('button', { name: /Add a destination/ }).click()
  await j.page.getByPlaceholder('New destination').fill(name)
  await j.page.getByRole('button', { name: 'Add', exact: true }).click()
  await folders(j)
    .getByRole('link', { name: new RegExp(name) })
    .waitFor()
}

const folders = (j: Journey) => j.page.getByRole('navigation', { name: 'Folders' })

const cardsOf = (j: Journey) =>
  j.page
    .getByRole('button', { name: /^(Loose files|Jump \d+), / })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))

const namesListed = (j: Journey, within = 'main') =>
  j.page
    .locator(within)
    .getByRole('button', { name: /^(Un)?[Pp]ick \S+\.(MP4|JPG)/ })
    .evaluateAll((rows) =>
      rows.map((row) => /[\w-]+\.(?:MP4|JPG)/.exec(row.textContent ?? '')?.[0] ?? '')
    )

const rowOf = (j: Journey, name: string, within = 'main') =>
  j.page.locator(within).locator('[role=button][data-file]').filter({ hasText: name })

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
