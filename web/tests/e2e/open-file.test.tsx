import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { boardRoute } from './board-route'

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const clip = (id: string, at: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: at
})

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      files: [clip('early', AT), clip('later', AT + 30)]
    }
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

const renderBoard = async () => {
  const Stub = createRoutesStub([boardRoute(() => board)])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('button', { name: /^Jump 1,/ }))
  return page.getByRole('button', { name: /later\.MP4/ }).first()
}

const preview = () => page.getByRole('dialog', { name: 'Preview' })

describe('opening a file from the board', () => {
  test('opens it on a second click, with no double-click of its own', async () => {
    const row = await renderBoard()

    await userEvent.dblClick(row)

    await expect.element(preview()).toBeInTheDocument()
  })

  test('only looks at it on one click', async () => {
    const row = await renderBoard()

    await userEvent.click(row)

    await expect.element(preview()).not.toBeInTheDocument()
    await expect.element(row).toHaveAttribute('aria-current', 'true')
  })

  test('does not open a file that was picked and then clicked', async () => {
    const row = await renderBoard()

    await userEvent.click(row, { modifiers: ['ControlOrMeta'] })
    await userEvent.click(row)

    await expect.element(preview()).not.toBeInTheDocument()
  })
})
