import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { cardOf, listing, menuOf, pick, rowOf, scan } from './c2-helpers'
import { harness } from './harness'
import { dropFiles } from './page'

/* The bin: a test shot or footage of the ground goes there after a warning, moved and never erased, and
   comes back when it was wanted after all. It starts from the footage found, a destination made and its files
   processed. */

const j = harness({ name: 'c2-bin', state: 'processed', viewport: { width: 1400, height: 1000 } })
const { see, quiet, open } = j
const SIXTH = 'DJI_20260906090000_0006_D.MP4'
const PHOTO = 'DJI_20260906090130_0008_D.JPG'
const SEVENTH = 'DJI_20260906090300_0007_D.MP4'
const FIRST = 'DJI_20260905100000_0001_D.MP4'
const FIRST_COPY = 'sion_20260905_100000.mp4'
const place = (name: string | RegExp) => menuOf(j.page).getByRole('link', { name })
const originals = () => path.join(j.world.output, 'original_files')
const size = (file: string) => fs.statSync(file).size
const dialog = () => j.page.getByRole('dialog', { name: 'Remove files' })
const bin = () => dialog().getByRole('button', { name: 'Put in the bin' })
const openJump = async () => {
  await place(/Fresh files/).click()
  await cardOf(j.page, 'Jump 2').click()
  await j.page.getByRole('button', { name: /Select its 3 files/ }).click()
  await j.page.getByRole('button', { name: /Remove…/ }).click()
  await dialog().waitFor()
}
/* the folders the bin holds, one for each time something was put aside */
const aside = () => fs.readdirSync(j.world.trash).sort()
const kept = new Map<string, number>()

describe('putting files in the bin', () => {
  test('warns first with how many files, how many videos and photos and how much space, and Cancel leaves them where they were', async () => {
    await open()
    await see('2 jumps are waiting for a home')
    /* a copy of the work folder forgets when each file was taken; the camera had written it */
    for (const [name, when] of [
      [SIXTH, '2026-09-06T09:00:00'],
      [PHOTO, '2026-09-06T09:01:30'],
      [SEVENTH, '2026-09-06T09:03:00']
    ] as const) {
      const file = path.join(originals(), '2026-09-06', name)
      fs.utimesSync(file, new Date(when), new Date(when))
      kept.set(name, size(file))
    }
    await openJump()
    await j.page.getByText('Remove 3 files from Fresh files?').waitFor()
    await j.page.getByText('2 videos and 1 photo, 174 KB in all').waitFor()
    await j.page.getByText(/moved to the bin, not erased/).waitFor()
    await j.page.getByText(/the bin holds the only copy/).waitFor()
    await dialog().getByRole('button', { name: 'Cancel' }).click()
    await dialog().waitFor({ state: 'detached' })
    expect(listing(path.join(originals(), '2026-09-06'))).toEqual(
      [PHOTO, SIXTH, SEVENTH, 'GX010001.MP4'].sort()
    )
    expect(fs.existsSync(j.world.trash) ? aside() : []).toEqual([])
    await quiet()
  })

  test('offers the bin as a red button with a bin on it', async () => {
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await dialog().waitFor()
    expect(await bin().locator('svg').count()).toBe(1)
    const [red, green, blue] = (await bin().evaluate((b) => getComputedStyle(b).backgroundColor))
      .match(/\d+/g)!
      .map(Number)
    expect(red! > green! + 80 && red! > blue! + 80, 'the colour of what is red').toBe(true)
    await quiet()
  })

  test('puts the files in the bin once confirmed: out of the board and the originals, moved and not erased, keeping their day folder', async () => {
    await bin().click()
    await rowOf(j.page, SIXTH).waitFor({ state: 'detached' })
    expect(listing(path.join(originals(), '2026-09-06'))).toEqual(['GX010001.MP4'])
    const [folder] = aside()
    expect(aside()).toHaveLength(1)
    expect(folder).toMatch(/^unsorted-/)
    expect(listing(path.join(j.world.trash, folder!))).toEqual(
      [PHOTO, SIXTH, SEVENTH].map((name) => path.join('2026-09-06', name)).sort()
    )
    for (const [name, bytes] of kept)
      expect(size(path.join(j.world.trash, folder!, '2026-09-06', name)), `${name} whole`).toBe(
        bytes
      )

    await scan(j.page)
    expect(listing(path.join(originals(), '2026-09-06')), 'a scan brings nothing back').toEqual([
      'GX010001.MP4'
    ])
    await quiet()
  })

  test('puts a destination’s file in the bin from where it is, and the copy made from it goes with it', async () => {
    const copy = path.join(j.world.output, 'processed', 'Sion', FIRST_COPY)
    expect(fs.existsSync(copy)).toBe(true)
    await place(/Sion/).click()
    await pick(rowOf(j.page, FIRST_COPY))
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await dialog().waitFor()
    await bin().click()
    await rowOf(j.page, FIRST_COPY).waitFor({ state: 'detached' })
    expect(fs.existsSync(copy), 'its copy has nothing left to come from').toBe(false)
    expect(listing(path.join(j.world.output, 'processed', 'Sion'))).toHaveLength(2)
    expect(listing(path.join(originals(), '2026-09-05'))).not.toContain(
      'DJI_20260905100000_0001_D.MP4'
    )
    const folder = aside().find((name) => name.startsWith('dropzone-sion-'))
    expect(folder, 'named for the destination it came out of').toBeDefined()
    expect(listing(path.join(j.world.trash, folder!))).toEqual([
      path.join('2026-09-05', 'DJI_20260905100000_0001_D.MP4')
    ])
    await quiet()
  })
})

