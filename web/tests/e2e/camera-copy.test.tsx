import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Board from '../../app/routes/board'
import { boardRoute } from './board-route'

/* A camera plugged in is copied off by itself, and the board shows it happening, file by file, then
   looks again and says what came off. The machine is stood in for by the stream it speaks on. */

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

/* the card's files, once said */
let card: Array<{ name: string; size: number }> = []
let stream: { onmessage: ((message: { data: string }) => void) | null } | null = null
const silent = globalThis.EventSource
/* What the machine says of a card being copied: one task, every file on it a row — the ones passed over
   first, then the ones copied, then the one under way with how far its bytes have got. */
const says = ({
  camera,
  state,
  done,
  total,
  copied,
  skipped,
  files,
  part,
  reason
}: {
  camera: string
  state: 'copying' | 'done' | 'gone'
  done: number
  total: number
  copied: number
  skipped: number
  files?: Array<{ name: string; size: number }>
  part?: number
  reason?: string
}) => {
  if (files) card = files
  const rows = Array.from({ length: total }, (_, at) => ({
    key: String(at),
    name: card[at]?.name ?? `GX${String(at).padStart(6, '0')}.MP4`,
    size: card[at]?.size ?? 1_000_000,
    ...(at < skipped
      ? { at: 'skipped' as const }
      : at < skipped + copied
        ? { at: 'done' as const }
        : at === done
          ? { at: 'now' as const, part: part ?? 0 }
          : { at: 'later' as const })
  }))
  stream?.onmessage?.({
    data: JSON.stringify({
      kind: 'job',
      id: 'camera',
      type: 'camera-copy',
      label: camera,
      stage: 'working',
      done,
      total,
      rows,
      ...(state === 'copying'
        ? {}
        : { outcome: { state, copied, skipped }, ...(reason ? { reason } : {}) })
    })
  })
}

const requests: unknown[] = []
let onBoard: unknown[] = []

