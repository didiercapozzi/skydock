import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* A montage that has been uploaded is in two places — the files kept here, and its folder on the
   storage — and a tab switches between them (RULES, A place is connected to its folder). */

const DIR = '/SkyDock/Passengers'
const GB = 1024 ** 3

const clip = (n: number) => ({
  id: `v${n}`,
  path: `/workspace/output/original_files/2026-07-28/GX0${n}.MP4`,
  filename: `GX0${n}.MP4`,
  size: GB,
  mtime: 1_785_000_000 + n
})

const uploaded = {
  at: 1_785_000_000,
  shareUrl: 'https://nas.local/sharing/Ana',
  sent: [{ name: 'ana_roth_20260728.mp4', holds: ['film'], to: [`${DIR}/ana-roth`], size: 3 * GB }]
}

const group = (extra: Record<string, unknown>, files: unknown[]) => ({
  id: 'g1',
  label: 'jump',
  day: '28.07.2026',
  montageJump: true,
  passenger: { firstname: 'Ana', lastname: 'Roth' },
  processed: true,
  uploaded,
  files,
  ...extra
})

const board = (g: unknown) => ({
  groups: [g],
  looseFiles: [],
  destinations: [{ name: 'Passengers', path: DIR }],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  hasManifest: true,
  processing: null,
  nas: { connected: true, hostname: 'nas.local', backupFolder: '/Backup' },
  storage: { dir: DIR, problem: null, lost: { folders: [], links: [] }, montages: [] }
})

const onStorage = {
  ok: true,
  dir: `${DIR}/ana-roth`,
  files: [
    {
      name: 'ana on the storage.mp4',
      path: `${DIR}/ana-roth/ana on the storage.mp4`,
      size: 3 * GB,
      mtime: 1_785_000_000,
      kind: 'video',
      shot: null,
      shareUrl: null
    }
  ]
}

afterEach(() => vi.unstubAllGlobals())

/* the storage answers for its folder; the page asks it over the network, so the network is stood in for */
const open = async (data: unknown) => {
  const realFetch = window.fetch.bind(window)
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) =>
    String(url).includes('/api/storage-folder')
      ? new Response(JSON.stringify(onStorage), { headers: { 'Content-Type': 'application/json' } })
      : realFetch(url, init)
  )
  const Stub = createRoutesStub([
    boardRoute(() => data),
    { path: '/api/manifest', action: async () => ({ ok: true }) },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/storage-folder', loader: () => onStorage },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(
    page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Ana Roth/ })
  )
}

const tabs = () => page.getByRole('group', { name: 'Where to look' })

describe('an uploaded montage', () => {
  test('has a tab for what is here and a tab for what is on the storage', async () => {
    await open(board(group({}, [clip(1), clip(2)])))

    await expect.element(tabs().getByRole('button', { name: 'Local' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByText('GX01.MP4').first()).toBeVisible()
    await expect.element(page.getByText('ana on the storage.mp4')).not.toBeInTheDocument()

    await userEvent.click(tabs().getByRole('button', { name: 'On the storage' }))

    await expect.element(page.getByText('ana on the storage.mp4').first()).toBeVisible()
    await expect.element(page.getByText('GX01.MP4')).not.toBeInTheDocument()

    await userEvent.click(tabs().getByRole('button', { name: 'Local' }))
    await expect.element(page.getByText('GX01.MP4').first()).toBeVisible()
  })

  /* freed from this machine, it still opens on what is here: how it was handed over */
  test('opens on what is here even when nothing is left of it', async () => {
    const freed = [clip(1), clip(2)].map((f) => ({ ...f, freed: true }))
    await open(board(group({ freed: { at: 1_785_100_000, bytes: 2 * GB } }, freed)))

    await expect.element(tabs().getByRole('button', { name: 'Local' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByText('ana on the storage.mp4')).not.toBeInTheDocument()
  })

  test('has no tabs before it is uploaded', async () => {
    await open(board(group({ uploaded: undefined }, [clip(1)])))

    await expect.element(tabs()).not.toBeInTheDocument()
  })
})