describe('looking into the bin', () => {
  const batches = () => j.page.getByRole('region', { name: 'In the bin' }).locator('h3')
  const pickInBin = (name: string) => j.page.getByRole('button', { name: `Pick ${name}` }).click()
  const bringBack = (count: number) =>
    j.page
      .getByRole('button', {
        name: `Bring ${count} file${count > 1 ? 's' : ''} back to Fresh files`
      })
      .click()

  test('shows each time something was put aside, the latest first, saying where it came from, and which folder to empty by hand', async () => {
    await place(/Bin/).click()
    await see(/Put in the bin from/)
    expect(await batches().allInnerTexts()).toEqual([
      expect.stringContaining('Taken out of the dropzone sion'),
      expect.stringContaining('Put in the bin from Fresh files')
    ])
    for (const name of [FIRST, SIXTH, PHOTO, SEVENTH]) await see(name)
    await see(new RegExp(`remove them yourself from\\s*${j.world.trash}`))
    expect(await j.page.getByRole('button', { name: /delete|empty|erase/i }).count()).toBe(0)
    await quiet()
  })

  test('brings picked files back to Fresh files, into the originals under the day each was shot', async () => {
    await pickInBin(PHOTO)
    await bringBack(1)
    await see('1 file back in Fresh files, out of the bin.')
    expect(fs.existsSync(path.join(originals(), '2026-09-06', PHOTO))).toBe(true)
    const [folder] = aside().filter((name) => name.startsWith('unsorted-'))
    expect(listing(path.join(j.world.trash, folder!))).not.toContain(path.join('2026-09-06', PHOTO))
    await place(/Fresh files/).click()
    await see(PHOTO)
    await quiet()
  })

  test('leaves in the bin, and names, a file whose footage is on the board already, since bringing it back would make two of it', async () => {
    const [folder] = aside().filter((name) => name.startsWith('unsorted-'))
    fs.cpSync(
      path.join(j.world.trash, folder!, '2026-09-06', SEVENTH),
      path.join(j.world.computer, SEVENTH),
      { preserveTimestamps: true }
    )
    await dropFiles(j.page, [path.join(j.world.computer, SEVENTH)])
    await see(`${SEVENTH} has been added to Fresh files`, 60_000)

    await place(/Bin/).click()
    await pickInBin(SEVENTH)
    await bringBack(1)
    await see(`${SEVENTH} is on the board already, and stayed in the bin.`)
    expect(fs.existsSync(path.join(j.world.trash, folder!, '2026-09-06', SEVENTH))).toBe(true)
    expect(listing(originals()).filter((one) => one.endsWith(SEVENTH))).toHaveLength(1)
    await quiet()
  })
})
