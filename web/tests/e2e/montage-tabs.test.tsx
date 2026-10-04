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
   storage — and its page shows the two side by side (RULES, A place is connected to its folder). */

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
      name: 'ana_roth_20260728.mp4',
      path: `${DIR}/ana-roth/ana_roth_20260728.mp4`,
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
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        asked.push(await request.json())
        return { ok: true }
      }
    },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/storage-folder', loader: () => onStorage },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  const nav = page.getByRole('navigation', { name: 'Folders' })
  /* a montage freed from this machine is done: its page is reached from Montages done */
  if ((data as { groups: { freed?: unknown }[] }).groups.some((g) => g.freed)) {
    await userEvent.click(nav.getByRole('link', { name: /Montages done/ }))
    await userEvent.click(page.getByRole('link', { name: 'Open' }))
  } else await userEvent.click(nav.getByRole('link', { name: /Ana Roth/ }))
}

const asked: Record<string, unknown>[] = []

const tabs = () => page.getByRole('group', { name: 'Where to look' })
const panel = () => page.getByRole('complementary', { name: 'Details' })

describe('an uploaded montage', () => {
  test('has no tabs, but a card for what is here and a card for what is on the storage', async () => {
    await open(board(group({}, [clip(1), clip(2)])))

    await expect.element(tabs()).not.toBeInTheDocument()
    await expect.element(page.getByRole('heading', { name: 'On this machine' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: 'On the storage' })).toBeVisible()
    await expect.element(page.getByText('Everything here is also on the storage.')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Free up space…' })).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.mp4')).toBeVisible()
    /* the files kept here are not listed again */
    await expect.element(page.getByText('GX01.MP4')).not.toBeInTheDocument()
  })

  /* freed from this machine, nothing is left here: the page says what is left, on the storage */
  test('shows what is left of it, only on the storage, once it is freed', async () => {
    const freed = [clip(1), clip(2)].map((f) => ({ ...f, freed: true }))
    await open(board(group({ freed: { at: 1_785_100_000, bytes: 2 * GB } }, freed)))

    await expect.element(page.getByText('Stored', { exact: true })).toBeVisible()
    await expect.element(page.getByText('This machine', { exact: true })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: 'Only on the storage now' })).toBeVisible()
    await expect.element(page.getByText(`${DIR}/ana-roth`, { exact: true })).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.mp4')).toBeVisible()
  })

  /* the montage's link is in the panel, and can be taken away from there */
  test('can take the link away from the panel', async () => {
    asked.length = 0
    await open(board(group({}, [clip(1)])))

    await expect.element(panel().getByText('…/sharing/Ana')).toBeVisible()
    await userEvent.click(panel().getByRole('button', { name: 'Remove link', exact: true }))
    await vi.waitFor(() => expect(JSON.stringify(asked)).toContain('montage-link'))
  })

  /* once its link is gone, the panel makes a new one */
  test('offers to create the link again once it has none', async () => {
    asked.length = 0
    await open(board(group({ uploaded: { ...uploaded, shareUrl: undefined } }, [clip(1)])))

    await expect.element(panel().getByText('No link')).toBeVisible()
    await userEvent.click(panel().getByRole('button', { name: 'Create link', exact: true }))
    await vi.waitFor(() => expect(JSON.stringify(asked)).toContain('"make":true'))
  })

  /* the folder cards have a Watch button on a video, and no link of their own */
  test('has a watch button on the items of the cards, and no link buttons there', async () => {
    await open(board(group({}, [clip(1)])))

    await expect.element(page.getByRole('button', { name: 'Watch' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Create a link' })).not.toBeInTheDocument()
  })

  test('says in the panel where the film went', async () => {
    await open(board(group({}, [clip(1)])))

    await expect.element(panel().getByText('Delivery')).toBeVisible()
    await expect.element(panel().getByText('Film', { exact: true })).toBeVisible()
    await expect.element(panel().getByText('Passengers').first()).toBeVisible()
  })

  /* a montage's files are headed and listed in one card, before it is uploaded */
  test('lists its files in one card under its own heading before it is uploaded', async () => {
    await open(board(group({ uploaded: undefined }, [clip(1), clip(2)])))

    await expect.element(page.getByRole('heading', { name: 'Its files' })).toBeVisible()
    await expect.element(page.getByText('GX01.MP4').first()).toBeVisible()
    await expect.element(page.getByText('GX02.MP4').first()).toBeVisible()
    await expect.element(page.getByText('Open on its own')).not.toBeInTheDocument()
  })

  /* a montage is shown by its jump only, and its ways back are in the panel at the right */
  test('has no grouping choice, and Reset and Delete in the panel', async () => {
    await open(board(group({ uploaded: undefined }, [clip(1)])))

    await expect.element(page.getByRole('group', { name: 'Group' })).not.toBeInTheDocument()
    await expect.element(panel().getByRole('button', { name: 'Reset…' })).toBeVisible()
    await expect.element(panel().getByRole('button', { name: 'Delete montage…' })).toBeVisible()
    expect(page.getByRole('button', { name: 'Reset…' }).elements()).toHaveLength(1)
  })

  test('has no tabs before it is uploaded', async () => {
    await open(board(group({ uploaded: undefined }, [clip(1)])))

    await expect.element(tabs()).not.toBeInTheDocument()
  })
})
