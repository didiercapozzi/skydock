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
   the machine tells it, since an installed app keeps the work wherever it was asked to. Every
   picture it draws is asked for at the size it is drawn at, a photo as much as a clip: a day of
   photos drawn from the originals is tens of megabytes decoded to fill eighty pixels. A clip is
   asked of its small copy once it has one — the same frame, cut in a third of the time, which is
   most of the wait between opening a jump and seeing it. */

const OUTPUT = '/home/capo/Movies/SkyDock'
const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const shot = (name: string, at: number) => ({
  id: name,
  path: `${OUTPUT}/original_files/2026-08-01/${name}`,
  filename: name,
  size: 1,
  mtime: at
})

const clip = (id: string, at: number) => shot(`${id}.MP4`, at)

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      files: [clip('one', AT), clip('two', AT + 30), shot('G0091.JPG', AT + 60)]
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
  nas: { connected: false, hostname: null, backupFolder: null },
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

  /* a photo used to be drawn from the original, a megabyte and a full decode for eighty pixels */
  test('ask for a photo at the size it is drawn at, not the whole of it', async () => {
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(page.getByText('G0091.JPG').first()).toBeInTheDocument()
    const drawn = () =>
      [...document.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '')
    await expect
      .poll(drawn)
      .toContain('/api/thumb/original_files/2026-08-01/G0091.JPG?seek=0.5&width=80')
  })

  /* seeking a 4K original for an eighty-pixel square costs three times what the copy costs, and a
     jump of sixteen clips is sixteen of those */
  test('cut a clip’s frame from its small copy, once it has one', async () => {
    const withProxy = {
      ...board,
      proxies: {
        [`${OUTPUT}/original_files/2026-08-01/two.MP4`]: {
          state: 'ready' as const,
          play: `${OUTPUT}/proxies/two.mp4`
        }
      }
    }
    const Stub = createRoutesStub([boardRoute(() => withProxy)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(page.getByText('two.MP4').first()).toBeInTheDocument()
    const drawn = () =>
      [...document.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '')
    await expect.poll(drawn).toContain('/api/thumb/proxies/two.mp4?seek=0.5&width=80')
    /* the one without a copy yet is still cut from itself */
    expect(drawn()).toContain('/api/thumb/original_files/2026-08-01/one.MP4?seek=0.5&width=80')
    expect(drawn().some((src) => src.startsWith('/api/file/'))).toBe(false)
  })
})
