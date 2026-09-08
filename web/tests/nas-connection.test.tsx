import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Home from '../app/routes/home'

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

  test('filling form and clicking Connect submits credentials', async () => {
    let nasPayload: unknown = null
    const nasAction = async ({ request }: { request: Request }) => {
      nasPayload = await request.json()
      return { connected: true, hostname: 'https://nas.local:5001', username: 'admin' }
    }
    await renderHome(null, { '/api/nas': nasAction })

    await userEvent.click(page.getByText('Connect'))
    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()

    await userEvent.fill(
      page.getByRole('textbox', { name: 'NAS Hostname' }),
      'https://nas.local:5001'
    )
    await userEvent.fill(page.getByRole('textbox', { name: 'Username' }), 'admin')
    await userEvent.fill(page.getByRole('textbox', { name: 'Password' }), 'secret')
    await userEvent.click(page.getByRole('button', { name: 'Connect' }))

    await expect.poll(() => nasPayload !== null, { timeout: 5000 }).toBe(true)
    expect(nasPayload).toEqual({
      intent: 'connect',
      host: 'https://nas.local:5001',
      user: 'admin',
      password: 'secret'
    })
  })

  test('successful connect shows connected state and closes dialog', async () => {
    const nasAction = async () => ({
      connected: true,
      hostname: 'https://nas.local:5001',
      username: 'admin'
    })
    await renderHome(null, { '/api/nas': nasAction })

    await userEvent.click(page.getByText('Connect'))
    await userEvent.fill(
      page.getByRole('textbox', { name: 'NAS Hostname' }),
      'https://nas.local:5001'
    )
    await userEvent.fill(page.getByRole('textbox', { name: 'Username' }), 'admin')
    await userEvent.fill(page.getByRole('textbox', { name: 'Password' }), 'secret')
    await userEvent.click(page.getByRole('button', { name: 'Connect' }))

    await expect.element(page.getByText('NAS Connected')).toBeInTheDocument()
    await expect.element(page.getByText('Disconnect')).toBeInTheDocument()
    await expect
      .poll(() => document.querySelector('[data-connection-dialog]') === null, { timeout: 5000 })
      .toBe(true)
    await page.screenshot({ path: './playwright-screenshots/nas-connected.png' })
  })

  test('failed connect shows error message', async () => {
    const nasAction = async () => ({
      success: false,
      error: 'Login failed.'
    })
    await renderHome(null, { '/api/nas': nasAction })

    await userEvent.click(page.getByText('Connect'))
    await userEvent.fill(
      page.getByRole('textbox', { name: 'NAS Hostname' }),
      'https://nas.local:5001'
    )
    await userEvent.fill(page.getByRole('textbox', { name: 'Username' }), 'admin')
    await userEvent.fill(page.getByRole('textbox', { name: 'Password' }), 'wrong')
    await userEvent.click(page.getByRole('button', { name: 'Connect' }))

    await expect
      .poll(() => document.querySelector('[data-connection-dialog]') !== null, { timeout: 5000 })
      .toBe(true)
    await page.screenshot({ path: './playwright-screenshots/nas-login-failed.png' })
  })

  test('Disconnect returns to disconnected state', async () => {
    let nasPayload: unknown = null
    const nasAction = async ({ request }: { request: Request }) => {
      const body = await request.json()
      nasPayload = body
      if (body.intent === 'status')
        return { connected: true, hostname: 'https://nas.local:5001', username: 'admin' }
      if (body.intent === 'disconnect') return { connected: false }
      return { connected: false }
    }
    await renderHome(null, { '/api/nas': nasAction })

    await expect.element(page.getByText('NAS Connected')).toBeInTheDocument()
    await userEvent.click(page.getByText('Disconnect'))

    await expect.poll(() => nasPayload !== null, { timeout: 5000 }).toBe(true)
    expect(nasPayload).toEqual({ intent: 'disconnect' })
  })
})

describe('Upload with NAS connection', () => {
  const makeManifest = () => ({
    version: 1,
    status: 'proposed' as const,
    date: '2026-08-24',
    startDatetime: '2026-08-24T10:00:00.000Z',
    createdAt: '2026-08-24T10:00:00.000Z',
    theory: [],
    files: [
      { path: '/output/DJI_0001.MP4', size: 1000, mtime: 1724493600, filename: 'DJI_0001.MP4' }
    ],
    jumps: [
      {
        id: 'jump_01',
        label: 'jump_01',
        confirmed: false,
        processed: true,
        passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
        files: [
          { path: '/output/DJI_0001.MP4', size: 1000, mtime: 1724493600, filename: 'DJI_0001.MP4' }
        ]
      }
    ]
  })

  test('upload button opens connection dialog when not connected', async () => {
    const nasAction = async () => ({ connected: false })
    await renderHome(makeManifest(), { '/api/nas': nasAction })
    await expect.element(page.getByText('NAS Disconnected')).toBeInTheDocument()

    const uploadBtn = document.querySelector('[data-action="upload"]') as HTMLButtonElement
    expect(uploadBtn.disabled).toBe(false)
    await userEvent.click(page.elementLocator(uploadBtn))

    await expect.element(page.getByText('Connect to NAS')).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/nas-upload-requires-connect.png' })
  })

  test('upload proceeds when connected', async () => {
    let manifestPayload: unknown = null
    const nasAction = async () => ({
      connected: true,
      hostname: 'https://nas.local:5001',
      username: 'admin'
    })
    const manifestAction = async ({ request }: { request: Request }) => {
      manifestPayload = await request.json()
      const body = manifestPayload as { intent: string }
      if (body.intent === 'upload-jump') {
        return {
          jumps: [
            {
              ...makeManifest().jumps[0],
              publish: { shareUrl: 'https://nas.local:5001/sharing/abc123' }
            }
          ]
        }
      }
      return { ok: true }
    }
    await renderHome(makeManifest(), { '/api/manifest': manifestAction, '/api/nas': nasAction })

    await expect.element(page.getByText('NAS Connected')).toBeInTheDocument()
    const uploadBtn = document.querySelector('[data-action="upload"]') as HTMLButtonElement
    expect(uploadBtn.disabled).toBe(false)
    await userEvent.click(page.elementLocator(uploadBtn))

    await expect.poll(() => manifestPayload !== null, { timeout: 5000 }).toBe(true)
    expect((manifestPayload as { intent: string }).intent).toBe('upload-jump')
  })
})