const renderBoard = async () => {
  requests.length = 0
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: ((message: { data: string }) => void) | null = null
      close = () => {}
      constructor() {
        stream = this
      }
    }
  )
  const Stub = createRoutesStub([
    boardRoute(() => board),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        const asked = await request.json()
        requests.push(asked)
        /* the board as the machine has it now: what landed so far is loose in Fresh files */
        if (asked.intent === 'imported') return { groups: [], looseFiles: onBoard }
        return { groups: [], cameraCopied: asked.cameraCopied }
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

afterEach(() => {
  vi.stubGlobal('EventSource', silent)
  onBoard = []
})

describe('a camera plugged in', () => {
  /* in the corner, the way files dropped in and an upload going out are shown (RULES, Copying a
     camera off) */
  test('shows its copy in the corner as it goes, every file on the card', async () => {
    await renderBoard()
    const card = ['GX010001.MP4', 'GX010002.MP4', 'GX010003.MP4', 'GX010004.MP4'].map((name) => ({
      name,
      size: 1_000_000
    }))

    says({ camera: 'GOPRO', state: 'copying', done: 0, total: 4, copied: 0, skipped: 0, files: card })
    says({ camera: 'GOPRO', state: 'copying', done: 1, total: 4, copied: 0, skipped: 1 })
    says({ camera: 'GOPRO', state: 'copying', done: 2, total: 4, copied: 1, skipped: 1 })

    const panel = page.getByRole('complementary', { name: 'Copying GOPRO' })
    await expect.element(panel.getByRole('progressbar', { name: 'Copied off GOPRO' })).toHaveAttribute('aria-valuenow', '50')
    await expect.element(panel.getByText('GX010003.MP4')).toBeVisible()
    await expect.element(panel.getByText('already here', { exact: true })).toBeVisible()
    await expect.element(panel.getByRole('progressbar', { name: 'Copying GX010003.MP4' })).toBeVisible()
  })

  /* folded down to its title and how many, and opened again */
  test('folds down to its title and its count, and opens again', async () => {
    await renderBoard()
    const card = ['GX010001.MP4', 'GX010002.MP4'].map((name) => ({ name, size: 1_000_000 }))
    says({ camera: 'GOPRO', state: 'copying', done: 0, total: 2, copied: 0, skipped: 0, files: card })
    says({ camera: 'GOPRO', state: 'copying', done: 1, total: 2, copied: 1, skipped: 0 })
    const panel = page.getByRole('complementary', { name: 'Copying GOPRO' })

    await userEvent.click(panel.getByRole('button', { name: 'Hide the list' }))

    await expect.element(panel.getByText('Copying the camera GOPRO')).toBeVisible()
    await expect.element(panel.getByText('2/2')).toBeVisible()
    await expect.element(panel.getByText('GX010001.MP4')).not.toBeInTheDocument()

    await userEvent.click(panel.getByRole('button', { name: 'Show the list' }))

    await expect.element(panel.getByText('GX010001.MP4')).toBeVisible()
  })

  /* a long clip is watched filling, not waited out */
  test('fills the bar of the file being copied as its bytes land', async () => {
    await renderBoard()
    const card = ['GX010001.MP4', 'GX010002.MP4'].map((name) => ({ name, size: 4_000_000_000 }))
    says({ camera: 'GOPRO', state: 'copying', done: 0, total: 2, copied: 0, skipped: 0, files: card })

    says({ camera: 'GOPRO', state: 'copying', done: 0, total: 2, copied: 0, skipped: 0, part: 0.4 })

    const panel = page.getByRole('complementary', { name: 'Copying GOPRO' })
    await expect.element(panel.getByRole('progressbar', { name: 'Copying GX010001.MP4' })).toHaveAttribute('aria-valuenow', '40')
    await expect.element(panel.getByRole('progressbar', { name: 'Copied off GOPRO' })).toHaveAttribute('aria-valuenow', '20')
  })

  /* each file is on the board as it lands, not once the whole card is done */
  test('shows each file in Fresh files as soon as it is copied', async () => {
    onBoard = [
      { id: 'c1', path: '/o/GX010001.MP4', filename: 'GX010001.MP4', size: 1, mtime: 1_785_000_000 }
    ]
    await renderBoard()
    const card = ['GX010001.MP4', 'GX010002.MP4'].map((name) => ({ name, size: 1_000_000 }))
    says({ camera: 'GOPRO', state: 'copying', done: 0, total: 2, copied: 0, skipped: 0, files: card })

    says({ camera: 'GOPRO', state: 'copying', done: 1, total: 2, copied: 1, skipped: 0 })

    await vi.waitFor(() => expect(requests).toContainEqual({ intent: 'imported' }))
    await userEvent.click(page.getByRole('button', { name: /^Loose files/ }))
    await expect.element(page.getByRole('region', { name: 'Loose files' })).toBeInTheDocument()
  })

  /* A camera plugged in again goes through every file on it, and a file already here costs a look and
     not a copy — said as it goes, so looking over a card is never taken for copying all of it again. */
  test('says how many are new and how many were here already', async () => {
    await renderBoard()

    says({ camera: 'HERO5 Black', state: 'copying', done: 120, total: 300, copied: 2, skipped: 118 })

    await expect
      .element(page.getByRole('complementary', { name: 'Copying HERO5 Black' }).getByText(/2 new files copied · 118 already here/))
      .toBeVisible()
  })

  test('once copied, the board looks again and says what came off', async () => {
    await renderBoard()
    says({ camera: 'GOPRO', state: 'copying', done: 39, total: 40, copied: 30, skipped: 9 })

    says({ camera: 'GOPRO', state: 'done', done: 40, total: 40, copied: 31, skipped: 9 })

    await expect.element(page.getByRole('complementary', { name: 'Copying GOPRO' })).not.toBeInTheDocument()
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'camera-copied',
        cameraCopied: { camera: 'GOPRO', state: 'done', copied: 31, skipped: 9 }
      })
    )
    await expect
      .element(page.getByText('Camera GOPRO: 31 new files copied · 9 already here, and scanned'))
      .toBeInTheDocument()
  })

  test('says so when it was unplugged half way', async () => {
    await renderBoard()

    says({
      camera: 'GOPRO',
      state: 'gone',
      done: 5,
      total: 40,
      copied: 5,
      skipped: 0,
      reason: 'The camera was disconnected during the copy.'
    })

    await expect
      .element(page.getByText(/GOPRO was unplugged during the copy — 5 new files copied; plug it in again/))
      .toBeInTheDocument()
  })
})
