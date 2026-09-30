import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { DEFAULT_PLAN } from '@skydock/scripts'
import { setSendPlan } from '../../app/hooks/useSendPlan'
import { boardRoute } from './board-route'

/* An upload is shown on the board while it goes, from whatever page is open, in the same corner and
   the same shape as files being copied in: every item and where it has got to. Only one goes at a
   time, it is never offered again on top of itself — whether the page was left, reloaded or another
   edit made meanwhile — and it can be cancelled at any moment (RULES, Uploading). */

const GB = 1024 ** 3

const file = (id: string, name: string, size: number) => ({
  id,
  path: `/workspace/output/original_files/2026-08-01/${name}`,
  filename: name,
  size,
  mtime: 1_785_000_000,
  processed: {
    path: `/workspace/output/processed/Montages/Luc Favre/x/${name}`,
    size,
    at: 1,
    source: { id, size, mtime: 1_785_000_000 }
  }
})

const files = [
  file('v1', 'GX010001.MP4', 8 * GB),
  file('v2', 'GX010002.MP4', 8 * GB),
  file('p1', 'G0010003.JPG', 5 * 1024 ** 2)
]

const board = {
  groups: [
    {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      processed: true,
      files
    }
  ],
  looseFiles: [],
  destinations: [
    { name: 'Passengers', path: '/SkyDock/Passengers' },
    { name: 'Backup', path: '/Backup' },
    { name: 'Yverdon', path: '/SkyDock/Yverdon' }
  ],
  outputs: Object.fromEntries(files.map((f) => [f.path, { exists: true, size: f.size }])),
  proxies: {},
  montages: {
    g1: {
      project: true,
      projectPath: '/output/processed/Montages/Luc Favre/luc_favre_20260801.kdenlive',
      film: {
        size: 3 * GB,
        mtime: 1_785_003_600,
        seconds: 312,
        path: '/workspace/output/processed/Montages/Luc Favre/luc_favre_20260801.mp4'
      },
      baseName: 'luc_favre_20260801'
    }
  },
  remote: null,
  hasManifest: true,
  processing: null,
  nas: {
    connected: true,
    hostname: 'nas.local',
    backupFolder: '/Backup'
  }
}


const going = { key: 'montage:g1', label: 'Luc Favre' }

/* what the server says of the upload going: a zip sent, the film going up, the photos already there */
const progress = {
  scope: 'montage:g1',
  label: 'Luc Favre',
  groupId: 'g1',
  filename: 'luc_favre.mp4',
  bytesUploaded: GB,
  totalBytes: 3 * GB,
  fileIndex: 1,
  totalFiles: 2,
  state: 'uploading',
  items: [
    { key: '/Backup/luc-favre/luc_favre.full.zip', name: 'luc_favre.full.zip', size: 16 * GB, to: '/Backup/luc-favre', state: 'sent' },
    { key: '/SkyDock/Tandems/luc-favre/luc_favre.mp4', name: 'luc_favre.mp4', size: 3 * GB, to: '/SkyDock/Tandems/luc-favre', state: 'sending', part: 1 / 3 },
    { key: '/SkyDock/Tandems/luc-favre/photos/G0010003.JPG', name: 'G0010003.JPG', size: 5 * 1024 ** 2, to: '/SkyDock/Tandems/luc-favre/photos', state: 'there' }
  ]
}

const requests: { intent?: string }[] = []

/* an upload, and waiting for one, answer only when it ends — which in these tests it does not */
const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

const renderBoard = async (data: Record<string, unknown>) => {
  requests.length = 0
  /* the panel asks how the upload is going by the address the server answers on */
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) =>
    String(url instanceof Request ? url.url : url).includes('/api/upload-progress')
      ? Response.json(progress)
      : realFetch(url, init)
  )
  const Stub = createRoutesStub([
    boardRoute(() => data),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        const asked = (await request.json()) as { intent?: string }
        requests.push(asked)
        if (asked.intent === 'upload-montage' || asked.intent === 'upload-wait')
          return new Promise(() => {})
        if (asked.intent === 'cancel-upload') return { groups: board.groups, uploadCancelled: true }
        return { ok: true }
      }
    },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/upload-progress', loader: () => progress },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  const screen = await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('link', { name: /Luc Favre/ }).first())
  return screen
}

const panel = () => page.getByRole('complementary', { name: 'Uploading Luc Favre' })
const uploadButton = () => page.getByRole('button', { name: /^Upload/ }).first()

describe('an upload going', () => {
  test('is shown on the board with every item and where it has got to', async () => {
    await renderBoard({ ...board, uploading: going })

    await expect.element(panel()).toBeVisible()
    await expect.element(panel().getByText('luc_favre.full.zip')).toBeVisible()
    await expect.element(panel().getByRole('progressbar', { name: 'Sending luc_favre.mp4' })).toBeVisible()
    await expect.element(panel().getByText('already there')).toBeVisible()
    await page.screenshot({ path: './playwright-screenshots/upload-panel.png' })
  })

  test('opens out to show each item whole, where it goes and what became of it, and closes again', async () => {
    await renderBoard({ ...board, uploading: going })
    await expect.element(panel()).toBeVisible()
    const small = panel().element().getBoundingClientRect().width
    /* small, the destination of each item is only in its tooltip */
    await expect.element(panel().getByText('/SkyDock/Tandems/luc-favre/luc_favre.mp4')).not.toBeInTheDocument()

    await userEvent.click(panel().getByRole('button', { name: 'Open it out to see more' }))

    await expect.element(panel().getByText('/SkyDock/Tandems/luc-favre/luc_favre.mp4')).toBeVisible()
    await expect.element(panel().getByText('already there', { exact: true }).first()).toBeVisible()
    await expect.element(panel().getByText('under way')).toBeVisible()
    expect(panel().element().getBoundingClientRect().width).toBeGreaterThan(small * 1.8)
    await page.screenshot({ path: './playwright-screenshots/upload-panel-opened.png' })

    await userEvent.click(panel().getByRole('button', { name: 'Make it small again' }))
    await expect.element(panel().getByText('under way')).not.toBeInTheDocument()
    expect(panel().element().getBoundingClientRect().width).toBeLessThan(small * 1.2)
  })

  test('taken up by a page that comes back to it: nothing is offered on top of it', async () => {
    await renderBoard({ ...board, uploading: going })

    await vi.waitFor(() => expect(requests).toContainEqual({ intent: 'upload-wait' }))
    await expect.element(uploadButton()).toBeDisabled()
    await expect.element(uploadButton()).toHaveTextContent('Uploading…')
  })

  test('stays going when another edit is made meanwhile', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard(board)
    await userEvent.click(page.getByRole('button', { name: 'Upload…', exact: true }))
    await userEvent.click(page.getByRole('button', { name: 'Upload', exact: true }))
    await expect.element(panel()).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: /Open in kdenlive/ }))
    await vi.waitFor(() => expect(requests.map((r) => r.intent)).toContain('open-montage'))

    await expect.element(panel()).toBeVisible()
    await expect.element(uploadButton()).toBeDisabled()
  })

  test('is cancelled from the panel, at any moment', async () => {
    await renderBoard({ ...board, uploading: going })
    await expect.element(panel()).toBeVisible()

    await userEvent.click(panel().getByRole('button', { name: 'Cancel' }))

    await vi.waitFor(() => expect(requests).toContainEqual({ intent: 'cancel-upload' }))
    await expect.element(panel()).not.toBeInTheDocument()
    await expect.element(page.getByText(/Upload cancelled — nothing was recorded/)).toBeVisible()
    await expect.element(uploadButton()).toBeEnabled()
  })
})
