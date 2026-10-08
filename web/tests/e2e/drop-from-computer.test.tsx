import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { droppedFiles, droppedIn, fromComputer, pathOf, whatIsComing } from '../../app/helpers/import'
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
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

/* the machine behind the board: it takes one file per request and says it took it */
const asked: string[] = []
/* what each drop said it was made of, before its first file was sent */
const began: string[] = []
const realFetch = globalThis.fetch

const machineTakes = () =>
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const said = String(url)
    if (!said.includes('/api/import')) return await realFetch(url, init)
    /* the drop is told to the server first, and again when it is over: answered at once */
    if (said.includes('begin=1')) began.push(String(init?.body))
    if (said.includes('begin=1') || said.includes('end=1'))
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    asked.push(said)
    return new Response(JSON.stringify({ ok: true, outcome: 'added', filename: 'from-phone.mp4' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })

/* the machine, taking its time over each file, so what the board shows while it works can be seen */
const machineTakesItsTime = () => {
  let letGo: (() => void) | null = null
  const finish = () => letGo?.()
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const said = String(url)
    if (!said.includes('/api/import')) return await realFetch(url, init)
    /* the drop is told to the server first, and again when it is over: answered at once */
    if (said.includes('begin=1')) began.push(String(init?.body))
    if (said.includes('begin=1') || said.includes('end=1'))
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      })
    asked.push(said)
    await new Promise<void>((resolve) => {
      letGo = resolve
    })
    return new Response(JSON.stringify({ ok: true, outcome: 'added', filename: 'a.mp4' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })
  return finish
}

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
  vi.stubGlobal('skydock', undefined)
  asked.length = 0
  began.length = 0
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
      .element(page.getByText(/Drop a clip on a destination, a montage or a jump/))
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

/* A whole folder let go of on the board is not itself copied: everything of ours inside it is, and
   inside the folders inside it (RULES, Adding files from the computer). Nothing can originate a
   drag of a real folder from the machine's own file manager, so what the engine hands over for one
   is made here — an entry that says it is a directory, which is the whole of how a folder is known
   from a file. */
