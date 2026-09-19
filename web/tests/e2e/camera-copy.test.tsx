import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Board from '../../app/routes/board'

/* A camera plugged in is copied off by itself, and the board shows it happening, file by file, then
   looks again and says what came off. The machine is stood in for by the stream it speaks on. */

const board = {
  groups: [],
  looseFiles: [],
  destinations: [],
  outputs: {},
  proxies: {},
  tandems: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
}

let stream: { onmessage: ((message: { data: string }) => void) | null } | null = null
const silent = globalThis.EventSource
const says = (event: Record<string, unknown>) =>
  stream?.onmessage?.({ data: JSON.stringify({ kind: 'camera', ...event }) })

const requests: unknown[] = []

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
    { path: '/', Component: Board, loader: () => board },
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        const asked = await request.json()
        requests.push(asked)
        return { groups: [], cameraCopied: asked.cameraCopied }
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

afterEach(() => {
  vi.stubGlobal('EventSource', silent)
})

describe('a camera plugged in', () => {
  test('shows its copy in the header as it goes', async () => {
    await renderBoard()

    says({ camera: 'GOPRO', state: 'copying', done: 12, total: 40, copied: 9, skipped: 3 })

    const bar = page.getByRole('progressbar', { name: 'Copying GOPRO' })
    await expect.element(bar).toHaveAttribute('aria-valuenow', '12')
    await expect.poll(() => bar.element().textContent).toContain('12/40')
  })

  test('once copied, the board looks again and says what came off', async () => {
    await renderBoard()
    says({ camera: 'GOPRO', state: 'copying', done: 39, total: 40, copied: 30, skipped: 9 })

    says({ camera: 'GOPRO', state: 'done', done: 40, total: 40, copied: 31, skipped: 9 })

    await expect.element(page.getByRole('progressbar', { name: 'Copying GOPRO' })).not.toBeInTheDocument()
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
