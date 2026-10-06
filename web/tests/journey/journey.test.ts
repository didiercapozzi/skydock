import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { CLIPS, dayFolder, DROPS, makeClip, makePhoto, originalsDir, PHOTOS, probe } from './media'
import { dropFiles } from './page'
import { openClip, place, preview } from './steps'

/* One person, one afternoon: the footage comes in, is sorted, trimmed, prepared and sent, with the real
   server, the real tools and a browser. Every chapter ends by asking whether anything broke without saying
   so — an error in the console, a request the server could not answer. The work folder is kept after the
   key chapters, for the files of the journey that start where this story left off. */

const j = harness({
  name: 'journey',
  /* and what is on the computer, to be dropped */
  prepare: (world) => {
    for (const [name, when] of DROPS) makeClip(path.join(world.computer, name), when)
  }
})
const { see, quiet, open } = j

describe('the first afternoon', () => {
  test('opens on an empty board that says so', async () => {
    await open()
    await see('Nothing left to sort')
    await quiet()
  })

  /* what a camera copy leaves in the originals: one folder a day, as the card had it */
  test('finds the jumps in what a camera copy left, when asked to scan', async () => {
    for (const [name, when] of CLIPS) makeClip(path.join(dayFolder(j.world, when), name), when)
    for (const [name, when] of PHOTOS) makePhoto(path.join(dayFolder(j.world, when), name), when)
    await j.page.getByRole('button', { name: 'Scan' }).click()
    await see(/8 files in 3 jumps/, 60_000)
    await quiet()
  })

  test('takes in files dropped from the computer, and leaves them loose', async () => {
    await dropFiles(
      j.page,
      DROPS.map(([name]) => path.join(j.world.computer, name))
    )
    await see('GX010001.MP4 has been added to Fresh files', 60_000)
    await quiet()
  })
})

describe('sorting', () => {
  test('makes a destination, and files a jump into it by dragging it there', async () => {
    await j.page.getByRole('button', { name: /Add a destination/ }).click()
    await j.page.getByPlaceholder('New destination').fill('Sion')
    await j.page.getByRole('button', { name: 'Add', exact: true }).click()
    const sion = place(j.page, /Sion/)
    await sion.waitFor()

    await j.page.getByText('Jump 1', { exact: true }).dragTo(sion)
    await see('3 files need processing')
    await quiet()
  })

  test('stops saying how many clips have their small copy once every clip can be played', async () => {
    await j.page.getByText(/Proxies ready/).waitFor({ state: 'detached', timeout: 30_000 })
    await quiet()
    /* from here a chapter can start with the footage found, a destination made and a jump filed */
    j.save('sorted')
  })
})

describe('preparing', () => {
  test('processes the files of a destination, and writes their copies', async () => {
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(fs.readdirSync(path.join(j.world.output, 'processed', 'Sion')).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4'
    ])
    await quiet()
    j.save('processed')
  })
})

describe('trimming', () => {
  const copy = path.join('processed', 'Sion', 'sion_20260905_100000.mp4')
  test('trims a clip from the middle, and the copy is shorter once it is made again', async () => {
    expect(probe(path.join(j.world.output, copy)).seconds).toBeGreaterThan(3.5)
    await openClip(j.page, 'sion_20260905_100000.mp4')
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await preview(j.page).getByRole('button', { name: 'Start here' }).click()
    await preview(j.page).getByRole('button', { name: 'Save', exact: true }).click()
    await preview(j.page).waitFor({ state: 'detached' })

    await see('1 file needs processing')
    await j.page.getByRole('button', { name: 'Process 1 file' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(probe(path.join(j.world.output, copy)).seconds).toBeLessThan(2.5)
    await quiet()
  })

  test('puts a clip back whole with Reset and Save, and the copy is whole again', async () => {
    await openClip(j.page, 'sion_20260905_100000.mp4')
    await preview(j.page).getByRole('button', { name: 'Reset trim, frame and turn' }).click()
    await preview(j.page).getByRole('button', { name: 'Save', exact: true }).click()
    await preview(j.page).waitFor({ state: 'detached' })

    await see('1 file needs processing')
    await j.page.getByRole('button', { name: 'Process 1 file' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(probe(path.join(j.world.output, copy)).seconds).toBeGreaterThan(3.5)
    await quiet()
  })
})

describe('stopping and opening again', () => {
  test('finds everything as it was left, from the record alone', async () => {
    await j.restart()
    await open()
    await place(j.page, /Sion/).click()
    await see('3 files are ready to upload')
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await see('2 jumps are waiting for a home')
    await quiet()
  })
})

describe('the bin', () => {
  test('keeps a file put aside, and brings it back to Fresh files when asked', async () => {
    const original = path.join(originalsDir(j.world), '2026-09-06', 'GX010001.MP4')
    const row = j.page
      .locator('div', { has: j.page.getByText('GX010001.MP4', { exact: true }) })
      .last()
    await row.getByRole('button', { name: 'Pick' }).click()
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await j.page.getByRole('button', { name: 'Put in the bin' }).click()
    await j.page.getByText('GX010001.MP4', { exact: true }).first().waitFor({ state: 'detached' })
    expect(fs.existsSync(original), 'moved out of the originals, not copied').toBe(false)

    await j.page.getByRole('link', { name: 'Bin' }).click()
    await see(/Put in the bin from Fresh files/)
    await j.page.getByRole('button', { name: 'Pick GX010001.MP4' }).click()
    await j.page.getByRole('button', { name: /Bring 1 file back to Fresh files/ }).click()
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await see('GX010001.MP4')
    expect(fs.existsSync(original), 'back where it was').toBe(true)
    await quiet()
  })
})
