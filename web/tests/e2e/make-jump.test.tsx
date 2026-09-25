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

/* Several files picked in Fresh files are made a jump of their own — left unnamed, since a name makes
   them a montage — and the new jump is selected as soon as it is made, its panel open. Picked and
   made in a real browser, the answer the server's. One loose file stays behind, so the loose files
   are still there to be the card left open. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const PICKED = [file('plane', AT), file('exit', AT + 60)]
const LEFT = file('landing', AT + 600)

/* a jump already there, so the new one is not the only jump the place has */
const EARLIER = {
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  name: 'Morning load',
  files: [file('earlier', AT - 7200)]
}

const board = {
  groups: [EARLIER],
  looseFiles: [...PICKED, LEFT],
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

const renderBoard = async (answer: unknown) => {
  const Stub = createRoutesStub([
    boardRoute(() => board),
    { path: '/api/manifest', action: () => answer }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const makeJumpOfPicked = async () => {
  for (const name of [/plane\.MP4/, /exit\.MP4/])
    await userEvent.click(page.getByRole('button', { name }).last(), {
      modifiers: ['ControlOrMeta']
    })
  await userEvent.click(page.getByRole('button', { name: /Make a jump or a montage of these/ }))
  await userEvent.click(page.getByRole('button', { name: 'Make the jump' }))
}

const card = (name: RegExp) => page.getByRole('button', { name })
const details = () => page.getByRole('complementary', { name: 'Details' })

describe('making a jump of files picked in Fresh files', () => {
  test('selects the new jump as soon as it is made', async () => {
    await renderBoard({
      groups: [
        EARLIER,
        { id: 'g-new', label: 'g-new', day: '01.08.2026', files: PICKED }
      ],
      looseFiles: [LEFT]
    })

    await makeJumpOfPicked()

    await expect.element(card(/^Jump 2, /)).toHaveAttribute('aria-pressed', 'true')
    await expect.element(details().getByRole('heading', { name: /^Jump 2/ })).toBeVisible()
  })

  test('selects nothing when the jump could not be made', async () => {
    await renderBoard({ groups: [EARLIER], looseFiles: [...PICKED, LEFT] })

    await makeJumpOfPicked()

    await expect
      .element(page.getByRole('button', { name: /Make a jump or a montage of these/ }))
      .not.toBeInTheDocument()
    await expect.element(card(/^Loose files, /)).toHaveAttribute('aria-pressed', 'true')
    await expect.element(card(/^Morning load, /)).toHaveAttribute('aria-pressed', 'false')
  })
})
