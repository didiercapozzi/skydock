import { createElement, useState } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PendingLine, Spinner } from '../../app/components/pending'
import { boardRoute } from './board-route'
import { PENDING_AFTER_MS, usePending } from '../../app/hooks/usePending'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

/* The board answers a click at once; a wait that lasts is then said — a line under the header and a
   word in the footer — and one that ends quickly is never shown (RULES, Nothing in the background
   holds the board). */

const Waiting = () => {
  const [active, setActive] = useState(false)
  const pending = usePending(active)
  return (
    <>
      <button
        type='button'
        onClick={() => setActive((was) => !was)}>
        {active ? 'Answer' : 'Ask'}
      </button>
      <PendingLine active={pending} />
      {pending && <Spinner label='Waiting' />}
    </>
  )
}

const line = () => page.getByRole('progressbar', { name: 'Working' })

describe('a wait that lasts', () => {
  test('is not shown while the answer is still quick', async () => {
    await render(<Waiting />)

    await userEvent.click(page.getByRole('button', { name: 'Ask' }))

    await expect.element(line()).not.toBeInTheDocument()
  })

  test('is shown once it has lasted long enough to be felt, and gone when the answer lands', async () => {
    await render(<Waiting />)
    await userEvent.click(page.getByRole('button', { name: 'Ask' }))

    await new Promise((resolve) => setTimeout(resolve, PENDING_AFTER_MS + 100))
    await expect.element(line()).toBeInTheDocument()
    await expect.element(page.getByRole('status', { name: 'Waiting' })).toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Answer' }))
    await expect.element(line()).not.toBeInTheDocument()
  })

  test('is never shown for an answer that comes within the time', async () => {
    await render(<Waiting />)

    await userEvent.click(page.getByRole('button', { name: 'Ask' }))
    await userEvent.click(page.getByRole('button', { name: 'Answer' }))
    await new Promise((resolve) => setTimeout(resolve, PENDING_AFTER_MS + 100))

    await expect.element(line()).not.toBeInTheDocument()
  })
})

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const board = {
  groups: [],
  looseFiles: [file('solo', AT), file('twin', AT + 60)],
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

const WAIT_MS = PENDING_AFTER_MS + 600

describe('an action the machine is slow to answer', () => {
  const slowBoard = async (answerAfter: number) => {
    const Stub = createRoutesStub([
      boardRoute(() => board),
      {
        path: '/api/manifest',
        action: async () => {
          await new Promise((resolve) => setTimeout(resolve, answerAfter))
          return { ok: true }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
  }

  test('is said in the footer and by the line under the header, in words, once it has lasted', async () => {
    await slowBoard(WAIT_MS)

    await userEvent.click(page.getByRole('button', { name: 'Group 2 loose files' }))

    await expect.element(page.getByRole('status').getByText('Grouping the loose files…')).toBeInTheDocument()
    await expect.element(line()).toBeInTheDocument()
  })

  test('says nothing at all when it is answered at once', async () => {
    await slowBoard(0)

    await userEvent.click(page.getByRole('button', { name: 'Group 2 loose files' }))
    await new Promise((resolve) => setTimeout(resolve, PENDING_AFTER_MS + 100))

    await expect.element(page.getByText('Grouping the loose files…')).not.toBeInTheDocument()
    await expect.element(line()).not.toBeInTheDocument()
  })
})
