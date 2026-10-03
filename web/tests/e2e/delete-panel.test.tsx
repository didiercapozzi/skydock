import { createElement } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { DeletePanel } from '../../app/components/delete-panel'
import { liveDeleting } from '../../app/hooks/liveStore'

/* Files being deleted off a camera, in the corner (RULES, Transfers): every file listed from the start,
   each with how far it has got and how big it is, and the whole bar moving with them all — not stuck
   while the files are read several at a time. */

const GB = 1024 ** 3

afterEach(() => liveDeleting.update(() => ({})))

describe('the delete panel', () => {
  test('moves its whole bar with every file, and says how big each is', async () => {
    liveDeleting.update(() => ({
      '/cam/DCIM/A.MP4': { stage: 'checking' as const, part: 0.2, size: GB },
      '/cam/DCIM/B.MP4': { stage: 'checked' as const, part: 0.5, size: GB },
      '/cam/DCIM/C.MP4': { stage: 'checking' as const, part: 0, size: GB },
      '/cam/DCIM/D.MP4': { stage: 'done' as const, part: 1, size: GB }
    }))
    await render(createElement(DeletePanel))

    /* (0.2 + 0.5 + 0 + 1) / 4 */
    await expect
      .element(page.getByRole('progressbar', { name: 'Deleted from the camera' }))
      .toHaveAttribute('aria-valuenow', '43')
    await expect.element(page.getByText('20% of 1.0 GB')).toBeVisible()
    await expect.element(page.getByText('C.MP4')).toBeVisible()
    await expect.element(page.getByText(/0 B/)).not.toBeInTheDocument()
    /* what has gone is at the top, in green */
    await expect
      .poll(() => page.getByRole('listitem').elements()[0]?.textContent ?? '')
      .toContain('D.MP4')
    await expect
      .poll(() => page.getByRole('listitem').elements()[0]?.textContent ?? '')
      .toContain('moved to the bin')
    await expect.element(page.getByText('D.MP4', { exact: true })).toHaveClass('text-up')
  })
})
