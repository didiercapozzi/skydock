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

const machineTakesItsTime = () => {
  let letGo: (() => void) | null = null
  const finish = () => letGo?.()
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const said = String(url)
    if (!said.includes('/api/import')) return await realFetch(url, init)
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
})

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

  test('is taken by its address when the window says where it is', async () => {
    machineTakes()
    windowSays('/home/capo/Videos/from phone.mp4')
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element())

    await expect.poll(() => asked).toHaveLength(1)
    expect(asked[0]).toContain('target=dest%3AYverdon')
    expect(asked[0]).toContain('path=%2Fhome%2Fcapo%2FVideos%2Ffrom+phone.mp4')
  })

  test('is kept, and not opened over the board, where nothing takes it', async () => {
    machineTakes()
    await openYverdon()

    const dropped = letGoOn(page.getByRole('complementary').element())

    expect(dropped.defaultPrevented).toBe(true)
    await expect
      .element(page.getByText(/Drop a clip on a destination, a montage or a jump/))
      .toBeInTheDocument()
    expect(asked).toEqual([])
  })

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

describe('while a drop is being copied in', () => {
  const carryingTwoClips = () => {
    const carried = new DataTransfer()
    carried.items.add(new File(['0'], 'GX010001.MP4', { type: 'video/mp4' }))
    carried.items.add(new File(['0'], 'GX010002.MP4', { type: 'video/mp4' }))
    return carried
  }

  test('the board lists what is coming, and where it is going', async () => {
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingTwoClips)

    const panel = page.getByRole('complementary', { name: /Adding 2 to Yverdon/ })
    await expect.element(panel).toBeInTheDocument()
    await expect.element(panel.getByText('GX010001.MP4')).toBeInTheDocument()
    await expect.element(panel.getByText('GX010002.MP4')).toBeInTheDocument()
    await expect
      .element(panel.getByRole('progressbar', { name: 'Copied into Yverdon' }))
      .toBeInTheDocument()
    finish()
  })
})

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

    const panel = page.getByRole('complementary', { name: /Adding 1 to Yverdon/ })
    await expect.element(panel).toBeInTheDocument()
    await expect.poll(() => asked[0]).toContain('token=drop-0')
    await expect.poll(() => asked[0]).toContain('size=2048')

    serverSays({ kind: 'import', token: 'drop-0', done: 1024, total: 2048, phase: 'copying' })
    await expect.poll(() => panel.element().textContent).toContain('50%')

    serverSays({ kind: 'import', token: 'drop-0', done: 1843, total: 2048, phase: 'copying' })
    await expect.poll(() => panel.element().textContent).toContain('90%')

    finish()
  })

  test('the file being copied has a bar of its own, whatever else is coming', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingThreeClips)

    const panel = page.getByRole('complementary', { name: /Adding 3 to Yverdon/ })
    await expect.element(panel).toBeInTheDocument()

    const its = page.getByRole('progressbar', { name: 'Copying GX010001.MP4' })
    await expect.element(its).toHaveAttribute('aria-valuenow', '0')

    serverSays({ kind: 'import', token: 'drop-0', done: 1536, total: 2048, phase: 'copying' })

    await expect.element(its).toHaveAttribute('aria-valuenow', '75')
    expect(page.getByRole('progressbar', { name: /^Copying/ }).elements()).toHaveLength(1)

    finish()
  })

  test('the bar stays full while what landed is being read', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingOneLongClip)

    const panel = page.getByRole('complementary', { name: /Adding 1 to Yverdon/ })
    await expect.element(panel).toBeInTheDocument()
    serverSays({ kind: 'import', token: 'drop-0', done: 1024, total: 2048, phase: 'copying' })
    await expect.poll(() => panel.element().textContent).toContain('50%')

    serverSays({ kind: 'import', token: 'drop-0', done: 2048, total: 2048, phase: 'reading' })

    await expect.poll(() => panel.element().textContent).toContain('reading it…')
    await expect.poll(() => panel.element().textContent).not.toContain('50%')
    finish()
  })

  test('an answer about some other copy is left out', async () => {
    theStreamOpens()
    const finish = machineTakesItsTime()
    await openYverdon()

    letGoOn(page.getByRole('region', { name: /Yverdon/ }).element(), carryingOneLongClip)

    const panel = page.getByRole('complementary', { name: /Adding 1 to Yverdon/ })
    await expect.element(panel).toBeInTheDocument()

    serverSays({ kind: 'import', token: 'drop-7', done: 1024, total: 2048, phase: 'copying' })
    await expect.poll(() => panel.element().textContent).not.toContain('50%')

    finish()
  })
})
