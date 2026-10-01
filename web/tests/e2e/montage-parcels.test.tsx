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

/* A montage as it was handed over — each folder up there, what is in it, how big, the link, and what
   is inside each zip — shown for one this board holds and, from the storage's own list, for one
   freed from this machine or made on another (RULES, Uploading a montage). */

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

const ana = {
  folder: `${DIR}/ana-roth`,
  firstname: 'Ana',
  lastname: 'Roth',
  day: '28.07.2026',
  videos: 12,
  photos: 40,
  uploadedAt: 1_785_000_000,
  shareUrl: LINK,
  freedAt: 1_785_100_000,
  items: [
    { name: 'ana_roth_20260728.mp4', dir: `${DIR}/ana-roth`, size: 3 * GB, holds: ['film'], zip: false },
    {
      name: 'ana_roth_20260728.backup.full.zip',
      dir: '/Backup/ana-roth',
      size: 16 * GB,
      holds: ['videos', 'photos', 'project'],
      zip: true
    }
  ]
}

const base = {
  groups: [],
  looseFiles: [],
  destinations: [{ name: 'Passengers', path: DIR }],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  hasManifest: true,
  processing: null,
  nas: { connected: true, hostname: 'nas.local', backupFolder: '/Backup' },
  storage: { dir: DIR, problem: null, lost: { folders: [], links: [] }, montages: [ana] }
}

const openStorage = async (data: Record<string, unknown>) => {
  const Stub = createRoutesStub([
    boardRoute(() => data),
    { path: '/api/manifest', action: async () => ({ ok: true }) },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/storage-folder', loader: () => ({ ok: false, reason: 'test' }) },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(
    page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /On the storage/ })
  )
}

describe('a montage only the storage has', () => {
  test('shows how it was handed over when its contents are opened', async () => {
    await openStorage(base)
    await expect.element(page.getByText('storage only', { exact: true })).toBeInTheDocument()
    await expect.element(page.getByText('To hand over')).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Contents' }))

    await expect.element(page.getByText('To hand over')).toBeVisible()
    await expect.element(page.getByText('ready to hand over')).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.mp4')).toBeVisible()
    await expect.element(page.getByText('3.0 GB')).toBeVisible()
    await expect.element(page.getByText(LINK, { exact: true })).toBeVisible()
    await expect.element(page.getByText('/Backup/ana-roth')).toBeVisible()
    await expect.element(page.getByText('never shared')).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.backup.full.zip')).toBeVisible()
    await page.screenshot({ path: './playwright-screenshots/montage-parcels.png' })
  })

  /* what is up there is looked for in the storage's own web interface: each file, and each folder, is
     a link that opens File Station on the folder, in a new tab */
  test('links each file and folder to the storage’s own web interface', async () => {
    await openStorage(base)
    await userEvent.click(page.getByRole('button', { name: 'Contents' }))

    const film = page.getByRole('link', { name: /ana_roth_20260728\.mp4/ })
    await expect.element(film).toBeVisible()
    const link = film.element()
    expect(link.getAttribute('target')).toBe('_blank')
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('https://nas.local/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance')).toBe(true)
    expect(decodeURIComponent(decodeURIComponent(href.split('launchParam=')[1] ?? ''))).toBe(
      `openfile=${DIR}/ana-roth`
    )
  })

  /* what the upload handed over and the storage no longer holds is said so, and has nothing to open */
  test('says an item is no longer on the storage once its folder no longer lists it', async () => {
    const held = {
      ...base,
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '28.07.2026',
          montageJump: true,
          passenger: { firstname: 'Ana', lastname: 'Roth' },
          processed: true,
          files: [clip(1)],
          uploaded: {
            at: 1_785_000_000,
            sent: [
              { name: 'ana_roth_20260728.mp4', holds: ['film'], to: [`${DIR}/ana-roth`], size: 3 * GB },
              { name: 'ana_roth_20260728.project.zip', holds: ['project'], to: [`${DIR}/ana-roth`], size: GB, zip: true, contents: ['x.kdenlive'] }
            ]
          }
        }
      ],
      remote: {
        ok: true,
        dirs: [`${DIR}/ana-roth`],
        sizes: { [`${DIR}/ana-roth/ana_roth_20260728.mp4`]: 3 * GB },
        at: 1_785_000_100
      }
    }
    const Stub = createRoutesStub([
      boardRoute(() => held),
      { path: '/api/manifest', action: async () => ({ ok: true }) },
      { path: '/api/nas', action: async () => ({ ok: true }) },
      { path: '/api/storage-folder', loader: () => ({ ok: false, reason: 'test' }) },
      { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Ana Roth/ })
    )

    await expect.element(page.getByText('ana_roth_20260728.project.zip')).toBeVisible()
    await expect.element(page.getByText('no longer on the storage')).toBeVisible()
    /* it is still there to read, but is no link into the storage's interface */
    expect(
      page.getByText('ana_roth_20260728.project.zip').element().closest('a')?.hasAttribute('href')
    ).toBe(false)
    await expect.element(page.getByRole('link', { name: /ana_roth_20260728\.mp4/ })).toBeVisible()
  })

  test('opens its contents when its row is pressed, and closes them when pressed again', async () => {
    await openStorage(base)

    await userEvent.click(page.getByText('Ana Roth'))
    await expect.element(page.getByText('To hand over')).toBeVisible()

    await userEvent.click(page.getByText('Ana Roth'))
    await expect.element(page.getByText('To hand over')).not.toBeInTheDocument()
  })

  test('says what is inside a zip', async () => {
    await openStorage(base)
    await userEvent.click(page.getByRole('button', { name: 'Contents' }))

    await expect.element(page.getByText('Inside')).toBeVisible()
    await expect.element(page.getByText('videos/', { exact: true })).toBeVisible()
    await expect.element(page.getByText('12 clips')).toBeVisible()
    await expect.element(page.getByText('photos/', { exact: true })).toBeVisible()
    await expect.element(page.getByText('40 photos')).toBeVisible()
    await expect.element(page.getByText('the kdenlive project')).toBeVisible()
  })

  test('closes its contents again', async () => {
    await openStorage(base)
    await userEvent.click(page.getByRole('button', { name: 'Contents' }))
    await expect.element(page.getByText('To hand over')).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Hide contents' }))

    await expect.element(page.getByText('To hand over')).not.toBeInTheDocument()
  })

  test('still says what it can of one listed before its items were kept', async () => {
    const { items: _items, ...older } = ana
    await openStorage({
      ...base,
      storage: {
        ...base.storage,
        montages: [
          {
            ...older,
            film: `${DIR}/ana-roth/ana.mp4`,
            photosZip: `${DIR}/ana-roth/ana.photos.zip`,
            backup: '/Backup/ana-roth/ana.rushes.zip'
          }
        ]
      }
    })

    await userEvent.click(page.getByRole('button', { name: 'Contents' }))

    await expect.element(page.getByText('ana.mp4')).toBeVisible()
    await expect.element(page.getByText('ana.photos.zip')).toBeVisible()
    await expect.element(page.getByText('ana.rushes.zip')).toBeVisible()
    await expect.element(page.getByText('40 photos')).toBeVisible()
  })
})

