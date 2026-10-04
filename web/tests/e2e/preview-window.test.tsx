import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* A file is looked at in a window of its own in SkyDock's own window (RULES, The preview): the board asks
   for one by opening the file's address with a mark in it, and that address draws the file alone, filling
   the window, which closes itself when the file is. Outside it, the file opens over the board as ever. */

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
    { id: 'g1', label: 'g1', day: '01.08.2026', files: [clip('early', AT), clip('later', AT + 30)] }
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

const sent: string[] = []
let release: () => void = () => {}

/* the manifest route answers only when told to, so what happens before the answer can be looked at */
const mount = (at: string) =>
  render(
    createElement(
      createRoutesStub([
        boardRoute(() => board),
        {
          path: '/api/manifest',
          action: async ({ request }: { request: Request }) => {
            sent.push(String(((await request.json()) as { intent?: string }).intent))
            await new Promise<void>((resolve) => (release = resolve))
            return { groups: [] }
          }
        }
      ]),
      { initialEntries: [at] }
    )
  )

afterEach(() => {
  sent.length = 0
  vi.restoreAllMocks()
  delete (window as { skydock?: unknown }).skydock
})

describe('a file in a window of its own', () => {
  test('is asked for by SkyDock’s own window, and does not open over the board', async () => {
    ;(window as { skydock?: unknown }).skydock = {}
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    await mount('/')
    await userEvent.click(page.getByRole('button', { name: /^Jump 1,/ }))

    await userEvent.dblClick(page.getByRole('button', { name: /later\.MP4/ }).first())

    await vi.waitFor(() => expect(opened).toHaveBeenCalled())
    const asked = String(opened.mock.calls[0]?.[0])
    expect(decodeURIComponent(asked)).toMatch(/\/file\/later\?.*"window":"preview"/)
    await expect.element(page.getByRole('dialog', { name: 'Preview' })).not.toBeInTheDocument()
  })

  test('opens over the board in a plain browser, as it always did', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    await mount('/')
    await userEvent.click(page.getByRole('button', { name: /^Jump 1,/ }))

    await userEvent.dblClick(page.getByRole('button', { name: /later\.MP4/ }).first())

    await expect.element(page.getByRole('dialog', { name: 'Preview' })).toBeInTheDocument()
    expect(opened).not.toHaveBeenCalled()
  })

  test('draws only the file at its address, and closes the window with the file', async () => {
    const closed = vi.spyOn(window, 'close').mockImplementation(() => {})
    await mount(`/sort/file/later?q=${encodeURIComponent(JSON.stringify({ window: 'preview' }))}`)

    await expect.element(page.getByRole('dialog', { name: 'Preview' })).toBeVisible()
    await expect.element(page.getByRole('navigation', { name: 'Folders' })).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Cancel' }))
    expect(closed).toHaveBeenCalled()
  })

  /* Saving closes the window, but only once the save has landed: a page closed first takes the request
     that was on its way with it, and what was decided is lost. */
  test('is closed by Save only after the save has been answered', async () => {
    const closed = vi.spyOn(window, 'close').mockImplementation(() => {})
    await mount(`/sort/file/later?q=${encodeURIComponent(JSON.stringify({ window: 'preview' }))}`)
    await userEvent.click(page.getByRole('button', { name: 'Turn', exact: true }))
    await userEvent.click(page.getByRole('button', { name: '↻ +90°' }))

    await userEvent.click(page.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(sent).toContain('save-groups'))
    /* asked, and not yet answered: the window is still there */
    expect(closed).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(closed).toHaveBeenCalled())
  })

  /* another window saved through the same server, which does not tell a board about its own writes:
     the windows tell each other, and the board looks at the record again */
  test('is heard about by the board, which looks at the record again', async () => {
    await mount('/')
    await expect.element(page.getByRole('navigation', { name: 'Folders' })).toBeVisible()

    const peer = new BroadcastChannel('skydock-board')
    peer.postMessage('saved')
    peer.close()

    await vi.waitFor(() => expect(sent).toContain('look-at-board'))
    release()
  })
})
