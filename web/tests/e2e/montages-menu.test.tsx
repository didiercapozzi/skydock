import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { boardOf, boardRoute } from './board-route'


const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const montage = (id: string, passenger: { firstname: string; lastname: string }) => ({
  id,
  label: id,
  day: '01.08.2026',
  montageJump: true,
  passenger,
  files: [
    { id: `${id}a`, path: `/o/${id}a.MP4`, filename: `${id}a.MP4`, size: 1, mtime: AT },
    { id: `${id}b`, path: `/o/${id}b.MP4`, filename: `${id}b.MP4`, size: 1, mtime: AT + 30 }
  ]
})

const board = boardOf({
  groups: [
    montage('g1', { firstname: 'Luc', lastname: 'Favre' }),
    montage('g2', { firstname: 'Ana', lastname: '' }),
    montage('g6', { firstname: '', lastname: '' })
  ],
  destinations: [{ name: 'Passengers' }]
})

describe('the montages in the menu', () => {
  test('lists a montage named by one word as a montage, and one with no name among those waiting', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    const menu = page.getByRole('navigation', { name: 'Folders' })
    await expect.element(menu.getByText('Montages')).toBeInTheDocument()
    await expect.element(menu.getByText('Luc Favre')).toBeInTheDocument()
    await expect.element(menu.getByText('Ana', { exact: true })).toBeInTheDocument()
    await expect.element(menu.getByText('No name yet')).toBeInTheDocument()
    await expect.element(menu.getByText('1 to name')).toBeInTheDocument()
  })
})

