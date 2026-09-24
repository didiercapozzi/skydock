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
import { boardRoute } from './board-route'

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
      montageJump: true,
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
  nas: { connected: false, hostname: null, backupFolder: null }
}

const template = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  version: '24.12.1',
  assets: 5,
  missing: [],
  byDefault: false,
  ...over
})

const requests: unknown[] = []

/* the machine behind the board: it lists the templates, and answers an archive sent to it */
const machineHas = (templates: unknown[], onImport?: (body: FormData) => unknown) =>
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
    const said =
      init?.method === 'POST' && onImport
        ? onImport(init.body as FormData)
        : { templates }
    return new Response(JSON.stringify(said), { headers: { 'Content-Type': 'application/json' } })
  })

const renderBoard = async () => {
  requests.length = 0
  const Stub = createRoutesStub([
    boardRoute(() => board),
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
    page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Luc Favre/ })
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

    await userEvent.click(page.getByRole('button', { name: 'Make the project' }))

    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'montage', groupId: 'g1', template: 'epco' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  test('asks which template when there are several, and makes nothing until one is chosen', async () => {
    machineHas([template('epco'), template('summer')])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Make the project' }))

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

    await userEvent.click(page.getByRole('button', { name: 'Make the project' }))

    await expect.element(dialog().getByRole('radio', { name: /summer/ })).toBeChecked()
    expect(requests).toEqual([])
  })

  test('says first which files the only template is missing', async () => {
    machineHas([template('epco', { missing: ['logo-epco.png'] })])
    await renderBoard()

    await userEvent.click(page.getByRole('button', { name: 'Make the project' }))

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
      templates: [template('epco'), template('summer', { missing: ['intro.mp3'] })]
    }))
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await userEvent.upload(
      dialog().getByLabelText('The template and its files'),
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
      dialog().getByLabelText('The template and its files'),
      new File(['zip'], 'music.zip', { type: 'application/zip' })
    )

    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent('There is no kdenlive project in that archive.')
  })

  test('take in the project and the files it uses, chosen together', async () => {
    const sent: File[][] = []
    machineHas([template('epco')], (body) => {
      sent.push(body.getAll('files').filter((f): f is File => f instanceof File))
      return { ok: true, templates: [template('epco'), template('club')] }
    })
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await userEvent.upload(dialog().getByLabelText('The template and its files'), [
      new File(['<mlt/>'], 'club.kdenlive'),
      new File(['m'], 'music.mp3'),
      new File(['l'], 'logo.png')
    ])

    await expect.element(dialog().getByText('club', { exact: true })).toBeInTheDocument()
    expect(sent[0]?.map((f) => f.name)).toEqual(['club.kdenlive', 'music.mp3', 'logo.png'])
  })

  test('are told which one is the usual, and say which it is', async () => {
    const sent: string[] = []
    machineHas([template('epco'), template('summer')], (body) => {
      sent.push(String(body.get('byDefault')))
      return { ok: true, templates: [template('epco'), template('summer', { byDefault: true })] }
    })
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    await userEvent.click(dialog().getByRole('button', { name: 'Use by default' }).nth(1))

    await expect.element(dialog().getByText('the usual one')).toBeInTheDocument()
    expect(sent).toEqual(['summer'])
  })

  /* what kdenlive's Archive project leaves: the project with its files in folders beside it */
  test('take in the folder kdenlive left, each file under its way down from it', async () => {
    const sent: string[] = []
    machineHas([template('epco')], (body) => {
      for (const [, value] of body.entries()) if (value instanceof File) sent.push(value.name)
      return { ok: true, templates: [template('epco'), template('club')] }
    })
    await renderBoard()
    await userEvent.click(page.getByRole('button', { name: 'Templates…' }))

    /* a real folder on disk, the shape kdenlive leaves — which is the only way a browser will
       hand one over, and the only way the ways down from it are real */
    await userEvent.upload(
      dialog().getByLabelText('The folder kdenlive left'),
      'tests/e2e/fixtures/kdenlive-archive'
    )

    await expect.element(dialog().getByText('club', { exact: true })).toBeInTheDocument()
    expect(sent.sort()).toEqual([
      'kdenlive-archive/club.kdenlive',
      'kdenlive-archive/images/logo.png',
      'kdenlive-archive/sounds/Destiny.mp3'
    ])
  })
})