import { describe, test } from 'vitest'
import { drag } from './c2-helpers'
import { harness } from './harness'
import { place, rowOf } from './steps'

/* A processed file dragged onto the destination it is already in stays as it was: processed. */

const j = harness({
  name: 'c2-same-place',
  state: 'processed',
  viewport: { width: 1400, height: 1000 }
})
const { see, quiet, open } = j
const FILE = 'sion_20260905_100000.mp4'

describe('filing a file where it already is', () => {
  test('leaves a processed file processed when it is dragged from Sion onto Sion', async () => {
    await open()
    await place(j.page, /Sion/).click()
    await see('3 files are ready to upload')
    await drag(j.page, rowOf(j.page, FILE), place(j.page, /Sion/))
    await j.page.waitForTimeout(1500)
    await see('3 files are ready to upload')
    await quiet()
  })
})
