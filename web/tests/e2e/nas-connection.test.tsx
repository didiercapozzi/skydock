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
    boardRoute(() => emptyBoard),
    { path: '/api/manifest', action: async () => ({ ok: true }) },
    { path: '/api/nas', action: async () => ({ ok: true }) }
  ])
  return render(createElement(Stub, { initialEntries: ['/'] }))
}

describe('connecting to the storage', () => {
  test('offers to connect while no session exists', async () => {
    await renderBoard()
    await expect.element(page.getByRole('button', { name: 'Connect the NAS' })).toBeInTheDocument()
  })

  test('Connect opens the login', async () => {
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Connect the NAS' }))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'NAS Hostname' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Password' })).toBeInTheDocument()
  })

  test('Cancel closes the login', async () => {
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Connect the NAS' }))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await userEvent.click(page.getByText('Cancel'))
    await expect.poll(() => document.querySelector('[data-connection-dialog]') === null).toBe(true)
  })
})

/* An account with 2-step verification (RULES, Network storage): the storage asks for the code, the
   dialog asks for it in turn, keeping what was already typed, and connects with it. */
describe('connecting to the storage — 2-step verification', () => {
  test('asks for the code when the storage wants one, and connects with it', async () => {
    const sent: Record<string, unknown>[] = []
    const Stub = createRoutesStub([
      boardRoute(() => emptyBoard),
      { path: '/api/manifest', action: async () => ({ ok: true }) },
      {
        path: '/api/nas',
        action: async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          sent.push(body)
          return body.otp
            ? { connected: true, hostname: 'https://nas.local:5001', username: 'admin' }
            : {
                success: false,
                status: 422,
                fieldErrors: {
                  otp: 'This account uses 2-step verification — enter the 6-digit code from your authenticator app.'
                }
              }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('button', { name: 'Connect the NAS' }))
    await userEvent.fill(page.getByRole('textbox', { name: 'NAS Hostname' }), 'https://nas.local:5001')
    await userEvent.fill(page.getByRole('textbox', { name: 'Username' }), 'admin')
    await userEvent.fill(page.getByRole('textbox', { name: 'Password' }), 'secret')
    await userEvent.click(page.getByRole('button', { name: 'Connect', exact: true }))

    const code = page.getByRole('textbox', { name: '2-step verification code' })
    await expect.element(code).toBeVisible()
    await expect.element(page.getByText(/uses 2-step verification/)).toBeVisible()

    await userEvent.fill(code, '123456')
    await userEvent.click(page.getByRole('button', { name: 'Connect', exact: true }))

    await expect.poll(() => sent.at(-1)).toMatchObject({ intent: 'connect', user: 'admin', otp: '123456' })
    await expect.poll(() => document.querySelector('[data-connection-dialog]') === null).toBe(true)
  })
})
