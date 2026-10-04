import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TransfersPanel } from '../../app/components/transfers-panel'
import { liveJobs } from '../../app/hooks/liveStore'
import { Notice } from '../../app/components/notice'

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

const sent: string[] = []

const answers = (transfers: unknown[]) =>
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST') sent.push(String(init.body))
    return Response.json({ transfers: init?.method === 'POST' ? [] : transfers })
  })

afterEach(() => {
  sent.length = 0
  vi.unstubAllGlobals()
})

const panel = (onClose = vi.fn(), dsmHost?: string) =>
  render(
    createElement(TransfersPanel, {
      stamp: '',
      dsmHost,
      onClose
    })
  )

/* everything with a bar is here too, so the page can be left while it goes */
describe('the transfers panel — what is going now', () => {
  test('shows what is going out, coming in and being deleted, each with how far it has got', async () => {
    answers([])
    liveJobs.update(() => ({
      upload: {
        id: 'upload',
        type: 'upload' as const,
        label: 'Luc Favre',
        stage: 'working' as const,
        done: 0,
        total: 4,
        rows: [{ key: 'a', name: 'luc.mp4', size: 1000, at: 'now' as const, part: 0.25 }]
      },
      delete: {
        id: 'delete',
        type: 'camera-delete' as const,
        label: 'camera',
        stage: 'working' as const,
        done: 0,
        total: 2,
        rows: [
          { key: '/mnt/cam/DCIM/A.MP4', name: 'A.MP4', size: 0, at: 'now' as const, part: 0.6 },
          { key: '/mnt/cam/DCIM/B.MP4', name: 'B.MP4', size: 0, at: 'now' as const, part: 0.1 }
        ]
      }
    }))
    await panel()

    const going = page.getByRole('list', { name: 'Going now' })
    await expect.element(going.getByText('Uploading Luc Favre')).toBeVisible()
    await expect
      .element(going.getByRole('progressbar', { name: 'Uploading Luc Favre' }))
      .toHaveAttribute('aria-valuenow', '25')
    await expect.element(going.getByText('Deleting from the camera')).toBeVisible()
    await expect
      .element(going.getByRole('progressbar', { name: 'Deleting from the camera' }))
      .toHaveAttribute('aria-valuenow', '35')
    liveJobs.update(() => ({}))
  })

  test('has no list when nothing is going', async () => {
    answers([])
    await panel()

    await expect.element(page.getByRole('list', { name: 'Going now' })).not.toBeInTheDocument()
  })
})

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

  test('names a file that was in the way, linked to its folder on the storage', async () => {
    answers([
      {
        id: 'c',
        kind: 'upload',
        label: 'Vincent',
        at: 1_785_100_000,
        state: 'failed',
        reason: 'a.zip is already on the storage, so nothing was sent.',
        items: [{ name: 'a.zip', size: 10, to: '/home/tmp/Backup', result: 'failed', note: 'taken' }]
      }
    ])
    await panel(vi.fn(), 'https://nas.example:5001')

    await expect.element(page.getByText('already on the storage', { exact: true })).toBeVisible()
    const link = page.getByRole('link', { name: 'Open in DSM' }).element() as HTMLAnchorElement
    expect(link.target).toBe('_blank')
    expect(decodeURIComponent(decodeURIComponent(link.href))).toContain('openfile=/home/tmp/Backup/a.zip')
  })

  test('links a file already uploaded to its folder on the storage too', async () => {
    answers([upload])
    await panel(vi.fn(), 'https://nas.example:5001')

    /* every row of an upload has its button: the one sent, and the one that was there already */
    await expect.element(page.getByRole('link', { name: 'Open in DSM' }).first()).toBeVisible()
    const links = page.getByRole('link', { name: 'Open in DSM' }).elements() as HTMLAnchorElement[]
    expect(links).toHaveLength(2)
    expect(decodeURIComponent(decodeURIComponent(links[1]!.href))).toContain(
      'openfile=/Passengers/luc/luc.photos.zip'
    )
  })

  test('lists a file brought back from the storage', async () => {
    answers([
      {
        id: 'd',
        kind: 'bring',
        label: 'yverdon.mp4',
        at: 1_785_200_000,
        state: 'done',
        items: [{ name: 'yverdon.mp4', size: 527_000_000, to: 'this machine', result: 'done' }]
      }
    ])
    await panel()

    await expect.element(page.getByText(/Brought back · yverdon\.mp4/)).toBeVisible()
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

  /* one forgotten, the others kept: a cross on each, beside it and not inside it */
  test('forgets one transfer and keeps the others', async () => {
    answers([upload, camera])
    await panel()

    await userEvent.click(page.getByRole('button', { name: /Forget Uploaded · Luc Favre/ }))

    await expect.element(page.getByText(/Uploaded · Luc Favre/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/Copied off · GoPro/)).toBeVisible()
    expect(sent.join('')).toContain('"remove":"a"')
    expect(sent.join('')).not.toContain('clear')
  })
})

describe('the line that says a transfer failed', () => {
  test('is a way into the transfers when it is about one', async () => {
    const opened = vi.fn()
    await render(
      createElement(Notice, {
        problem: true,
        onClose: vi.fn(),
        onOpen: opened,
        children: 'a.zip is in the way'
      })
    )
    await userEvent.click(page.getByRole('button', { name: 'a.zip is in the way' }))
    expect(opened).toHaveBeenCalledOnce()
  })
})