describe('making a montage from a jump', () => {
  const fresh = {
    ...board,
    groups: [{ ...montage('g3', { firstname: '', lastname: '' }), destination: undefined, montageJump: undefined }]
  }
  const sent: unknown[] = []
  const renderFresh = async () => {
    sent.length = 0
    const Stub = createRoutesStub([
      boardRoute(() => fresh),
      {
        path: '/api/manifest',
        action: async ({ request }) => {
          sent.push(await request.json())
          return { ok: true }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('button', { name: /^Jump 1, / }))
    await userEvent.click(page.getByRole('button', { name: 'Make a montage…' }))
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toBeVisible()
  }

  test('is left with Cancel, saving nothing', async () => {
    await renderFresh()
    await userEvent.click(page.getByRole('button', { name: 'Cancel', exact: true }))

    await expect.element(page.getByRole('button', { name: 'Make a montage…' })).toBeVisible()
    expect(sent).toEqual([])
  })

  test('is left with Escape, saving nothing', async () => {
    await renderFresh()
    await userEvent.type(page.getByRole('textbox', { name: 'Name' }), 'Luc')
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByRole('button', { name: 'Make a montage…' })).toBeVisible()
    expect(sent).toEqual([])
  })
})

describe('a clip whose proxy could not be made', () => {
  test('says so on its row, with the reason', async () => {
    const failed = {
      ...board,
      groups: [{ ...montage('g4', { firstname: '', lastname: '' }), destination: undefined, montageJump: undefined }],
      proxies: {
        '/o/g4a.MP4': { state: 'none', play: '/o/g4a.MP4', reason: 'No space left on device' },
        '/o/g4b.MP4': { state: 'none', play: '/o/g4b.MP4' }
      }
    }
    const Stub = createRoutesStub([boardRoute(() => failed)])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('button', { name: /^Jump 1, / }))

    const flag = page.getByText('proxy failed')
    await expect.element(flag).toBeVisible()
    await expect.element(flag).toHaveAttribute('title', expect.stringContaining('No space left on device'))
    await expect.element(page.getByText('no proxy', { exact: true })).toBeVisible()
  })
})

describe('processing a dropzone', () => {
  test('offers Cancel while it runs, which asks for the processing to stop', async () => {
    const dropzone = {
      ...board,
      groups: [{ ...montage('g5', { firstname: '', lastname: '' }), destination: 'Yverdon', montageJump: undefined }],
      destinations: [{ name: 'Yverdon' }]
    }
    const sent: { intent: string }[] = []
    const Stub = createRoutesStub([
      boardRoute(() => dropzone),
      {
        path: '/api/manifest',
        action: async ({ request }) => {
          const body = (await request.json()) as { intent: string }
          sent.push(body)
          return body.intent === 'process' ? new Promise(() => {}) : { groups: dropzone.groups }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('navigation', { name: 'Folders' }).getByText('Yverdon'))

    await userEvent.click(page.getByRole('button', { name: /^Process \d+ file/ }))
    await expect.element(page.getByRole('button', { name: 'Processing…' })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Cancel', exact: true }))
    await expect.poll(() => sent.map((b) => b.intent)).toEqual(['process', 'cancel-process'])
  })
})

describe('starting the edit again', () => {
  const edited = boardOf({
    groups: [{ ...montage('g7', { firstname: 'Luc', lastname: 'Favre' }), processed: true }],
    montages: {
      g7: {
        project: true,
        edit: true,
        kdenlive: true,
        projectPath: '/o/luc.kdenlive',
        film: null,
        baseName: 'luc_favre_20260801'
      }
    }
  })
  const sent: { intent: string; edit?: string }[] = []
  const openMenu = async () => {
    sent.length = 0
    const Stub = createRoutesStub([
      boardRoute(() => edited),
      {
        path: '/api/manifest',
        action: async ({ request }) => {
          sent.push(await request.json())
          return { ok: true }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('link', { name: /Luc Favre/ }).first())
    await userEvent.click(page.getByRole('button', { name: 'More', exact: true }))
    await userEvent.click(page.getByRole('button', { name: 'Start the edit again…' }))
  }

  test('asks first, naming each edit it would take away and what stays', async () => {
    await openMenu()
    const dialog = page.getByRole('dialog', { name: 'Start the edit again' })

    await expect.element(dialog.getByText('the film editor’s edit')).toBeVisible()
    await expect.element(dialog.getByText('the kdenlive project')).toBeVisible()
    await expect.element(dialog.getByText('the copies, and the film rendered last')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(sent).toEqual([])
  })

  test('starts the one chosen again, and only that one', async () => {
    await openMenu()
    await userEvent.click(page.getByRole('button', { name: 'Start the kdenlive project again' }))

    await expect
      .poll(() => sent.find((one) => one.intent === 'start-edit-again'))
      .toMatchObject({ intent: 'start-edit-again', groupId: 'g7', edit: 'kdenlive' })
  })
})

describe('both editors stay in reach', () => {
  const withEdits = (facts: Record<string, unknown>) =>
    boardOf({
      groups: [{ ...montage('g8', { firstname: 'Luc', lastname: 'Favre' }), processed: true }],
      montages: {
        g8: { project: true, projectPath: '/o/luc', film: null, baseName: 'luc_favre_20260801', ...facts }
      }
    })
  const openPage = async (board: unknown) => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('link', { name: /Luc Favre/ }).first())
  }

  test('still offers Make a kdenlive project in the menu once the film is edited in SkyDock', async () => {
    await openPage(withEdits({ edit: true, kdenlive: false, latest: 'edit' }))

    await expect.element(page.getByRole('button', { name: 'Edit the film' }).first()).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'More', exact: true }))
    await expect.element(page.getByRole('button', { name: 'Make a kdenlive project' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Open in kdenlive' })).not.toBeInTheDocument()
  })

  test('still offers Edit the film in the menu beside a kdenlive project, and the next step opens the one changed last', async () => {
    await openPage(withEdits({ edit: true, kdenlive: true, latest: 'kdenlive' }))

    await expect.element(page.getByRole('button', { name: 'Open in kdenlive' }).first()).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'More', exact: true }))
    await expect.element(page.getByRole('button', { name: 'Edit the film' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Make a kdenlive project' })).not.toBeInTheDocument()
  })
})
