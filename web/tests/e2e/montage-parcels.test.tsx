import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'


const DIR = '/SkyDock/Passengers'
const GB = 1024 ** 3
const LINK = 'https://nas.local/sharing/Ana'

const clip = (n: number) => ({
  id: `v${n}`,
  path: `/workspace/output/original_files/2026-07-28/GX0${n}.MP4`,
  filename: `GX0${n}.MP4`,
  size: GB,
  mtime: 1_785_000_000 + n
})

const sent = [
  { name: 'ana_roth_20260728.mp4', holds: ['film'], to: [`${DIR}/ana-roth`], size: 3 * GB },
  {
    name: 'ana_roth_20260728.videos.zip',
    holds: ['videos'],
    to: ['/Backup/ana-roth'],
    size: 2 * GB,
    zip: true,
    contents: ['videos/GX01.MP4', 'videos/GX02.MP4']
  }
]

const montage = (extra: Record<string, unknown> = {}) => ({
  groups: [
    {
      id: 'g1',
      label: 'jump',
      day: '28.07.2026',
      montageJump: true,
      passenger: { firstname: 'Ana', lastname: 'Roth' },
      processed: true,
      files: [clip(1), clip(2)],
      uploaded: { at: 1_785_000_000, shareUrl: LINK, sent },
      ...extra
    }
  ],
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

const freed = montage({
  freed: { at: 1_785_100_000, bytes: 16 * GB },
  files: [clip(1), clip(2)].map((f) => ({ ...f, freed: true }))
})

const board = async (data: Record<string, unknown>) => {
  const Stub = createRoutesStub([
    boardRoute(() => data),
    { path: '/api/manifest', action: async () => ({ ok: true }) },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/storage-folder', loader: () => ({ ok: false, reason: 'test' }) },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const open = async (data: Record<string, unknown>) => {
  await board(data)
  const nav = page.getByRole('navigation', { name: 'Folders' })
  const done = (data.groups as { freed?: unknown }[]).some((g) => g.freed)
  if (done) {
    await userEvent.click(nav.getByRole('link', { name: /Montages done/ }))
    await userEvent.click(page.getByRole('link', { name: 'Open' }))
  } else await userEvent.click(nav.getByRole('link', { name: /Ana Roth/ }))
}

const openInsides = async () => {
  const closed = page.getByTitle('Show what is inside')
  await expect.element(closed.first()).toBeVisible()
  for (const row of closed.elements()) await userEvent.click(row)
}

describe('a montage as it was handed over', () => {
  test('has a card per folder it went to, with its path, what is in it, and the link', async () => {
    await open(freed)

    await expect.element(page.getByText(`${DIR}/ana-roth`, { exact: true })).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.mp4')).toBeVisible()
    await expect.element(page.getByText('3.0 GB')).toBeVisible()
    await expect.element(page.getByText('…/Ana')).toBeVisible()
    await expect.element(page.getByText('/Backup/ana-roth', { exact: true })).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.videos.zip')).toBeVisible()
    await page.screenshot({ path: './playwright-screenshots/montage-parcels.png' })
  })

  test('links a file to the storage’s own web interface', async () => {
    await open(freed)

    const film = page.getByRole('link', { name: /ana_roth_20260728\.mp4/ })
    await expect.element(film).toBeVisible()
    const link = film.element()
    expect(link.getAttribute('target')).toBe('_blank')
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('https://nas.local/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance')).toBe(true)
    expect(decodeURIComponent(decodeURIComponent(href.split('launchParam=')[1] ?? ''))).toBe(
      `openfile=${DIR}/ana-roth/ana_roth_20260728.mp4`
    )
  })

  test('keeps a zip closed until its row is pressed, and closes it again when pressed again', async () => {
    await open(freed)

    await expect.element(page.getByText('videos/', { exact: true })).not.toBeInTheDocument()
    await openInsides()
    await expect.element(page.getByText('Inside').first()).toBeVisible()
    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await userEvent.click(page.getByTitle('Close what is inside').first())
    await expect.element(page.getByText('GX01.MP4')).not.toBeInTheDocument()
  })

  test('says what is inside a zip', async () => {
    await open(freed)

    await openInsides()
    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await expect.element(page.getByText('GX02.MP4')).toBeVisible()
    await expect.element(page.getByText('2 clips')).toBeVisible()
  })

  test('says an item is no longer on the storage once its folder no longer lists it', async () => {
    const held = {
      ...montage({
        uploaded: {
          at: 1_785_000_000,
          sent: [
            sent[0],
            { name: 'ana_roth_20260728.project.zip', holds: ['project'], to: [`${DIR}/ana-roth`], size: GB, zip: true, contents: ['x.kdenlive'] }
          ]
        }
      }),
      remote: {
        ok: true,
        dirs: [`${DIR}/ana-roth`],
        sizes: { [`${DIR}/ana-roth/ana_roth_20260728.mp4`]: 3 * GB },
        at: 1_785_000_100
      }
    }
    await open(held)

    await expect.element(page.getByText('ana_roth_20260728.project.zip')).toBeInTheDocument()
    await expect.element(page.getByText('no longer on the storage')).toBeVisible()
    expect(
      page.getByText('ana_roth_20260728.project.zip').element().closest('a')?.hasAttribute('href')
    ).toBe(false)
    await expect.element(page.getByRole('link', { name: /ana_roth_20260728\.mp4/ })).toBeVisible()
  })
})

describe('montages done', () => {
  test('lists a freed montage, and opens its storage cards under the row', async () => {
    await board(freed)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Montages done/ })
    )

    await expect.element(page.getByText('Ana Roth')).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.mp4')).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Storage' }))

    await expect.element(page.getByText('ana_roth_20260728.mp4')).toBeVisible()
    await expect.element(page.getByText('/Backup/ana-roth')).toBeVisible()
    await expect
      .element(page.getByText('On this machine: nothing — everything is on the storage.'))
      .toBeVisible()
  })

  test('leaves a montage that is not freed among the montages', async () => {
    await board(montage())

    await expect.element(page.getByRole('link', { name: /Montages done/ })).not.toBeInTheDocument()
  })
})
