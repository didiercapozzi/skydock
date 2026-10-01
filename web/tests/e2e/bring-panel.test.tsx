import { createElement } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { BringPanel } from '../../app/components/bring-panel'
import { liveBringing } from '../../app/hooks/liveStore'

/* A file fetched back from the storage is shown going, in the corner with the other transfers: its name,
   how big, how far through (RULES, Transfers). One that failed says why, and can be dismissed. */

afterEach(() => liveBringing.update(() => null))

describe('a file being brought back', () => {
  test('is shown going, with its name and how far through it is', async () => {
    liveBringing.update(() => ({
      fileId: 'a',
      name: 'yverdon_20260927_120500.mp4',
      state: 'going',
      part: 0.4,
      size: 527_000_000
    }))
    await render(createElement(BringPanel))

    await expect.element(page.getByText('Bringing back from the storage')).toBeVisible()
    await expect.element(page.getByText('yverdon_20260927_120500.mp4')).toBeVisible()
    await expect
      .element(page.getByRole('progressbar', { name: 'Fetching yverdon_20260927_120500.mp4' }))
      .toBeVisible()
  })

  test('says why it failed, and can be put away', async () => {
    liveBringing.update(() => ({
      fileId: 'a',
      name: 'a.mp4',
      state: 'failed',
      part: 0,
      size: 10,
      reason: 'The storage answered 404 for /x/a.mp4.'
    }))
    await render(createElement(BringPanel))

    await expect.element(page.getByText('The storage answered 404 for /x/a.mp4.')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Dismiss' }))
    await expect.element(page.getByText('Bringing back from the storage')).not.toBeInTheDocument()
  })
})
