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

/* Looking at a file and opening it are one click apart: a click looks, and a second one on the same
   file opens it (RULES, The board). The two are paired by the board rather than left to the engine,
   because a file can also be dragged and the engine SkyDock's own window draws with never sends a
   double-click on something draggable — the drag takes the second press. Pressed in a real browser,
   with two plain clicks, which is what every engine sends. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const clip = (id: string, at: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: at
})

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      files: [clip('early', AT), clip('later', AT + 30)]
    }
  ],
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

const renderBoard = async () => {
  const Stub = createRoutesStub([boardRoute(() => board)])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  return page.getByRole('button', { name: /later\.MP4/ }).first()
}

const preview = () => page.getByRole('dialog', { name: 'Preview' })

describe('opening a file from the board', () => {
  test('opens it on a second click, with no double-click of its own', async () => {
    const row = await renderBoard()

    await userEvent.click(row)
    await userEvent.click(row)

    await expect.element(preview()).toBeInTheDocument()
  })

  test('only looks at it on one click', async () => {
    const row = await renderBoard()

    await userEvent.click(row)

    await expect.element(preview()).not.toBeInTheDocument()
    await expect.element(row).toHaveAttribute('aria-current', 'true')
  })

  /* picking is choosing what to move, so it never turns into opening on the way */
  test('does not open a file that was picked and then clicked', async () => {
    const row = await renderBoard()

    await userEvent.click(row, { modifiers: ['ControlOrMeta'] })
    await userEvent.click(row)

    await expect.element(preview()).not.toBeInTheDocument()
  })
})
