import { createElement } from 'react'
import { createRoutesStub, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import FilmTemplate from '../../app/routes/film-template'
import { boardRoute } from './board-route'

type Made = {
  name: string
  template: {
    version: 1
    length: number
    underSound: number
    fade?: number
    texts: unknown[]
    music: unknown[]
  }
  missing: string[]
}

const text = {
  text: '{name}',
  from: 'start',
  at: 0,
  seconds: 4,
  effect: 'fade',
  font: 'bold',
  x: 0.5,
  y: 0.5,
  size: 0.09,
  colour: '#ffffff'
}

const piece = { name: 'Summer.mp3', from: 'start', at: 0, start: 0, end: 60, volume: 0.8 }

const made = (name: string, over: Partial<Made> = {}): Made => ({
  name,
  template: {
    version: 1,
    length: 120,
    underSound: 0.15,
    texts: [text, { ...text, from: 'end', at: 8 }],
    music: [piece]
  },
  missing: [],
  ...over
})

const server = { templates: [] as Made[], broken: [] as string[], failing: false }
const posted: Record<string, unknown>[] = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const realFetch = globalThis.fetch

beforeEach(() => {
  posted.length = 0
  server.failing = false
  server.broken = []
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    if (!String(url).includes('/api/film-templates')) return json({})
    if (init?.method !== 'POST')
      return server.failing
        ? json({ nope: true })
        : json({ templates: server.templates, broken: server.broken, music: [] })
    const body = JSON.parse(String(init.body)) as Record<string, string>
    posted.push(body)
    const there = server.templates.find((one) => one.name === body.name)
    if (body.intent === 'create' && there)
      return json({
        success: false,
        globalErrors: [`There is already a film template called ${body.name}.`]
      })
    const kept = body.name!.replace(/[/\\]/g, ' ')
    if (body.intent === 'create') server.templates.push(made(kept))
    if (body.intent === 'rename' && there) there.name = body.to!
    if (body.intent === 'duplicate' && there)
      server.templates.push(made(`${body.name} copy`, { template: there.template }))
    if (body.intent === 'delete') {
      server.templates = server.templates.filter((one) => one.name !== body.name)
      server.broken = server.broken.filter((one) => one !== body.name)
    }
    return json({ ok: true, name: kept })
  })
})

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
  server.templates = []
})

const nameOf = () => useParams().name

const board = () => ({
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
})

