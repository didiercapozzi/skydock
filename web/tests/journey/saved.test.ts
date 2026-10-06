import { describe, test } from 'vitest'
import { harness } from './harness'

/* A saved state is a work folder another chapter kept: restored into a folder of its own, the app opens on
   it and finds everything as it was left — which is what lets a chapter start midway through the story. */

const sorted = harness({ name: 'saved-sorted', state: 'sorted' })
const processed = harness({ name: 'saved-processed', state: 'processed' })

describe('a saved state', () => {
  test('is opened by the app with the footage found and a jump filed', async () => {
    await sorted.open()
    await sorted.page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .click()
    await sorted.see('3 files need processing')
    await sorted.quiet()
  })

  test('keeps the copies that processing made', async () => {
    await processed.open()
    await processed.page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .click()
    await processed.see('3 files are ready to upload')
    await processed.quiet()
  })
})
