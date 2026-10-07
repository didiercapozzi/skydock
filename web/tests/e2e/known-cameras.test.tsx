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

/* The cameras this machine has met (RULES, Cameras): a camera never met asks what to be done about it,
   and a camera known has a page of its own — plugged in or not — to switch its automatic copy and to
   forget it. The machine is stood in for by the stream it speaks on, and the answers it is sent are
   caught. */

const KEY = 'name:HERO5 Black'
const MOUNT = '/mnt/osmo/HERO5'

const board = {
  groups: [],
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

let stream: { onmessage: ((message: { data: string }) => void) | null } | null = null
const silent = globalThis.EventSource
const sent: unknown[] = []

const mounted = (over: Record<string, unknown> = {}) => ({
  camera: 'HERO5 Black',
  mount: MOUNT,
  over: 'drive',
  key: KEY,
  known: false,
  auto: false,
  fresh: 3,
  ...over
})

const known = (over: Record<string, unknown> = {}) => ({
  key: KEY,
  name: 'HERO5 Black',
  auto: false,
  lastSeen: 1_785_000_000,
  ...over
})

const says = (event: { mounted: unknown[]; known: unknown[]; prompts: string[] }) =>
  stream?.onmessage?.({ data: JSON.stringify({ kind: 'cameras', ...event }) })

const renderBoard = async (at = '/') => {
  sent.length = 0
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: ((message: { data: string }) => void) | null = null
      close = () => {}
      constructor() {
        stream = this
      }
    }
  )
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST') sent.push(JSON.parse(String(init.body)))
    return Response.json({ cameras: [] })
  })
  const Stub = createRoutesStub([
    boardRoute(() => board),
    {
      path: '/api/camera',
      action: async ({ request }: { request: Request }) => {
        sent.push(await request.json())
        return { ok: true }
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: [at] }))
}

afterEach(() => {
  vi.stubGlobal('EventSource', silent)
})

describe('a camera never met', () => {
  const ask = async () => {
    await renderBoard()
    says({ mounted: [mounted()], known: [], prompts: [MOUNT] })
    await expect.element(page.getByRole('dialog', { name: 'A new camera' })).toBeVisible()
  }

  test('asks what to do, with copying by itself left unticked', async () => {
    await ask()

    await expect
      .element(page.getByRole('checkbox', { name: /Copy new files automatically from now on/ }))
      .not.toBeChecked()
    await expect.element(page.getByRole('button', { name: 'Copy the 3 new files' })).toBeVisible()
    expect(sent).toEqual([])
  })

  test('remembers it and copies nothing when asked to just remember it', async () => {
    await ask()

    await userEvent.click(page.getByRole('button', { name: 'Just remember it' }))

    await expect.poll(() => sent).toEqual([{ remember: { key: KEY, auto: false, copy: false } }])
  })

  test('remembers it without copying and opens its page when asked to choose which files', async () => {
    await ask()

    await userEvent.click(page.getByRole('button', { name: 'Choose which files…' }))

    await expect.poll(() => sent).toEqual([{ remember: { key: KEY, auto: false, copy: false } }])
    /* the machine now knows the camera, as it says once it has been remembered */
    says({ mounted: [mounted({ known: true })], known: [known()], prompts: [] })
    await expect
      .element(page.getByRole('switch', { name: /Copy new files automatically/ }))
      .toBeVisible()
  })

  test('carries the ticked box along when choosing which files', async () => {
    await ask()

    await userEvent.click(
      page.getByRole('checkbox', { name: /Copy new files automatically from now on/ })
    )
    await userEvent.click(page.getByRole('button', { name: 'Choose which files…' }))

    await expect.poll(() => sent).toEqual([{ remember: { key: KEY, auto: true, copy: false } }])
  })

  test('copies the new files, and from now on by itself, once the box is ticked', async () => {
    await ask()

    await userEvent.click(
      page.getByRole('checkbox', { name: /Copy new files automatically from now on/ })
    )
    await userEvent.click(page.getByRole('button', { name: 'Copy the 3 new files' }))

    await expect.poll(() => sent).toEqual([{ remember: { key: KEY, auto: true, copy: true } }])
  })

  test('is remembered without copying when it is closed with Escape', async () => {
    await ask()

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => sent).toEqual([{ remember: { key: KEY, auto: false, copy: false } }])
  })

  test('asks nothing of a camera already met', async () => {
    await renderBoard()

    says({ mounted: [mounted({ known: true })], known: [known()], prompts: [] })

    await expect.element(page.getByRole('link', { name: /HERO5 Black/ })).toBeVisible()
    await expect.element(page.getByRole('dialog', { name: 'A new camera' })).not.toBeInTheDocument()
  })
})

describe('the page of a camera plugged in', () => {
  const open = async () => {
    await renderBoard(`/camera/${encodeURIComponent(KEY)}`)
    says({ mounted: [mounted({ known: true })], known: [known()], prompts: [] })
    await expect.element(page.getByText('Plugged in')).toBeVisible()
  }

  test('is ejected from its menu, and says it can be unplugged', async () => {
    await open()

    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Eject' }))

    await expect.poll(() => sent).toEqual([{ eject: MOUNT }])
    await expect.element(page.getByText('HERO5 Black can be unplugged now.')).toBeVisible()
  })
})

describe('the page of a camera known and not plugged in', () => {
  const open = async (over: Record<string, unknown> = {}) => {
    await renderBoard(`/camera/${encodeURIComponent(KEY)}`)
    says({ mounted: [], known: [known(over)], prompts: [] })
    await expect.element(page.getByText('Plug it in to look at it')).toBeVisible()
  }

  test('offers no eject, there being nothing to eject', async () => {
    await open()

    await userEvent.click(page.getByRole('button', { name: 'More' }))

    await expect.element(page.getByRole('button', { name: 'Eject' })).not.toBeInTheDocument()
  })

  test('says to plug it in, and switches copying by itself', async () => {
    await open()
    const copying = page.getByRole('switch', { name: /Copy new files automatically/ })

    await expect.element(copying).not.toBeChecked()
    /* the person clicks the switch's own label, the box itself is hidden behind it */
    await userEvent.click(page.getByText('Copy new files automatically', { exact: true }))

    await expect.poll(() => sent).toEqual([{ auto: { key: KEY, on: true } }])
  })

  test('switches copying by itself off when it is on', async () => {
    await open({ auto: true })

    await userEvent.click(page.getByText('Copy new files automatically', { exact: true }))

    await expect.poll(() => sent).toEqual([{ auto: { key: KEY, on: false } }])
  })

  test('is forgotten only once it is confirmed', async () => {
    await open()

    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Forget this camera…' }))
    await expect.element(page.getByRole('dialog', { name: 'Forget this camera' })).toBeVisible()
    await expect.element(page.getByText('Forget HERO5 Black?')).toBeVisible()
    expect(sent).toEqual([])

    await userEvent.click(page.getByRole('button', { name: 'Forget it' }))

    await expect.poll(() => sent).toEqual([{ forget: KEY }])
  })

  test('is kept when asked to keep it', async () => {
    await open()

    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await userEvent.click(page.getByRole('button', { name: 'Forget this camera…' }))
    await userEvent.click(page.getByRole('button', { name: 'Keep it' }))

    await expect
      .element(page.getByRole('dialog', { name: 'Forget this camera' }))
      .not.toBeInTheDocument()
    expect(sent).toEqual([])
  })
})