const openDialog = async () => {
  const Stub = createRoutesStub([
    boardRoute(board),
    {
      path: '/film-template/:name',
      Component: () => createElement('p', null, `the scratch editor ${nameOf()}`)
    }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('button', { name: 'Settings' }))
  await userEvent.click(page.getByRole('button', { name: 'Film templates…' }))
  return page.getByRole('dialog', { name: 'Film templates' })
}

describe('the film templates dialog', () => {
  test('lists the film templates with their counts and warns about missing music', async () => {
    server.templates = [made('Club', { missing: ['Summer.mp3'] }), made('Plain')]
    const dialog = await openDialog()

    await expect.element(dialog.getByText('Club', { exact: true })).toBeInTheDocument()
    await expect.element(dialog.getByText('Plain', { exact: true })).toBeInTheDocument()
    await expect.element(dialog.getByText('2 texts · 1 piece of music · 2:00').first()).toBeInTheDocument()
    await expect.element(dialog.getByText('Not in the music folder: Summer.mp3')).toBeInTheDocument()
  })

  test('says there is none yet', async () => {
    const dialog = await openDialog()
    await expect
      .element(
        dialog.getByText(
          'No film template yet. Make one here, or keep a film you have edited from its editor.'
        )
      )
      .toBeInTheDocument()
  })

  test('says so when the film templates cannot be read, and still closes', async () => {
    server.failing = true
    const dialog = await openDialog()
    await expect.element(dialog.getByText('The film templates could not be read.')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
  })

  test('renames and duplicates a film template', async () => {
    server.templates = [made('Club')]
    const dialog = await openDialog()

    await userEvent.click(dialog.getByRole('button', { name: 'Duplicate Club' }))
    await expect.element(dialog.getByText('Club copy', { exact: true })).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Rename Club', exact: true }))
    await userEvent.fill(dialog.getByLabelText('Name'), 'Team')
    await userEvent.click(dialog.getByRole('button', { name: 'Rename', exact: true }))

    await expect.element(dialog.getByText('Team', { exact: true })).toBeInTheDocument()
    expect(posted).toContainEqual({ intent: 'rename', name: 'Club', to: 'Team' })
  })

  test('asks before deleting and changes nothing when cancelled', async () => {
    server.templates = [made('Club')]
    const dialog = await openDialog()

    await userEvent.click(dialog.getByRole('button', { name: 'Delete Club' }))
    await expect.element(dialog.getByText('Delete this film template?')).toBeInTheDocument()
    await expect
      .element(dialog.getByText('Club goes. Films already made with it stay as they are.'))
      .toBeInTheDocument()
    await expect.element(dialog.getByRole('button', { name: 'Keep it' })).toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Keep it' }))
    expect(posted).toEqual([])

    await userEvent.click(dialog.getByRole('button', { name: 'Delete Club' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete it' }))
    await expect.element(dialog.getByText('Club', { exact: true })).not.toBeInTheDocument()
    expect(posted).toEqual([{ intent: 'delete', name: 'Club' }])
  })

  test('makes a film template from scratch and opens it', async () => {
    server.templates = [made('Club')]
    const dialog = await openDialog()

    await userEvent.click(dialog.getByRole('button', { name: 'New film template' }))
    await userEvent.fill(dialog.getByLabelText('Name'), 'Club')
    await userEvent.click(dialog.getByRole('button', { name: 'Create and open' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('There is already a film template called Club.')

    await userEvent.fill(dialog.getByLabelText('Name'), 'Fresh')
    await userEvent.click(dialog.getByRole('button', { name: 'Create and open' }))
    await expect.element(page.getByText(/the scratch editor/)).toBeInTheDocument()
    expect(posted.at(-1)).toEqual({ intent: 'create', name: 'Fresh' })
  })
})

describe('the film templates dialog, kept names and unreadable files', () => {
  test('opens the film template under the name the server kept', async () => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('button', { name: 'New film template' }))
    await userEvent.fill(dialog.getByLabelText('Name'), 'a/b')
    await userEvent.click(dialog.getByRole('button', { name: 'Create and open' }))
    await expect.element(page.getByText('the scratch editor a b')).toBeInTheDocument()
  })

  test('lists a file that cannot be read and deletes it', async () => {
    server.broken = ['Old']
    const dialog = await openDialog()
    await expect
      .element(dialog.getByText('This file cannot be read as a film template.'))
      .toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Delete Old' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete it' }))
    await expect.element(dialog.getByText('Old', { exact: true })).not.toBeInTheDocument()
    expect(posted).toEqual([{ intent: 'delete', name: 'Old' }])
  })
})

describe('the film template editor', () => {
  const look = { effect: 'fade', font: 'bold', x: 0.5, y: 0.5, size: 0.09, colour: '#ffffff' }
  const summer = { name: 'Summer.mp3', path: '/m/Summer.mp3', seconds: 300 }

  const club = made('Club', {
    template: {
      version: 1,
      length: 120,
      underSound: 0.3,
      texts: [
        { ...look, text: '{name}', from: 'start', at: 0, seconds: 4 },
        { ...look, text: 'Thanks, {day}', from: 'end', at: 8, seconds: 8 }
      ],
      music: [piece]
    }
  })

  const saves = () =>
    posted.filter((one) => one.intent === 'update') as unknown as Array<{
      name: string
      template: Made['template'] & { texts: Array<{ text: string; from: string; at: number }> }
    }>

  const openScratch = async (name = 'Club', templates: Made[] = [club]) => {
    server.templates = templates
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ ok: true })
      }
      return json({ templates: server.templates, music: [summer] })
    })
    const Stub = createRoutesStub([{ path: '/film-template/:name', Component: FilmTemplate }])
    await render(createElement(Stub, { initialEntries: [`/film-template/${name}`] }))
  }

  const bar = () => page.getByText('Your clips', { exact: true }).first()

  test('opens a film template with a black stage, a grey bar for the clips and no Render', async () => {
    await openScratch()

    await expect.element(page.getByRole('main', { name: 'Film editor' })).toBeVisible()
    await expect.element(page.getByText('Film templates', { exact: true })).toBeVisible()
    await expect.element(page.getByText('Club', { exact: true }).first()).toBeVisible()
    await expect.element(bar()).toBeVisible()
    await expect.element(page.getByText('Thanks, {day}').first()).toBeVisible()
    await expect.element(page.getByText('{name}').first()).toBeVisible()
    await expect.element(page.getByRole('button', { name: /Render/ })).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Film template…' }))
      .not.toBeInTheDocument()
    await expect.element(page.getByLabelText('Film length (seconds)')).toHaveValue(120)
    await expect.element(page.getByText('0:00.0 / 2:00.0')).toBeVisible()
    await expect
      .element(
        page.getByText(
          'A film template has no clips. Your clips take the place of the grey bar when it is used.'
        )
      )
      .toBeVisible()
  })

  test('draws the texts on the stage with {name} and {day} as they are, once the playhead is past their fade-in', async () => {
    await openScratch()
    await expect.element(bar()).toBeVisible()
    const onStage = () =>
      [...document.querySelectorAll<HTMLElement>('.film-stage .film-text')].map((one) => [
        one.textContent,
        one.style.opacity
      ])
    expect(onStage().every(([, opacity]) => opacity === '0')).toBe(true)

    page.getByRole('slider', { name: 'Timeline ruler' }).element().focus()
    await userEvent.keyboard('{ArrowRight}')

    await expect.poll(onStage).toContainEqual(['{name}', '1'])
  })

  test('keeps the fade of the film template when it is saved again', async () => {
    await openScratch('Club', [made('Club', { template: { ...club.template, fade: 1.5 } })])
    await expect.element(bar()).toBeVisible()
    await userEvent.fill(page.getByLabelText('Film length (seconds)'), '90')

    await vi.waitFor(() => expect(saves().at(-1)?.template.length).toBe(90), { timeout: 4000 })
    expect(saves().at(-1)?.template).toMatchObject({ fade: 1.5 })
  })

  test('says so when the film template is gone', async () => {
    await openScratch('Nobody', [])
    await expect.element(page.getByText('This film template is gone.')).toBeVisible()
  })

  test('keeps the grey bar from being cut or deleted', async () => {
    await openScratch()
    await userEvent.click(bar())

    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'Cut at playhead' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'Fade in' })).toBeDisabled()
    await expect.element(page.getByLabelText('Trim the end')).not.toBeInTheDocument()
  })

  test('sets the film length, places a text and a piece of music, and saves', async () => {
    await openScratch('Club', [made('Club', { template: { ...club.template, texts: [], music: [] } })])
    await userEvent.fill(page.getByLabelText('Film length (seconds)'), '90')
    await expect.element(page.getByText('0:00.0 / 1:30.0')).toBeVisible()
    await userEvent.fill(page.getByLabelText('Film length (seconds)'), '3')
    await expect.element(page.getByLabelText('Film length (seconds)')).toBeInvalid()
    await expect.element(page.getByText('Between 5 and 3600 seconds')).toBeVisible()
    await userEvent.fill(page.getByLabelText('Film length (seconds)'), '90')
    await expect.element(page.getByText('Between 5 and 3600 seconds')).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Text', exact: true }))
    await userEvent.click(page.getByRole('button', { name: /{name}/ }))
    await expect
      .element(page.getByText('Write {name} and {day} where the name and the day go.'))
      .toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Music', exact: true }))
    await userEvent.click(page.getByRole('button', { name: 'Add', exact: true }))

    await vi.waitFor(() => expect(saves().at(-1)?.template.music).toHaveLength(1), { timeout: 4000 })
    const last = saves().at(-1)!
    expect(last).toMatchObject({ name: 'Club' })
    expect(last.template.length).toBe(90)
    expect(last.template.texts[0]).toMatchObject({ text: '{name}', from: 'start', at: 0 })
    expect(last.template.music[0]).toMatchObject({ name: 'Summer.mp3', from: 'start' })
    await expect.element(page.getByText('Saved', { exact: true })).toBeVisible()
  })
})
