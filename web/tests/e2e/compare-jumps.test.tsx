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

  /* the jump whose card is open is the one it is about, whether or not it was ever clicked */
  test('compares with the jump already open, without it having to be clicked first', async () => {
    await renderBoard()

    await userEvent.keyboard('{Control>}')
    await userEvent.click(card(/^Jump 1, /))
    await userEvent.keyboard('{/Control}')

    await expect.element(comparison()).toBeInTheDocument()
  })
})

/* One jump's card is always open — the one last chosen, or else the first, the newest — with its files listed
   under the cards. The panel on the right describes that same jump: a lit card beside a panel about
   something else was two answers to which jump this is about. */
describe('the jump whose card is open', () => {
  test('is the one the panel describes, before anything is clicked', async () => {
    await renderBoard()

    const panel = page.getByRole('complementary')
    await expect.element(panel.getByRole('button', { name: 'Jump 2', exact: true })).toBeInTheDocument()
    await expect.element(panel.getByRole('button', { name: /Select its 2 files/ })).toBeInTheDocument()
  })

  test('changes with the card that is opened', async () => {
    await renderBoard()

    await userEvent.click(card(/^Jump 1, /))

    const panel = page.getByRole('complementary')
    await expect.element(panel.getByRole('button', { name: 'Jump 1', exact: true })).toBeInTheDocument()
  })
})

/* Four jumps over two days are Jump 1 to Jump 4, counted oldest first: a number that started again
   each day gave two jumps the same name. The cards are drawn newest first, counting down to Jump 1. */
describe('jumps as cards', () => {
  const DAY2 = AT + 86_400
  const days = {
    ...board,
    groups: [
      { ...jump('late2', DAY2 + 3600), day: '02.08.2026' },
      jump('early1', AT),
      { ...jump('early2', DAY2), day: '02.08.2026' },
      jump('late1', AT + 3600)
    ]
  }

  test('are numbered straight through the days and drawn newest first', async () => {
    const Stub = createRoutesStub([{ path: '/', Component: Board, loader: () => days }])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(card(/^Jump 4, /)).toBeInTheDocument()
    const drawn = page
      .getByRole('button', { name: /^Jump \d, / })
      .elements()
      .map((el) => el.getAttribute('aria-label')?.slice(0, 22))
    expect(drawn).toEqual([
      'Jump 4, 2 August 2026 ',
      'Jump 3, 2 August 2026 ',
      'Jump 2, 1 August 2026 ',
      'Jump 1, 1 August 2026 '
    ])
  })
})

/* Fresh files can be put back by as much as is wanted: the times alone, or everything as just
   scanned. The two are offered together, each saying what it forgets, and choosing is the asking. */
describe('resetting Fresh files', () => {
  const asked: unknown[] = []
  const renderWithRequests = async () => {
    asked.length = 0
    const Stub = createRoutesStub([
      { path: '/', Component: Board, loader: () => board },
      {
        path: '/api/manifest',
        action: async ({ request }) => {
          asked.push(await request.json())
          return { ok: true }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
  }

  const dialog = () => page.getByRole('dialog', { name: 'Reset Fresh files' })

  test('offers the times alone or everything, each saying what it forgets and keeps', async () => {
    await renderWithRequests()

    await userEvent.click(page.getByRole('button', { name: 'reset…' }))

    await expect.element(dialog().getByRole('button', { name: /^Times only/ })).toBeInTheDocument()
    await expect
      .element(dialog().getByRole('button', { name: /^Everything, as just scanned/ }))
      .toBeInTheDocument()
    await expect
      .element(dialog().getByText(/nothing filed to a dropzone or a passenger is touched/))
      .toBeInTheDocument()
    expect(asked).toEqual([])
  })

  test('resets only the times when that is chosen', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'reset…' }))

    await userEvent.click(dialog().getByRole('button', { name: /^Times only/ }))

    await vi.waitFor(() =>
      expect(asked).toContainEqual({ intent: 'reset-fresh', resetWhat: 'times' })
    )
  })

  test('resets everything when that is chosen', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'reset…' }))

    await userEvent.click(dialog().getByRole('button', { name: /^Everything/ }))

    await vi.waitFor(() =>
      expect(asked).toContainEqual({ intent: 'reset-fresh', resetWhat: 'everything' })
    )
  })

  test('does nothing when the dialog is closed', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'reset…' }))

    await userEvent.click(dialog().getByRole('button', { name: 'Close' }))

    expect(asked).toEqual([])
  })
})
