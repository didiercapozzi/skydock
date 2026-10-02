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

/* A trimmed clip opens where its trim starts — the moment the copy made from it begins — and
   stepping to another clip opens that clip's own trim (RULES, Cropping and turning). */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const clip = (id: string, at: number, crop: { cropStart: number; cropEnd: number }) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: at,
  ...crop
})

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      files: [
        clip('early', AT, { cropStart: 5, cropEnd: 20 }),
        clip('later', AT + 30, { cropStart: 12, cropEnd: 30 })
      ]
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

const dialog = () => page.getByRole('dialog', { name: 'Preview' })
const said = () => dialog().element().textContent ?? ''

describe('a trimmed clip in the preview', () => {
  test('opens where its trim starts', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await userEvent.click(page.getByRole('button', { name: /^Jump 1,/ }))
    await userEvent.dblClick(page.getByRole('button', { name: /later\.MP4/ }).first())

    await expect.poll(said).toContain('0:12 /')
    await expect.poll(said).toContain('Start 0:12')
  })

  test('opens the next clip on its own trim, not the one just left', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('button', { name: /^Jump 1,/ }))
    await userEvent.dblClick(page.getByRole('button', { name: /early\.MP4/ }).first())
    await expect.poll(said).toContain('0:05 /')

    await userEvent.click(page.getByRole('button', { name: /Next/ }))

    await expect.poll(said).toContain('0:12 /')
    await expect.poll(said).toContain('Start 0:12')
  })
})
