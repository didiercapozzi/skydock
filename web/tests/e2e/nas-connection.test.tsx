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

const emptyBoard = {
  groups: [],
  looseFiles: [],
  destinations: [],
  outputs: {},
  remote: null,
  hasManifest: true,
  nas: { connected: false, hostname: null, defaultFolder: null }
}

const renderBoard = async () => {
  const Stub = createRoutesStub([
    { path: '/', Component: Board, loader: () => emptyBoard },
    { path: '/api/manifest', action: async () => ({ ok: true }) },
    { path: '/api/nas', action: async () => ({ ok: true }) }
  ])
  return render(createElement(Stub, { initialEntries: ['/'] }))
}

describe('NAS connection', () => {
  test('offers to connect while no session exists', async () => {
    await renderBoard()
    await expect.element(page.getByRole('button', { name: 'Connect the NAS' })).toBeInTheDocument()
  })

  test('the connect button opens the connection dialog', async () => {
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Connect the NAS' }))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'NAS Hostname' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Password' })).toBeInTheDocument()
  })

  test('Cancel closes the connection dialog', async () => {
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Connect the NAS' }))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await userEvent.click(page.getByText('Cancel'))
    await expect.poll(() => document.querySelector('[data-connection-dialog]') === null).toBe(true)
  })
})
