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

/* Fresh files shows its jumps as cards, and can be looked at by day instead: one press beside the
   search, kept in the address (RULES, A destination's page and Fresh files are calm). */

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const FIRST_DAY = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
const SECOND_DAY = Math.floor(new Date(2026, 7, 2, 10, 0, 0).getTime() / 1000)

const board = {
  groups: [
    { id: 'g1', label: 'g1', day: '01.08.2026', files: [file('first', FIRST_DAY)] },
    { id: 'g2', label: 'g2', day: '02.08.2026', files: [file('second', SECOND_DAY)] }
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

const renderFresh = async () => {
  const Stub = createRoutesStub([boardRoute(() => board)])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const way = (name: string) => page.getByRole('group', { name: 'Group' }).getByRole('button', { name })

describe('looking at Fresh files by jump or by day', () => {
  test('opens by jump, the jumps as cards and no files listed until one is chosen', async () => {
    await renderFresh()

    await expect.element(way('By jump')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: /^Jump 1, / })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('first.MP4')
  })

  test("by day lists every day's files, with no jump cards", async () => {
    await renderFresh()

    await userEvent.click(way('By day'))

    await expect.element(page.getByText('first.MP4').first()).toBeInTheDocument()
    await expect.element(page.getByText('second.MP4').first()).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: /^Jump 1, / })).not.toBeInTheDocument()
  })

  test('beside its search it has the choice between By jump and By day, and By jump brings the cards back', async () => {
    await renderFresh()
    await userEvent.click(way('By day'))

    await userEvent.click(way('By jump'))

    await expect.element(page.getByRole('button', { name: /^Jump 1, / })).toBeInTheDocument()
  })

  test('has no choice of one list, only jumps and days', async () => {
    await renderFresh()

    await expect.element(way('One list')).not.toBeInTheDocument()
  })
})
