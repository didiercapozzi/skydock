import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* The header warns when the disk the work is on runs out of room (RULES, The board): nothing while
   there is plenty, almost full with how much is left, and full with what will fail. */

const GB = 1024 ** 3

const boardWith = (disk: { free: number; total: number; level: 'ok' | 'low' | 'full' }) => ({
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
  nas: { connected: false, hostname: null, backupFolder: null },
  disk
})

const renderWith = async (disk: Parameters<typeof boardWith>[0]) => {
  const Stub = createRoutesStub([boardRoute(() => boardWith(disk))])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await expect.element(page.getByText('Dock')).toBeInTheDocument()
}

describe('the disk running out of room', () => {
  test('says nothing while there is plenty', async () => {
    await renderWith({ free: 50 * GB, total: 250 * GB, level: 'ok' })
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  test('says the disk is almost full, and how much is left', async () => {
    await renderWith({ free: 3 * GB, total: 250 * GB, level: 'low' })
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('Disk almost full — 3.0 GB left')
  })

  test('says the disk is full, and what will fail', async () => {
    await renderWith({ free: 0, total: 250 * GB, level: 'full' })
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('Disk full')
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('copying, proxies and saving will fail')
  })
})
