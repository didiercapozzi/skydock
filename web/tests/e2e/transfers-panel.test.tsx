import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TransfersPanel } from '../../app/components/transfers-panel'

/* What was sent and copied, opened again after the panels that showed it going have gone (RULES,
   Transfers): the latest open, the others a click away, and all of it forgotten on request. */

const upload = {
  id: 'a',
  kind: 'upload',
  label: 'Luc Favre',
  at: 1_785_000_000,
  state: 'done',
  items: [
    { name: 'luc.mp4', size: 1024 ** 2, to: '/Passengers/luc', result: 'done' },
    { name: 'luc.photos.zip', size: 2048, to: '/Passengers/luc', result: 'skipped' }
  ]
}
const camera = {
  id: 'b',
  kind: 'camera',
  label: 'GoPro',
  at: 1_784_990_000,
  state: 'failed',
  reason: 'The camera was unplugged',
  items: [{ name: 'GX01.MP4', size: 10, result: 'failed' }],
  passedOver: 3
}

const answers = (transfers: unknown[]) =>
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) =>
    Response.json({ transfers: init?.method === 'POST' ? [] : transfers })
  )

afterEach(() => vi.unstubAllGlobals())

const panel = (onClose = vi.fn()) =>
  render(createElement(TransfersPanel, { stamp: '', onClose }))

describe('the transfers panel', () => {
  test('lists each transfer, the latest open to show what it did', async () => {
    answers([upload, camera])
    await panel()

    await expect.element(page.getByText(/Uploaded · Luc Favre/)).toBeVisible()
    await expect.element(page.getByText(/Copied off · GoPro/)).toBeVisible()
    await expect.element(page.getByText('luc.mp4')).toBeVisible()
    await expect.element(page.getByText('GX01.MP4')).not.toBeInTheDocument()

    await userEvent.click(page.getByText(/Copied off · GoPro/))
    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await expect.element(page.getByText('The camera was unplugged')).toBeVisible()
  })

  test('says so when nothing was ever done', async () => {
    answers([])
    await panel()

    await expect.element(page.getByText(/Nothing has been sent or copied yet/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  test('is forgotten with Clear, and closes', async () => {
    answers([upload])
    const onClose = vi.fn()
    await panel(onClose)

    await userEvent.click(page.getByRole('button', { name: 'Clear' }))
    await expect.element(page.getByText(/Nothing has been sent or copied yet/)).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
