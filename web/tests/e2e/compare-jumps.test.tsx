import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import Board from '../../app/routes/board'
import { boardRoute } from './board-route'


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
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

const renderBoard = async () => {
  const Stub = createRoutesStub([
    boardRoute(() => board),
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

  test('does not open on a plain click', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 1, /))

    await userEvent.click(card(/^Jump 2, /))

    await expect.element(comparison()).not.toBeInTheDocument()
  })

  test('does not open when no jump is open to compare with', async () => {
    await renderBoard()

    await userEvent.keyboard('{Control>}')
    await userEvent.click(card(/^Jump 1, /))
    await userEvent.keyboard('{/Control}')

    await expect.element(comparison()).not.toBeInTheDocument()
  })
})

describe('the keyboard in the comparison', () => {
  const three = { ...board, groups: [jump('g1', AT), jump('g2', AT + 3600), jump('g3', AT + 7200)] }

  const opened = async () => {
    const Stub = createRoutesStub([
      boardRoute(() => three),
      { path: '/api/manifest', action: async () => ({ ok: true }) }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(card(/^Jump 1, /))
    await userEvent.keyboard('{Control>}')
    await userEvent.click(card(/^Jump 2, /))
    await userEvent.keyboard('{/Control}')
    await expect.element(comparison()).toBeInTheDocument()
  }

  const leftSide = () => comparison().getByRole('listbox').first()
  const taken = () =>
    [...leftSide().element().querySelectorAll('[role="option"]')].findIndex(
      (row) => row.getAttribute('aria-selected') === 'true'
    )
  const under = () => document.activeElement?.textContent?.trim().slice(0, 8) ?? ''

  test('starts on the file the left side is already on, with nothing clicked', async () => {
    await opened()

    await expect.poll(under).toContain('g1a')
  })

  test('moves along the list without loading anything', async () => {
    await opened()
    await expect.poll(under).toContain('g1a')

    await userEvent.keyboard('{ArrowDown}')

    await expect.poll(under).toContain('g1b')
    expect(taken()).toBe(0)
  })

  test('takes the file the arrows are on, with Enter', async () => {
    await opened()
    await expect.poll(under).toContain('g1a')

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    await expect.poll(taken).toBe(1)
  })

  test('goes to another jump on that side with left and right', async () => {
    await opened()
    await expect.poll(under).toContain('g1a')

    await userEvent.keyboard('{ArrowRight}')

    await expect.poll(under).toContain('g3a')
  })
})

describe('the jump whose card is open', () => {
  test('is the one the panel describes', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 2, /))

    const panel = page.getByRole('complementary')
    await expect.element(panel.getByRole('heading', { name: /^Jump 2\b/ })).toBeInTheDocument()
    await expect.element(panel.getByRole('button', { name: /Select its 2 files/ })).toBeInTheDocument()
  })

  test('changes with the card that is opened', async () => {
    await renderBoard()

    await userEvent.click(card(/^Jump 1, /))

    const panel = page.getByRole('complementary')
    await expect.element(panel.getByRole('heading', { name: /^Jump 1\b/ })).toBeInTheDocument()
  })
})

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
    const Stub = createRoutesStub([boardRoute(() => days)])
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

  test('keep their numbers while a search hides the others', async () => {
    const Stub = createRoutesStub([boardRoute(() => days)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await userEvent.click(page.getByRole('button', { name: 'Search' }))
    await userEvent.fill(page.getByRole('textbox', { name: 'Find a file' }), 'early2')

    await expect.element(card(/^Jump 3, /)).toBeInTheDocument()
    await expect.element(card(/^Jump 1, /)).not.toBeInTheDocument()
  })
})

describe('resetting Fresh files', () => {
  const asked: unknown[] = []
  const renderWithRequests = async (shown: unknown = board) => {
    asked.length = 0
    const Stub = createRoutesStub([
      boardRoute(() => shown),
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

    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Reset Fresh files…' }))

    await expect.element(dialog().getByRole('button', { name: /^Times only/ })).toBeInTheDocument()
    await expect
      .element(dialog().getByRole('button', { name: /^Everything, as just scanned/ }))
      .toBeInTheDocument()
    await expect
      .element(dialog().getByText(/nothing filed to a destination or a montage is touched/))
      .toBeInTheDocument()
    expect(asked).toEqual([])
  })

  test('resets only the times when that is chosen', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Reset Fresh files…' }))

    await userEvent.click(dialog().getByRole('button', { name: /^Times only/ }))

    await vi.waitFor(() =>
      expect(asked).toContainEqual({ intent: 'reset-fresh', resetWhat: 'times' })
    )
  })

  test('resets everything when that is chosen', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Reset Fresh files…' }))

    await userEvent.click(dialog().getByRole('button', { name: /^Everything/ }))

    await vi.waitFor(() =>
      expect(asked).toContainEqual({ intent: 'reset-fresh', resetWhat: 'everything' })
    )
  })

  test('is offered apart from gathering the loose files into jumps, which asks nothing', async () => {
    await renderWithRequests({
      ...board,
      looseFiles: [file('solo', AT + 9000), file('twin', AT + 9060)]
    })

    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await expect.element(page.getByRole('button', { name: 'Reset Fresh files…' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(page.getByRole('button', { name: 'Group 2 loose files' }))

    await vi.waitFor(() => expect(asked).toContainEqual({ intent: 'regroup-loose' }))
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  test('does not offer to group loose files that are each alone', async () => {
    await renderWithRequests({
      ...board,
      looseFiles: [file('solo', AT + 9000), file('far', AT + 9000 + 3 * 3600)]
    })

    await expect.element(page.getByText(/jumps? (is|are) waiting for a home/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: /^Group \d+ loose file/ })).not.toBeInTheDocument()
  })

  test('does nothing when the dialog is closed', async () => {
    await renderWithRequests()
    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Reset Fresh files…' }))

    await userEvent.click(dialog().getByRole('button', { name: 'Close' }))

    expect(asked).toEqual([])
  })
})

describe('the files of a jump', () => {
  test('are listed newest first', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 2, /))

    await expect.element(page.getByText('g2b.MP4').first()).toBeInTheDocument()
    await expect
      .poll(() =>
        [...document.querySelectorAll('[title*=".MP4"]')].map((el) =>
          el.getAttribute('title')?.split(' · ')[0]
        )
      )
      .toEqual(['g2b.MP4', 'g2a.MP4'])
  })
})
