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

/* An edit just made is never shown reverted (RULES, The board follows its record): the answer to a request sent
   before it, which comes late, does not take the jumps back to what they were. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
const clip = (id: string) => ({ id, path: `/o/${id}.MP4`, filename: `${id}.MP4`, size: 1, mtime: AT })
const jump = (destination?: string) => ({
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  ...(destination ? { destination } : {}),
  files: [clip('luc'), clip('plane')]
})

const board = {
  groups: [jump()],
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

describe('a jump filed under a destination just made', () => {
  test('stays there when the answer to making the destination comes after it was filed', async () => {
    let release = () => {}
    const Stub = createRoutesStub([
      boardRoute(() => board),
      {
        path: '/api/manifest',
        action: async ({ request }: { request: Request }) => {
          const asked = (await request.json()) as { intent: string; destinations?: { name: string }[] }
          if (asked.intent === 'save-groups' && asked.destinations) {
            /* the server is busy: this one is answered late, with the jumps as they were before the filing */
            await new Promise<void>((done) => (release = done))
            return { groups: [jump()], looseFiles: [], destinations: asked.destinations }
          }
          return { groups: [jump('Yverdon')], looseFiles: [], destinations: [{ name: 'Yverdon' }] }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await userEvent.click(page.getByRole('button', { name: /Add a destination/ }))
    await userEvent.fill(page.getByPlaceholder('New destination'), 'Yverdon')
    await userEvent.click(page.getByRole('button', { name: 'Add', exact: true }))
    const yverdon = page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Yverdon/ })
    await expect.element(yverdon).toBeVisible()
    await userEvent.dragAndDrop(page.getByRole('button', { name: /^Jump 1, / }), yverdon)
    await expect.element(page.getByRole('heading', { level: 1, name: /^Yverdon/ })).toBeVisible()

    release()
    await new Promise((done) => setTimeout(done, 300))

    await expect.element(page.getByText('luc.MP4').first()).toBeVisible()
  })
})
