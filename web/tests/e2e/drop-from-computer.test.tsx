import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { droppedFiles, fromComputer, pathOf } from '../../app/helpers/import'
import { boardRoute } from './board-route'

/* A video from the computer, let go on the board (RULES, The board — Adding files from the
   computer). Where it lands decides where it goes, and where nothing takes it the board says so and
   keeps it: a file nobody wanted is what an engine opens, and an opened video over SkyDock's own
   window leaves no way back to the board.

   In SkyDock's own window the file's address comes with it, and the address is what travels: the
   server is on the same machine, and sending the bytes would be copying a jump's rushes to reach a
   folder they are already sitting in. In a browser there is no address and the bytes are what go.

   Nothing can originate a drag from the machine's own file manager, so the drag is made here and
   the events are dispatched — the one thing in these tests that cannot be a real user action. What
   is dispatched is real: a DragEvent, with a real DataTransfer holding a real file. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const board = {
  groups: [],
  looseFiles: [
    {
      id: 'one',
      path: '/o/original_files/2026-08-01/GX01.MP4',
      filename: 'GX01.MP4',
      size: 1,
      mtime: AT,
      destination: 'Yverdon'
    }
  ],
  destinations: [{ name: 'Yverdon', path: '/SkyDock/Yverdon' }],
  outputs: {},
  proxies: {},
  tandems: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

/* the machine behind the board: it takes one file per request and says it took it */
const asked: string[] = []
const realFetch = globalThis.fetch

const machineTakes = () =>
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const said = String(url)
    if (!said.includes('/api/import')) return await realFetch(url, init)
    asked.push(said)
    return new Response(JSON.stringify({ ok: true, outcome: 'added', filename: 'from-phone.mp4' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
  vi.stubGlobal('skydock', undefined)
  asked.length = 0
})

/* the window around the board, which can say where a dropped file already is */
const windowSays = (where: string) => vi.stubGlobal('skydock', { pathOf: () => where })

const openYverdon = async () => {
  const Stub = createRoutesStub([
    boardRoute(() => board),
    { path: '/api/manifest', action: async () => ({ ok: true }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('link', { name: /Yverdon/ }).first())
  await expect.element(page.getByRole('region', { name: /Yverdon/ })).toBeInTheDocument()
}

/* a clip carried in from the machine, as the engine hands it over */
const carryingAClip = () => {
  const carried = new DataTransfer()
  carried.items.add(new File(['0'], 'from-phone.mp4', { type: 'video/mp4' }))
  return carried
}

const letGoOn = (where: Element, carrying = carryingAClip) => {
  const carried = carrying()
  where.dispatchEvent(
    new DragEvent('dragover', { dataTransfer: carried, bubbles: true, cancelable: true })
  )
  const dropped = new DragEvent('drop', {
    dataTransfer: carried,
    bubbles: true,
    cancelable: true
  })
  where.dispatchEvent(dropped)
  return dropped
}

describe('a clip dragged in from the computer', () => {
  test('is added to the place it is let go on', async () => {
    machineTakes()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element())

    await expect.poll(() => asked).toHaveLength(1)
    expect(asked[0]).toContain('target=dest%3AYverdon')
    expect(asked[0]).toContain('filename=from-phone.mp4')
  })

  /* Where the file already is beats a copy of it: the server is on this very machine. */
  test('is taken by its address when the window says where it is', async () => {
    machineTakes()
    windowSays('/home/capo/Videos/from phone.mp4')
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element())

    await expect.poll(() => asked).toHaveLength(1)
    expect(asked[0]).toContain('target=dest%3AYverdon')
    expect(asked[0]).toContain('path=%2Fhome%2Fcapo%2FVideos%2Ffrom+phone.mp4')
  })

  /* the whole of what keeps the board on screen: an engine opens what the page would not take */
  test('is kept, and not opened over the board, where nothing takes it', async () => {
    machineTakes()
    await openYverdon()

    /* the panel on the right: part of the board, and no place for a file */
    const dropped = letGoOn(page.getByRole('complementary').element())

    expect(dropped.defaultPrevented).toBe(true)
    await expect
      .element(page.getByText(/Drop a clip on a place, a passenger or a jump/))
      .toBeInTheDocument()
    expect(asked).toEqual([])
  })

  /* Caught without asking what it is: an engine that names the drag in words the board does not know
     would otherwise walk straight past every question it asks and open the file anyway. */
  test('is kept even when nothing about the drag says it is a file', async () => {
    machineTakes()
    await openYverdon()

    const words = () => {
      const carried = new DataTransfer()
      carried.setData('text/plain', 'not a clip at all')
      return carried
    }
    const dropped = letGoOn(page.getByRole('complementary').element(), words)

    expect(dropped.defaultPrevented).toBe(true)
    expect(asked).toEqual([])
  })
})

/* A drag carrying files says so, and that is what tells the board to stop the engine opening one. */
describe('a drag the board has to recognise as files', () => {
  const saying = (types: string[]) =>
    fromComputer({ dataTransfer: { types } } as unknown as Parameters<typeof fromComputer>[0])

  test('says so when the drag lists files', () => {
    expect(saying(['Files'])).toBe(true)
  })

  test('says nothing of a drag that carries only words', () => {
    expect(saying(['text/plain'])).toBe(false)
  })
})

/* Where a dropped file is, which only the app around the board can say. */
describe('the address of a dropped file', () => {
  const clip = new File(['0'], 'from-phone.mp4', { type: 'video/mp4' })

  test('is what the window says, when there is a window to ask', () => {
    windowSays('/home/capo/Videos/from phone.mp4')
    expect(pathOf(clip)).toBe('/home/capo/Videos/from phone.mp4')
  })

  test('is nothing in a browser, where the bytes are all there is', () => {
    expect(pathOf(clip)).toBeNull()
  })
})

/* And the bytes are asked for the same way wherever they come from: one engine fills the list of
   files; another leaves it empty and holds the same clip in the items of the drag. */
describe('the files a drop hands over', () => {
  const clip = new File(['0'], 'from-phone.mp4', { type: 'video/mp4' })
  const handing = (files: File[], items: { kind: string; getAsFile: () => File | null }[]) =>
    droppedFiles({ dataTransfer: { files, items } } as unknown as Parameters<
      typeof droppedFiles
    >[0])

  test('are the ones it lists, when it lists any', () => {
    expect(handing([clip], [])).toEqual([clip])
  })

  test('are asked of the items when the list is empty', () => {
    expect(handing([], [{ kind: 'file', getAsFile: () => clip }])).toEqual([clip])
  })

  test('are none when the drag holds no file at all', () => {
    expect(handing([], [{ kind: 'string', getAsFile: () => null }])).toEqual([])
  })
})
