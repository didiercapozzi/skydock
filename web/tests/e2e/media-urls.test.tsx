import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* The board addresses a file by its path inside the folder this machine keeps the work in — which
   the machine tells it, since an installed app keeps the work wherever it was asked to. */

const OUTPUT = '/home/capo/Movies/SkyDock'
const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const clip = (id: string, at: number) => ({
  id,
  path: `${OUTPUT}/original_files/2026-08-01/${id}.MP4`,
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
      files: [clip('one', AT), clip('two', AT + 30)]
    }
  ],
  looseFiles: [],
  destinations: [],
  outputs: {},
  proxies: {},
  tandems: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, defaultFolder: null, backupFolder: null },
  outputDir: OUTPUT
}

describe('the pictures the board shows', () => {
  test('are asked for by the path inside the folder this machine works in', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(page.getByText('two.MP4').first()).toBeInTheDocument()
    await expect
      .poll(() => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src')))
      .toContain('/api/thumb/original_files/2026-08-01/two.MP4?seek=0.5&width=80')
  })
})
