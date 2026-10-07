import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { drag } from './c2-helpers'
import { harness } from './harness'
import { filesUnder, originalsDir } from './media'
import { cardOf, dialogNamed, place, rowOf } from './steps'

/* A file dragged onto the Bin in the menu is asked about first, as removing it by any other way is: Cancel
   leaves it where it was, and confirming puts it in the bin. It starts from the footage found, a destination
   made and a jump filed. */

const j = harness({ name: 'c2-bin-drag', state: 'sorted', viewport: { width: 1400, height: 1000 } })
const { see, quiet, open } = j
const LOOSE = 'GX010001.MP4'
const dialog = () => dialogNamed(j.page, 'Remove files')
const original = () => path.join(originalsDir(j.world), '2026-09-06', LOOSE)

describe('dragging a file to the bin', () => {
  test('asks first when a file is dragged onto the Bin, and Cancel leaves it where it was', async () => {
    await open()
    await see('2 jumps are waiting for a home')
    await place(j.page, /Fresh files/).click()
    await cardOf(j.page, 'Loose files').click()
    await drag(j.page, rowOf(j.page, LOOSE), place(j.page, /Bin/))
    await dialog().waitFor()
    await j.page.getByText('Remove 1 file from Fresh files?').waitFor()
    await dialog().getByRole('button', { name: 'Cancel' }).click()
    await dialog().waitFor({ state: 'detached' })
    expect(fs.existsSync(original())).toBe(true)
    await quiet()
  })

  test('puts the file in the bin once confirmed', async () => {
    await drag(j.page, rowOf(j.page, LOOSE), place(j.page, /Bin/))
    await dialog().getByRole('button', { name: 'Put in the bin' }).click()
    await rowOf(j.page, LOOSE).waitFor({ state: 'detached' })
    expect(fs.existsSync(original())).toBe(false)
    expect(filesUnder(j.world.trash).map((f) => path.basename(f))).toContain(LOOSE)
    await quiet()
  })
})