describe('a freed montage this board still holds', () => {
  const held = {
    ...base,
    groups: [
      {
        id: 'g1',
        label: 'jump',
        day: '28.07.2026',
        montageJump: true,
        passenger: { firstname: 'Ana', lastname: 'Roth' },
        processed: true,
        freed: { at: 1_785_100_000, bytes: 16 * GB },
        files: [clip(1), clip(2)].map((f) => ({ ...f, freed: true })),
        uploaded: {
          at: 1_785_000_000,
          shareUrl: LINK,
          sent: [
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
        }
      }
    ],
    storage: { ...base.storage, montages: [{ ...ana, folder: `${DIR}/ana-roth` }] }
  }

  /* its own page, where the montage is worked on, draws the same cards as before it was freed */
  test('shows the same cards on its own page, with what is inside each zip', async () => {
    const Stub = createRoutesStub([
      boardRoute(() => held),
      { path: '/api/manifest', action: async () => ({ ok: true }) },
      { path: '/api/nas', action: async () => ({ ok: true }) },
      { path: '/api/storage-folder', loader: () => ({ ok: false, reason: 'test' }) },
      { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Ana Roth/ })
    )

    await expect.element(page.getByText('To hand over')).toBeVisible()
    await expect.element(page.getByText('ana_roth_20260728.videos.zip')).toBeVisible()
    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await expect.element(page.getByText(LINK, { exact: true })).toBeVisible()
  })

  test('lists what its upload recorded, with the names inside each zip', async () => {
    await openStorage(held)

    await userEvent.click(page.getByRole('button', { name: 'Contents' }))

    await expect.element(page.getByText('ana_roth_20260728.videos.zip')).toBeVisible()
    await expect.element(page.getByText('GX01.MP4')).toBeVisible()
    await expect.element(page.getByText('GX02.MP4')).toBeVisible()
    await expect.element(page.getByText('2 clips')).toBeVisible()
  })
})
