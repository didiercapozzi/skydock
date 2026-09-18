import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Board from '../../app/routes/board'
import { setTemplateChoice } from '../../app/hooks/useTemplateChoice'

/* A template is somebody's branding, so which one a montage is made from is never decided for the
   person: one whole template is simply used, several are chosen between, and one with a hole in it
   or made by a kdenlive far from the editor's says so first. Pressed in a real browser. */

const clip = {
  id: 'v1',
  path: '/o/GX01.MP4',
  filename: 'GX01.MP4',
  size: 1,
  mtime: 1_785_000_000,
  processed: { path: '/p/luc_1.mp4', size: 1, at: 1, source: { id: 'v1', size: 1, mtime: 1 } }
}

/* Luc Favre: named and processed, so the next thing is the montage */
const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      processed: true,
      files: [clip]
    }
  ],
  looseFiles: [],
  destinations: [{ name: 'Tandems' }],
  outputs: { '/o/GX01.MP4': { exists: true, size: 1 } },
  proxies: {},
  tandems: { g1: { project: false, projectPath: '/p/luc.kdenlive', film: null, baseName: 'luc' } },
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, defaultFolder: null, backupFolder: null }
}

const template = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  version: '24.12.1',
  assets: 5,
  missing: [],
  gap: null,
  ...over
})

const requests: unknown[] = []

/* the machine behind the board: it lists the templates, and answers an archive sent to it */
const machineHas = (templates: unknown[], onImport?: () => unknown) =>
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
    const said =
      init?.method === 'POST' && onImport
        ? onImport()
        : { templates, editorVersion: 'kdenlive 24.12.3' }
    return new Response(JSON.stringify(said), { headers: { 'Content-Type': 'application/json' } })
  })

const renderBoard = async () => {
  requests.length = 0
  const Stub = createRoutesStub([
    { path: '/', Component: Board, loader: () => board },
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        requests.push(await request.json())
        return { ok: true }
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(
    page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /Luc Favre/ })
  )
}

const dialog = () => page.getByRole('dialog', { name: 'Editing templates' })

/* only the machine is put back: the silent stream every board here is drawn with stays, since the
   real one would knock on the test runner's own server */
const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
  setTemplateChoice('')
})

describe('making a montage', () => {
  test('uses the only template there is, when it is whole, without asking', async () => {
    machineHas([template('epco')])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Montage' }))

    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'montage', groupId: 'g1', template: 'epco' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  test('asks which template when there are several, and makes nothing until one is chosen', async () => {
    machineHas([template('epco'), template('summer')])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Montage' }))

    const make = dialog().getByRole('button', { name: 'Make the montage' })
    await expect.element(make).toBeDisabled()
    await userEvent.click(dialog().getByRole('radio', { name: /summer/ }))
    await userEvent.click(make)
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'montage', groupId: 'g1', template: 'summer' })
    )
  })

  /* offered, never applied by itself: it is ticked, and still has to be confirmed */
  test('has the template chosen last time already ticked', async () => {
    setTemplateChoice('summer')
    machineHas([template('epco'), template('summer')])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Montage' }))

    await expect.element(dialog().getByRole('radio', { name: /summer/ })).toBeChecked()
    expect(requests).toEqual([])
  })

  test('says first when the only template was made by a newer kdenlive than the editor', async () => {
    machineHas([template('epco', { version: '25.04.0', gap: 'newer' })])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Montage' }))

    await expect
      .element(dialog().getByText(/Made with kdenlive 25\.04\.0, newer than the 24\.12\.3/))
      .toBeInTheDocument()
    expect(requests).toEqual([])
  })

  test('says first which files the only template is missing', async () => {
    machineHas([template('epco', { missing: ['logo-epco.png'] })])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Montage' }))

    await expect.element(dialog().getByText(/not here: logo-epco\.png/)).toBeInTheDocument()
  })
})

describe('the editing templates, from the header', () => {
  test('are listed to be looked over, with nothing to make', async () => {
    machineHas([template('epco')])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await expect.element(dialog().getByText('epco', { exact: true })).toBeInTheDocument()
    await expect.element(dialog().getByText('every file here')).toBeInTheDocument()
    await expect
      .element(dialog().getByRole('button', { name: 'Make the montage' }))
      .not.toBeInTheDocument()
  })

  test('take in an archive, and show the template it made with what it is missing', async () => {
    machineHas([template('epco')], () => ({
      ok: true,
      templates: [template('epco'), template('summer', { missing: ['intro.mp3'] })],
      editorVersion: 'kdenlive 24.12.3'
    }))
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await userEvent.upload(
      dialog().getByLabelText('Template archive'),
      new File(['zip'], 'summer.zip', { type: 'application/zip' })
    )

    await expect.element(dialog().getByText(/not here: intro\.mp3/)).toBeInTheDocument()
  })

  test('say why when an archive is refused', async () => {
    machineHas([template('epco')], () => ({
      ok: false,
      error: 'There is no kdenlive project in that archive.'
    }))
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await userEvent.upload(
      dialog().getByLabelText('Template archive'),
      new File(['zip'], 'music.zip', { type: 'application/zip' })
    )

    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent('There is no kdenlive project in that archive.')
  })
})
