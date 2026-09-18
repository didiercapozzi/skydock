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

/* Two jumps are put side by side by selecting one and ⌘/ctrl-clicking a second — for the two
   cameras of one jump, one of them on the wrong clock. Clicked in a real browser, with the key held
   the way a person holds it. */

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const jump = (id: string, at: number) => ({
  id,
  label: id,
  day: '01.08.2026',
  files: [file(`${id}a`, at), file(`${id}b`, at + 30)]
})

const board = {
  groups: [jump('g1', AT), jump('g2', AT + 3600)],
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

const renderBoard = async () => {
  const Stub = createRoutesStub([
    { path: '/', Component: Board, loader: () => board },
    { path: '/api/manifest', action: async () => ({ ok: true }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const card = (name: RegExp) => page.getByRole('button', { name })
const comparison = () => page.getByRole('dialog', { name: 'Compare jumps' })

describe('comparing two jumps', () => {
  test('opens the two side by side when a second jump is ⌘/ctrl-clicked', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 1, /))

    await userEvent.keyboard('{Control>}')
    await userEvent.click(card(/^Jump 2, /))
    await userEvent.keyboard('{/Control}')

    await expect.element(comparison()).toBeInTheDocument()
  })

  /* a plain click on another jump is only ever looking at it */
  test('does not open on a plain click', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 1, /))

    await userEvent.click(card(/^Jump 2, /))

    await expect.element(comparison()).not.toBeInTheDocument()
  })

  /* with no jump selected there is nothing to compare the clicked one with */
  test('needs a jump selected first', async () => {
    await renderBoard()

    await userEvent.keyboard('{Control>}')
    await userEvent.click(card(/^Jump 2, /))
    await userEvent.keyboard('{/Control}')

    await expect.element(comparison()).not.toBeInTheDocument()
  })
})
