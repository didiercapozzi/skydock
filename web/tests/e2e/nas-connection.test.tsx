import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Home from '../../app/routes/home'

const renderHome = async (
  manifest: unknown,
  actions: Record<string, (args: { request: Request }) => Promise<unknown>> = {}
) => {
  const defaultAction = async () => ({ ok: true })
  const Stub = createRoutesStub([
    { path: '/', Component: Home, loader: () => ({ manifest }) },
    { path: '/api/manifest', action: actions['/api/manifest'] ?? defaultAction },
    { path: '/api/nas', action: actions['/api/nas'] ?? defaultAction }
  ])
  return render(createElement(Stub, { initialEntries: ['/'] }))
}

describe('NAS connection', () => {
  test('shows disconnected state and Connect link on mount', async () => {
    await renderHome(null)
    await expect.element(page.getByText('NAS Disconnected')).toBeInTheDocument()
    await expect.element(page.getByText('Connect')).toBeInTheDocument()
  })

  test('Connect link opens connection dialog', async () => {
    await renderHome(null)
    await userEvent.click(page.getByText('Connect'))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'NAS Hostname' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
    await expect.element(page.getByRole('textbox', { name: 'Password' })).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/nas-connection-dialog.png' })
  })

  test('Cancel closes connection dialog', async () => {
    await renderHome(null)
    await userEvent.click(page.getByText('Connect'))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await userEvent.click(page.getByText('Cancel'))
    await expect.poll(() => document.querySelector('[data-connection-dialog]') === null).toBe(true)
  })
})
