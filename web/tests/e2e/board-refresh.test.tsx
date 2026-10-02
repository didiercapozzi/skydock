import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* The board's record can change outside the page — another tab, a script, a hand edit. The server says
   so over the stream the board keeps open, and the board looks at the record again, quietly, and shows
   what changed with nothing reloaded (RULES, The board). The stream is stood in for. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const jump = (id: string, label: string, destination?: string) => ({
  id,
  label,
  day: '01.08.2026',
  ...(destination ? { destination } : {}),
  files: [file(`${id}f`, AT)]
})

const board = (groups: unknown[]) => ({
  groups,
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
})

/* what the server answers a look with: the board's record, as every answer carries it */
const answerOf = (groups: unknown[]) => ({
  groups,
  looseFiles: [],
  destinations: [{ name: 'Yverdon' }],
  outputs: {},
  proxies: {},
  montages: {}
})

let stream: { onmessage: ((message: { data: string }) => void) | null } | null
let asked: Record<string, unknown>[]
/* what the record holds now, as a look would find it */
let record: unknown

beforeEach(() => {
  stream = null
  asked = []
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: ((message: { data: string }) => void) | null = null
      close = vi.fn()
      constructor() {
        stream = this
      }
    }
  )
})

afterEach(() => vi.unstubAllGlobals())

const open = async (shown: ReturnType<typeof board>) => {
  record = answerOf(shown.groups)
  const Stub = createRoutesStub([
    boardRoute(() => shown),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        asked.push((await request.json()) as Record<string, unknown>)
        return record
      }
    },
    { path: '/api/storage-folder', loader: () => ({ ok: true, dir: '/x', files: [] }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const says = (stamp: string) =>
  stream?.onmessage?.({ data: JSON.stringify({ kind: 'board', stamp }) })

describe('the record changing outside the page', () => {
  /* the shape of the second test only: a look that finds the board as it is leaves it alone */
  test('leaves the board as it is when the look finds nothing new', async () => {
    await open(board([jump('g1', 'Sunset load', 'Yverdon')]))
    await userEventOpenYverdon()
    await expect.element(page.getByText('1 file · 1 B').first()).toBeVisible()

    says('stamp-1')

    await vi.waitFor(() => expect(asked).toContainEqual({ intent: 'look-at-board' }))
    await expect.element(page.getByText('1 file · 1 B').first()).toBeVisible()
  })

  test('is looked at again, and what changed is shown', async () => {
    await open(board([jump('g1', 'Sunset load', 'Yverdon')]))
    await expect.element(page.getByRole('link', { name: /Yverdon/ }).first()).toBeVisible()
    await expect.element(page.getByText('Late arrival')).not.toBeInTheDocument()

    /* somebody else filed a second jump at the destination, and renamed the first */
    record = answerOf([jump('g1', 'Sunset load', 'Yverdon'), jump('g2', 'Late arrival', 'Yverdon')])
    says('stamp-1')

    await vi.waitFor(() => expect(asked).toContainEqual({ intent: 'look-at-board' }))
    await userEventOpenYverdon()
    await expect.element(page.getByText('2 files · 2 B').first()).toBeVisible()
  })

  test('asks once for one change, however often it is said', async () => {
    await open(board([jump('g1', 'Sunset load', 'Yverdon')]))

    says('stamp-1')
    says('stamp-1')
    says('stamp-1')

    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0))
    expect(asked.filter((a) => a.intent === 'look-at-board')).toHaveLength(1)
  })
})

/* the destination's page lists its files, which is where the new jump shows */
const userEventOpenYverdon = async () => {
  const { userEvent } = await import('vitest/browser')
  await userEvent.click(
    page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Yverdon/ })
  )
}
