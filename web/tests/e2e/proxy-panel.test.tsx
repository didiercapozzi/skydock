import { createElement } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { ProxyPanel } from '../../app/components/proxy-panel'
import { liveFiles } from '../../app/hooks/liveStore'

/* The small copies being made, in the corner while they are (RULES, Transfers): how many clips have
   theirs, and the one being made with a bar of its own. */

afterEach(() => liveFiles.update(() => ({})))

const panel = (over: Partial<Parameters<typeof ProxyPanel>[0]> = {}) =>
  render(
    createElement(ProxyPanel, {
      ready: 12,
      total: 70,
      waiting: 58,
      names: { a: 'GX01.MP4' },
      ...over
    })
  )

describe('the small copies panel', () => {
  test('says how many are made, and shows the one being made with how far it has got', async () => {
    liveFiles.update(() => ({ 'proxy:a': { work: 'proxy' as const, percent: 40 } }))
    await panel()

    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await expect.element(page.getByText(/12 of 70 ready/)).toBeVisible()
    await expect
      .element(page.getByRole('progressbar', { name: 'Small copies made' }))
      .toHaveAttribute('aria-valuenow', '18')
  })

  test('is there while clips are still without one, even before the first starts', async () => {
    await panel({ ready: 0, total: 70, waiting: 70 })

    await expect.element(page.getByText(/0 of 70 ready/)).toBeVisible()
  })

  test('is gone once every clip has its small copy', async () => {
    await panel({ ready: 70, total: 70, waiting: 0 })

    await expect.element(page.getByRole('complementary')).not.toBeInTheDocument()
  })
})
