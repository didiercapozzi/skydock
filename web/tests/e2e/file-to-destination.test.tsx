import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Board from '../../app/routes/board'
import { boardRoute } from './board-route'

/* What is filed under a destination is followed there: the destination's page opens, with what was
   just put in it. Dragged in a real browser onto the destination's entry in the menu. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const board = {
  groups: [{ id: 'g1', label: 'g1', day: '01.08.2026', files: [file('plane', AT), file('luc', AT + 60)] }],
  looseFiles: [],
  destinations: [{ name: 'Yverdon' }],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

const requests: unknown[] = []

const renderBoard = async () => {
  requests.length = 0
  const Stub = createRoutesStub([
    boardRoute(() => board),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        requests.push(await request.json())
        return { ok: true }
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const yverdon = () =>
  page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Yverdon/ })
const heading = () => page.getByRole('heading', { name: /^Yverdon/ })

describe('dropping on a destination', () => {
  test('opens the destination a file was dropped on', async () => {
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: /^Jump 1, / }))

    await userEvent.dragAndDrop(page.getByRole('button', { name: /luc\.MP4/ }).first(), yverdon())

    await vi.waitFor(() =>
      expect(requests).toContainEqual(expect.objectContaining({ intent: 'move-files', destination: 'Yverdon' }))
    )
    await expect.element(heading()).toBeVisible()
  })

  test('opens the destination a whole jump was dropped on', async () => {
    await renderBoard()

    await userEvent.dragAndDrop(page.getByRole('button', { name: /^Jump 1, / }), yverdon())

    await expect.element(heading()).toBeVisible()
  })
})
