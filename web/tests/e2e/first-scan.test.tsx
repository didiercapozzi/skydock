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

/* A work folder with no record yet is looked through at once, and shows only that it is being
   (RULES, The first time it is opened). */

const empty = {
  groups: [],
  looseFiles: [],
  destinations: [],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: false,
  processing: null,
  nas: { connected: false, hostname: null }
}

describe('a work folder with no record', () => {
  test('is scanned without being asked, and says only that it is scanning', async () => {
    const scans: unknown[] = []
    const Stub = createRoutesStub([
      boardRoute(() => empty),
      {
        path: '/api/scan',
        action: async ({ request }) => {
          scans.push(await request.json())
          return new Promise(() => undefined)
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(page.getByRole('status', { name: 'Scanning…' })).toBeVisible()
    await vi.waitFor(() => expect(scans).toHaveLength(1))
    /* a look through the folder alone: no camera is copied behind it */
    expect(JSON.stringify(scans[0])).toContain('"cameras":false')
    expect(document.body.textContent).not.toContain('Plug a camera in')
  })
})
