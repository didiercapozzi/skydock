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

/* A clip two jumps share is copied into the second rather than moved: dropped on the other jump with
   alt held, as in a file manager. Dragged in a real browser with the key really held — what decides
   between a move and a copy is the state of the keyboard at the drop. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number, over: Record<string, unknown> = {}) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime,
  ...over
})

const board = {
  groups: [
    { id: 'g1', label: 'g1', day: '01.08.2026', files: [file('plane', AT), file('luc', AT + 60)] },
    {
      id: 'g2',
      label: 'g2',
      day: '01.08.2026',
      files: [file('plane~1', AT + 7000, { copyOf: 'plane', path: '/o/plane.MP4' }), file('ana', AT + 7200)]
    }
  ],
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

const row = (name: string) => page.getByRole('button', { name: new RegExp(name) }).first()
const card = (name: RegExp) => page.getByRole('button', { name })

describe('dropping files on another jump', () => {
  test('copies them there when alt is held, leaving them where they were', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 1, /))

    await userEvent.keyboard('{Alt>}')
    await userEvent.dragAndDrop(row('luc\\.MP4'), card(/^Jump 2, /))
    await userEvent.keyboard('{/Alt}')

    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'copy-files', fileIds: ['luc'], targetGroupId: 'g2' })
    )
    expect(requests.some((r) => (r as { intent: string }).intent === 'move-files')).toBe(false)
  })

  test('moves them there with no key held, as it always did', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 1, /))

    await userEvent.dragAndDrop(row('luc\\.MP4'), card(/^Jump 2, /))

    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'move-files', fileIds: ['luc'], targetGroupId: 'g2' })
    )
  })
})

/* Jump 2 holds a copy shot two hours before its own first file, and still says it started when its
   own files did: copying a clip in changes nothing about when the jump was. */
describe('a jump holding a copy from earlier', () => {
  test('keeps its own start on its card, and its own number', async () => {
    const earlier = {
      ...board,
      groups: [
        board.groups[0],
        {
          ...board.groups[1],
          files: [
            file('plane~1', AT - 3600, { copyOf: 'plane', path: '/o/plane.MP4' }),
            file('ana', AT + 7200)
          ]
        }
      ]
    }
    const Stub = createRoutesStub([boardRoute(() => earlier)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    /* 12:00, when Ana's own clip was shot — not 09:00, when the copied plane was */
    await expect.element(card(/^Jump 2, 1 August 2026 12:00/)).toBeInTheDocument()
  })
})

describe('a copy in a jump', () => {
  test('says on the file that it is one', async () => {
    await renderBoard()
    await userEvent.click(card(/^Jump 2, /))

    await expect.element(page.getByText('⧉ copy')).toBeInTheDocument()
  })
})
