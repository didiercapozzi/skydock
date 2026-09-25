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

/* The menu lists one entry per named montage, and the montages still waiting for a name together
   (RULES, The board). A single word is a whole name. */

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

const board = {
  groups: [
    montage('g1', { firstname: 'Luc', lastname: 'Favre' }),
    montage('g2', { firstname: 'Ana', lastname: '' }),
    montage('g6', { firstname: '', lastname: '' })
  ],
  looseFiles: [],
  destinations: [{ name: 'Passengers' }],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

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

/* Making a montage is asked for first, and can be left without saving anything (RULES, The board). */
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

/* A clip whose proxy could not be made says so, and why, rather than reading as still to come
   (RULES, The workflow). */
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

    const flag = page.getByText('proxy failed')
    await expect.element(flag).toBeVisible()
    await expect.element(flag).toHaveAttribute('title', expect.stringContaining('No space left on device'))
    await expect.element(page.getByText('no proxy', { exact: true })).toBeVisible()
  })
})

/* What is being processed can be stopped from where it was started (RULES, Acting). */
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
          /* the processing never answers on its own; only the cancel does */
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