describe('a folder dragged in from the computer', () => {
  const asDirectory = (name: string) => ({ isDirectory: true, isFile: false, name })

  const lettingGoOf = (
    items: { kind: string; getAsFile: () => File | null; webkitGetAsEntry?: () => unknown }[]
  ) =>
    droppedIn({ dataTransfer: { files: [], items } } as unknown as Parameters<typeof droppedIn>[0])

  test('is handed over by its address, for the server to look inside', () => {
    windowSays('/media/card')
    expect(
      lettingGoOf([
        { kind: 'file', getAsFile: () => new File([], 'card'), webkitGetAsEntry: () => asDirectory('card') }
      ])
    ).toEqual([{ folderAt: '/media/card' }])
  })

  test('is kept as the engine gave it in a browser, which has no address to give', () => {
    const entry = asDirectory('card')
    expect(
      lettingGoOf([
        { kind: 'file', getAsFile: () => new File([], 'card'), webkitGetAsEntry: () => entry }
      ])
    ).toEqual([{ folder: entry }])
  })

  test('comes to the videos and photos inside it, each named and sized', async () => {
    vi.stubGlobal('fetch', async (url: string | URL) =>
      String(url).includes('/api/dropped')
        ? new Response(
            JSON.stringify({
              files: [
                { path: '/media/card/DCIM/GX010001.MP4', name: 'GX010001.MP4', size: 12 },
                { path: '/media/card/DCIM/GX010002.MP4', name: 'GX010002.MP4', size: 34 }
              ]
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        : new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    )

    expect(await whatIsComing([{ folderAt: '/media/card' }])).toEqual([
      { what: '/media/card/DCIM/GX010001.MP4', name: 'GX010001.MP4', size: 12 },
      { what: '/media/card/DCIM/GX010002.MP4', name: 'GX010002.MP4', size: 34 }
    ])
  })
})

/* What is about to be copied, said before it is: a drop of a card's worth of clips is something to
   watch rather than something to wait out (RULES, Adding files from the computer). */
describe('while a drop is being copied in', () => {
  const carryingTwoClips = () => {
    const carried = new DataTransfer()
    carried.items.add(new File(['0'], 'GX010001.MP4', { type: 'video/mp4' }))
    carried.items.add(new File(['0'], 'GX010002.MP4', { type: 'video/mp4' }))
    return carried
  }

  test('the server is told what is coming, and where it is going, before the first file is sent', async () => {
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingTwoClips)

    await expect.poll(() => began.length).toBe(1)
    const said = JSON.parse(began[0] ?? '{}')
    expect(said.where).toBe('Yverdon')
    expect(said.files.map((file: { name: string }) => file.name)).toEqual([
      'GX010001.MP4',
      'GX010002.MP4'
    ])
    finish()
  })
})

/* One long clip is minutes of nothing to look at unless the bar follows the copy itself, so the
   server says how far through the file it is and the board draws it (RULES, Adding files from the
   computer). The stream is stood in for here; what it feeds is the real event. */
describe('while one large file is being copied in', () => {
  let stream: { onmessage: ((message: { data: string }) => void) | null; close: () => void } | null

  const theStreamOpens = () => {
    stream = null
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((message: { data: string }) => void) | null = null
        close = vi.fn()
        constructor() {
          stream = this
        }
      }
    )
  }

  const serverSays = (event: unknown) => stream?.onmessage?.({ data: JSON.stringify(event) })

  /* what the server says of the drop: the job, and then each file's row as it moves */
  const dropBegins = (names: string[]) =>
    serverSays({
      kind: 'job',
      id: 'drop',
      type: 'import',
      label: 'Yverdon',
      stage: 'working',
      done: 0,
      total: names.length,
      rows: names.map((name, at) => ({ key: `drop-${at}`, name, size: 2048, at: 'later' }))
    })
  const rowSays = (key: string, row: object) =>
    serverSays({
      kind: 'job',
      id: 'drop',
      type: 'import',
      label: 'Yverdon',
      stage: 'working',
      done: 0,
      total: 1,
      row: { key, at: 'now', ...row }
    })

  const carryingThreeClips = () => {
    const carried = new DataTransfer()
    for (const n of [1, 2, 3])
      carried.items.add(new File(['x'.repeat(2048)], `GX01000${n}.MP4`, { type: 'video/mp4' }))
    return carried
  }

  const carryingOneLongClip = () => {
    const carried = new DataTransfer()
    carried.items.add(new File(['x'.repeat(2048)], 'GX010001.MP4', { type: 'video/mp4' }))
    return carried
  }

  test('the bar follows the file, not only the count of files', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingOneLongClip)

    await expect.poll(() => asked[0]).toContain('key=drop-0')
    dropBegins(['GX010001.MP4'])
    const panel = page.getByRole('complementary', { name: /Adding Yverdon/ })
    await expect.element(panel).toBeInTheDocument()
    await expect.poll(() => asked[0]).toContain('size=2048')

    rowSays('drop-0', { part: 0.5 })
    await expect.poll(() => panel.element().textContent).toContain('50%')

    rowSays('drop-0', { part: 0.9 })
    await expect.poll(() => panel.element().textContent).toContain('90%')

    finish()
  })

  /* The whole drop and the one file are two different things to know. A card of fifty clips moves
     the drop's bar by a fiftieth per file, which reads as nothing happening, so the file being
     copied has a bar of its own that goes the whole way whatever else is coming. */
  test('the file being copied has a bar of its own, whatever else is coming', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingThreeClips)

    dropBegins(['GX010001.MP4', 'GX010002.MP4', 'GX010003.MP4'])
    const panel = page.getByRole('complementary', { name: /Adding Yverdon/ })
    await expect.element(panel).toBeInTheDocument()

    /* the file about to be copied is begun the moment its request arrives */
    rowSays('drop-0', { part: 0 })
    const its = page.getByRole('progressbar', { name: 'Copying GX010001.MP4' })
    await expect.element(its).toHaveAttribute('aria-valuenow', '0')

    rowSays('drop-0', { part: 0.75 })

    /* three quarters through this file, though the drop as a whole is a quarter through */
    await expect.element(its).toHaveAttribute('aria-valuenow', '75')
    /* and only the one being copied has one */
    expect(page.getByRole('progressbar', { name: /^Copying/ }).elements()).toHaveLength(1)

    finish()
  })

  /* The bytes are all in and the file is being read — still something happening, and the bar stays
     where it got to, so it does not read as a copy starting again. */
  test('the bar stays full while what landed is being read', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingOneLongClip)

    dropBegins(['GX010001.MP4'])
    const panel = page.getByRole('complementary', { name: /Adding Yverdon/ })
    await expect.element(panel).toBeInTheDocument()
    rowSays('drop-0', { part: 0.5 })
    await expect.poll(() => panel.element().textContent).toContain('50%')

    rowSays('drop-0', { part: 1, phase: 'reading' })

    await expect.poll(() => panel.element().textContent).toContain('reading it…')
    await expect.poll(() => panel.element().textContent).not.toContain('50%')
    finish()
  })

  /* another window's drop, or one already over, says nothing about the row being drawn here */
  test('an answer about some other copy is left out', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingOneLongClip)

    dropBegins(['GX010001.MP4'])
    const panel = page.getByRole('complementary', { name: /Adding Yverdon/ })
    await expect.element(panel).toBeInTheDocument()

    rowSays('drop-7', { part: 0.5 })
    await expect.poll(() => panel.element().textContent).not.toContain('50%')

    finish()
  })
})
