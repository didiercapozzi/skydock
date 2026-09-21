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

/* The menu lists one entry per named passenger, and the tandems still waiting for a name together
   (RULES, The board). Half a name is not a name: that tandem waits with the others. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const tandem = (id: string, passenger: { firstname: string; lastname: string }) => ({
  id,
  label: id,
  day: '01.08.2026',
  destination: 'Tandems',
  passenger,
  files: [
    { id: `${id}a`, path: `/o/${id}a.MP4`, filename: `${id}a.MP4`, size: 1, mtime: AT },
    { id: `${id}b`, path: `/o/${id}b.MP4`, filename: `${id}b.MP4`, size: 1, mtime: AT + 30 }
  ]
})

const board = {
  groups: [
    tandem('g1', { firstname: 'Luc', lastname: 'Favre' }),
    tandem('g2', { firstname: 'Ana', lastname: '' })
  ],
  looseFiles: [],
  destinations: [{ name: 'Tandems' }],
  outputs: {},
  proxies: {},
  tandems: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
}

describe('the passengers in the menu', () => {
  test('lists a tandem with half a name among those still waiting for one, not as a passenger', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    const menu = page.getByRole('navigation', { name: 'Folders' })
    await expect.element(menu.getByText('Luc Favre')).toBeInTheDocument()
    await expect.element(menu.getByText('No name yet')).toBeInTheDocument()
    await expect.element(menu.getByText('1 to name')).toBeInTheDocument()
    await expect.element(menu.getByText('Ana', { exact: true })).not.toBeInTheDocument()
  })
})

/* Making a tandem is asked for first, and can be left without saving anything (RULES, The board). */
describe('making a tandem from a jump', () => {
  const fresh = {
    ...board,
    groups: [{ ...tandem('g3', { firstname: '', lastname: '' }), destination: undefined }]
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
    await userEvent.click(page.getByRole('button', { name: 'Make a tandem…' }))
    await expect.element(page.getByRole('textbox', { name: 'First name' })).toBeVisible()
  }

  test('is left with Cancel, saving nothing', async () => {
    await renderFresh()
    await userEvent.click(page.getByRole('button', { name: 'Cancel', exact: true }))

    await expect.element(page.getByRole('button', { name: 'Make a tandem…' })).toBeVisible()
    expect(sent).toEqual([])
  })

  test('is left with Escape, saving nothing', async () => {
    await renderFresh()
    await userEvent.type(page.getByRole('textbox', { name: 'First name' }), 'Luc')
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByRole('button', { name: 'Make a tandem…' })).toBeVisible()
    expect(sent).toEqual([])
  })
})

/* A clip whose proxy could not be made says so, and why, rather than reading as still to come
   (RULES, The workflow). */
describe('a clip whose proxy could not be made', () => {
  test('says so on its row, with the reason', async () => {
    const failed = {
      ...board,
      groups: [{ ...tandem('g4', { firstname: '', lastname: '' }), destination: undefined }],
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
      groups: [{ ...tandem('g5', { firstname: '', lastname: '' }), destination: 'Yverdon' }],
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

    await userEvent.click(page.getByRole('button', { name: 'Process', exact: true }))
    await expect.element(page.getByRole('button', { name: 'Processing…' })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Cancel', exact: true }))
    await expect.poll(() => sent.map((b) => b.intent)).toEqual(['process', 'cancel-process'])
  })
})
