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

/* The panel on the right says what is selected: a file looked at in a jump, or the jump itself.
   Pressing the jump's card after looking at one of its files brings the jump's panel back — it used
   to stay on the file, with no way to the jump short of opening another one and coming back (RULES,
   Selecting). */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      name: 'Morning load',
      files: [file('alpha', AT), file('bravo', AT + 60)]
    },
    { id: 'g2', label: 'g2', day: '01.08.2026', name: 'Noon load', files: [file('charlie', AT + 7200)] }
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

const details = () => page.getByRole('complementary', { name: 'Details' })

describe('the panel on the right', () => {
  test('goes back to the jump when its card is pressed after one of its files was looked at', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await userEvent.click(page.getByRole('button', { name: /^Morning load, / }))
    await expect.element(details().getByRole('heading', { name: /^Morning load/ })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: /alpha\.MP4/ }).last())
    await expect.element(details().getByRole('heading', { name: /alpha\.MP4/ })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: /^Morning load, / }))

    await expect.element(details().getByRole('heading', { name: /^Morning load/ })).toBeVisible()
    await expect.element(details().getByRole('heading', { name: /alpha\.MP4/ })).not.toBeInTheDocument()
  })
})
