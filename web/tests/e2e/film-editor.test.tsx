import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FilmEditor } from '../../app/components/film-editor'

const FIRST = 'luc_favre_20260906_090000.mp4'
const SECOND = 'luc_favre_20260906_090300.mp4'

const answer = {
  ok: true,
  title: 'Luc Favre',
  saved: true,
  rendering: false,
  film: null,
  music: [],
  sources: [FIRST, SECOND].map((name, i) => ({
    name,
    path: `/o/${name}`,
    play: `/o/${name}`,
    seconds: 10 - i * 4,
    sound: i === 0,
    marks: []
  })),
  edit: {
    version: 1,
    clips: [
      { id: 'clip-1', name: FIRST, start: 0, end: 10, sound: false },
      { id: 'clip-2', name: SECOND, start: 0, end: 6, sound: false }
    ],
    music: [],
    texts: [],
    underSound: 0.15
  }
}

const open = async () => {
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) =>
    Response.json(init?.method === 'POST' ? { ok: true } : answer)
  )
  await render(createElement(FilmEditor, { groupId: 'g1', day: '06.09.2026', onClose: () => {} }))
  await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`)).toBeVisible()
}

const clipsOnTimeline = () => document.querySelectorAll('[title$="double-click to choose the part"]')

describe('the film editor', () => {
  test('has the clips on the left, the picture in the middle and what is picked on the right', async () => {
    await open()

    await expect.element(page.getByText('Luc Favre', { exact: true })).toBeVisible()
    await expect.element(page.getByText(/06\.09\.2026/)).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Clips', exact: true })).toBeVisible()
    await expect.element(page.getByText('Inspector', { exact: true })).toBeVisible()
    await expect.element(page.getByText(`${FIRST}`).first()).toBeVisible()
    await expect.element(page.getByText('Pick a clip, a piece of music or a text on the timeline', { exact: false })).toBeVisible()
  })

  test('shows what is picked in the inspector, in boxes', async () => {
    await open()

    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))

    await expect.element(page.getByRole('heading', { name: SECOND })).toBeVisible()
    for (const label of ['Starts at', 'Length', 'Source in', 'Source out'])
      await expect.element(page.getByText(label, { exact: true })).toBeVisible()
  })

  test('changes the length of the picked clip from its box', async () => {
    await open()

    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.fill(page.getByRole('textbox', { name: 'Length' }), '0:03.0')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('0:00.0 / 0:13.0', { exact: true })).toBeVisible()
  })

  test('plays, and goes to the previous and the next clip, under the picture', async () => {
    await open()
    const clock = (text: string) => page.getByText(text, { exact: true })

    await expect.element(clock('0:00.0 / 0:16.0')).toBeVisible()
    expect(clock('0:00.0 / 0:16.0').element().childNodes).toHaveLength(1)
    await userEvent.click(page.getByRole('button', { name: 'Next clip' }))
    await expect.element(clock('0:10.0 / 0:16.0')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Previous clip' }))
    await expect.element(clock('0:00.0 / 0:16.0')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Play', exact: true }))
    await expect.element(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  })

  test('names every track, with its tag', async () => {
    await open()

    for (const tag of ['V1', 'A1', 'T1', 'M1'])
      await expect.element(page.getByText(tag, { exact: true })).toBeVisible()
  })

  test('takes the last change back with Undo, and with Ctrl+Z', async () => {
    await open()
    const undo = page.getByRole('button', { name: 'Undo' })
    await expect.element(undo).toBeDisabled()

    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    expect(clipsOnTimeline()).toHaveLength(1)
    await userEvent.click(undo)
    expect(clipsOnTimeline()).toHaveLength(2)
    await new Promise((resolve) => setTimeout(resolve, 500))

    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    expect(clipsOnTimeline()).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 500))
    await userEvent.click(page.getByText('Inspector', { exact: true }))
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect.poll(() => clipsOnTimeline().length).toBe(2)
  })

  test('takes a change back with Ctrl+Z while a slider still has focus', async () => {
    await open()
    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    expect(clipsOnTimeline()).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 500))
    page.getByRole('slider', { name: 'Zoom the timeline' }).element().focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect.poll(() => clipsOnTimeline().length).toBe(2)
  })

  test('undoes two quick separate changes one at a time', async () => {
    await open()
    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    await userEvent.click(page.getByTitle(`${FIRST} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    expect(clipsOnTimeline()).toHaveLength(0)
    await userEvent.click(page.getByRole('button', { name: 'Undo' }))
    expect(clipsOnTimeline()).toHaveLength(1)
  })

  test('lets Space press a focused button instead of playing', async () => {
    await open()
    page.getByRole('button', { name: 'Next clip' }).element().focus()
    await userEvent.keyboard(' ')
    await expect.element(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect.element(page.getByText('0:10.0 / 0:16.0', { exact: true })).toBeVisible()
  })
})
