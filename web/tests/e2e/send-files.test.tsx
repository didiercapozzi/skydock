import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { setSendPlan } from '../../app/hooks/useSendPlan'
import { boardOf, boardRoute } from './board-route'

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, name: string, mtime: number) => ({
  id,
  path: `/o/${name}`,
  filename: name,
  size: 1024,
  mtime
})

const board = boardOf({
  looseFiles: [
    file('v1', 'GX010001.MP4', AT),
    file('v2', 'GX010002.MP4', AT + 60),
    file('p1', 'G0010003.JPG', AT + 120)
  ],
  destinations: [
    { name: 'Backup', path: '/Backup' },
    { name: 'Passengers', path: '/SkyDock/Passengers' }
  ],
  nas: { connected: true, hostname: 'nas.local', backupFolder: '/Backup' }
})

const requests: unknown[] = []

const pickAndAsk = async () => {
  setSendPlan({ zips: [], placed: { videos: ['Backup'], photos: ['Backup'] } })
  requests.length = 0
  const Stub = createRoutesStub([
    boardRoute(() => board),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        requests.push(await request.json())
        return { ok: true }
      }
    },
    { path: '/api/nas', action: () => ({ ok: true }) },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('button', { name: /^Loose files/ }))
  for (const name of [/GX010001\.MP4/, /GX010002\.MP4/, /G0010003\.JPG/])
    await userEvent.click(page.getByRole('button', { name }).last(), {
      modifiers: ['ControlOrMeta']
    })
  await userEvent.click(page.getByRole('button', { name: /Send these to the storage/ }))
}

describe('sending picked files', () => {
  test('offers the picked clips and photos as parts, with no film to wait for', async () => {
    await pickAndAsk()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await expect.element(dialog.getByText('Original videos').first()).toBeVisible()
    await expect.element(dialog.getByText('Original photos').first()).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Upload', exact: true }))
      .toBeEnabled()
    expect(requests).toEqual([])
  })

  test('sends the picked files as they were arranged, only from its own button', async () => {
    await pickAndAsk()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'send-files',
        fileIds: ['v1', 'v2', 'p1'],
        name: 'files',
        plan: expect.objectContaining({ placed: expect.objectContaining({ videos: ['Backup'] }) })
      })
    )
  })
})
