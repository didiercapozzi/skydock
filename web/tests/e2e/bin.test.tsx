import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { createRoutesStub } from 'react-router'
import { BinFiles } from '../../app/components/bin-files'
import { boardRoute } from './board-route'

/* The bin, looked through from the board (RULES, Putting files in the bin): what was put aside, by
   when and from where, and a way to bring files back to Fresh files — never a way to delete them.
   The server is stubbed; the page is clicked the way a person clicks it. */

const BIN = '/workspace/output/.trash'
const inBin = (folder: string, name: string) => ({
  path: `${BIN}/${folder}/${name}`,
  name,
  size: 2_000_000,
  mtime: 1_785_000_000
})

const listing = {
  dir: BIN,
  batches: [
    {
      folder: 'camera-OsmoNano-2026-09-24T12-30-05-123Z',
      from: 'camera',
      camera: 'OsmoNano',
      at: 1_790_000_000,
      files: [inBin('camera-OsmoNano-2026-09-24T12-30-05-123Z', 'DJI_0001.MP4')]
    },
    {
      folder: 'unsorted-2026-09-20T09-00-00-000Z',
      from: 'fresh',
      at: 1_789_000_000,
      files: [
        inBin('unsorted-2026-09-20T09-00-00-000Z', 'GX010001.MP4'),
        inBin('unsorted-2026-09-20T09-00-00-000Z', 'GOPR0002.JPG')
      ]
    }
  ]
}

const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

const shown = async () => {
  vi.stubGlobal('fetch', async () => Response.json(listing))
  const onBringBack = vi.fn()
  await render(createElement(BinFiles, { stamp: 1, bringing: false, onBringBack }))
  return { onBringBack }
}

describe('the bin', () => {
  test('shows what was put aside, by when and from where', async () => {
    await shown()

    await expect.element(page.getByRole('heading', { name: /^Deleted from the camera OsmoNano/ })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: /^Put in the bin from Fresh files/ })).toBeVisible()
    await expect.element(page.getByText('GX010001.MP4')).toBeVisible()
    await expect.element(page.getByText('3 files', { exact: false })).toBeVisible()
  })

  test('brings the files picked back to Fresh files', async () => {
    const { onBringBack } = await shown()

    await userEvent.click(page.getByRole('button', { name: 'Pick GX010001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Bring 2 files back to Fresh files' }))

    expect(onBringBack).toHaveBeenCalledWith([
      `${BIN}/camera-OsmoNano-2026-09-24T12-30-05-123Z/DJI_0001.MP4`,
      `${BIN}/unsorted-2026-09-20T09-00-00-000Z/GX010001.MP4`
    ])
  })

  /* the bin is emptied by hand, from the machine's own folders, or not at all */
  test('offers no way to delete anything, and says where to empty it by hand', async () => {
    await shown()

    await expect.element(page.getByText('GX010001.MP4')).toBeVisible()
    expect(page.getByRole('button', { name: /delete|empty|remove/i }).elements()).toHaveLength(0)
    await expect.element(page.getByText(/SkyDock never empties the bin/)).toBeVisible()
    await expect.element(page.getByText(BIN, { exact: true })).toBeVisible()
  })

  test('says so when it is empty', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ dir: BIN, batches: [] }))
    await render(createElement(BinFiles, { stamp: 1, bringing: false, onBringBack: () => {} }))

    await expect.element(page.getByText('The bin is empty.')).toBeVisible()
  })
})

/* Brought back, a file is no longer in the bin, and the page says so without being asked again. */
describe('the bin, on the board', () => {
  test('no longer lists the files brought back, from the moment they are asked for', async () => {
    let brought = false
    let scanDone = () => {}
    const scanned = new Promise<void>((done) => {
      scanDone = done
    })
    vi.stubGlobal('fetch', async () =>
      Response.json(brought ? { ...listing, batches: [listing.batches[0]] } : listing)
    )
    const board = {
      groups: [],
      looseFiles: [],
      destinations: [],
      outputs: {},
      proxies: {},
      montages: {},
      remote: null,
      storage: null,
      hasManifest: true,
      processing: null,
      nas: { connected: false, hostname: null, backupFolder: null }
    }
    const Stub = createRoutesStub([
      boardRoute(() => board),
      {
        path: '/api/manifest',
        /* bringing back moves the files and scans, which takes a moment on a full disk */
        action: async () => {
          await scanned
          brought = true
          return { groups: [], fromBin: { back: 2, kept: [] } }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/bin'] }))

    await userEvent.click(page.getByRole('button', { name: 'Pick GX010001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Pick GOPR0002.JPG' }))
    await userEvent.click(page.getByRole('button', { name: 'Bring 2 files back to Fresh files' }))

    /* at once, while the board is still at it */
    await expect.element(page.getByText('GX010001.MP4')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Bringing back…' })).toBeDisabled()

    scanDone()
    await expect.element(page.getByRole('button', { name: 'Bring back to Fresh files' })).toBeVisible()
    await expect.element(page.getByText('GX010001.MP4')).not.toBeInTheDocument()
    await expect.element(page.getByText('DJI_0001.MP4')).toBeVisible()
  })
})
