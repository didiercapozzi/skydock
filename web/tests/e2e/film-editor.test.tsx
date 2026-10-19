import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createRoutesStub, Link, Outlet } from 'react-router'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { POP, TEXT_FADE } from '@skydock/scripts/client'
import { TILE_LOOP } from '../../app/helpers/filmTimeline'
import { FilmEditor } from '../../app/components/film-editor'
import Edit from '../../app/routes/edit'
import { setFilmTemplateChoice } from '../../app/hooks/useFilmTemplateChoice'

const ready = vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get')
const failure = vi.spyOn(HTMLMediaElement.prototype, 'error', 'get')

beforeEach(() => {
  ready.mockReturnValue(4)
  failure.mockReturnValue(null)
})

afterEach(() => {
  ready.mockReset()
  failure.mockReset()
})

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

const PHOTO = 'luc_favre_20260906_090500.jpg'

const photo = { name: PHOTO, path: `/o/${PHOTO}`, play: `/o/${PHOTO}`, seconds: 60, sound: false, marks: [], still: true }

const open = async (
  edit: Record<string, unknown> = {},
  marks: Array<{ which: string; at: number }> = [],
  more: unknown[] = []
) => {
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) =>
    Response.json(
      init?.method === 'POST'
        ? { ok: true }
        : {
            ...answer,
            sources: [
              ...answer.sources.map((one) => (one.name === FIRST ? { ...one, marks } : one)),
              ...more
            ],
            edit: { ...answer.edit, ...edit }
          }
    )
  )
  await render(createElement(FilmEditor, { groupId: 'g1', day: '06.09.2026', onClose: () => {} }))
  await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`).first()).toBeVisible()
}

const later = {
  texts: [
    {
      id: 'text-1',
      text: 'Hello there',
      at: 1,
      seconds: 2,
      effect: 'fade',
      font: 'bold',
      x: 0.5,
      y: 0.5,
      size: 0.09,
      colour: '#ffffff'
    }
  ],
  music: [{ id: 'music-1', name: 'song.mp3', at: 13, start: 0, end: 5, volume: 1 }]
}

const playheadAt = async (seconds: number) => {
  page.getByRole('slider', { name: 'Timeline ruler' }).element().focus()
  for (let i = 0; i < seconds; i++) await userEvent.keyboard('{ArrowRight}')
}

const textBlock = () =>
  [...document.querySelectorAll<HTMLElement>('div.cursor-grab')].find((one) =>
    one.textContent?.includes('Hello there')
  )!

const pxPerSecond = () =>
  parseFloat(
    leftOf(page.getByTitle(`${SECOND} · double-click to choose the part`).element())
  ) / 10

const leftOf = (element: Element) => (element as HTMLElement).style.left

const clipsOnTimeline = () => document.querySelectorAll('[title$="double-click to choose the part"]')

describe('the film editor', () => {
  test('lists the photos of the montage with the videos, and puts one at the end as a five second clip', async () => {
    await open({}, [], [photo])

    await expect.element(page.getByText(PHOTO, { exact: true }).first()).toBeVisible()
    await expect.element(page.getByText('Photo', { exact: true })).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Add', exact: true }).nth(2))

    await expect.element(page.getByText('0:00.0 / 0:21.0', { exact: true })).toBeVisible()
    await expect.element(page.getByTitle(`${PHOTO} · double-click to choose the part`)).not.toBeInTheDocument()
    await expect.element(page.getByTitle(PHOTO, { exact: true }).last()).toBeVisible()
  })

  test('trims a photo clip to any length up to a minute, with no part to choose', async () => {
    await open({ clips: [...answer.edit.clips, { id: 'clip-3', name: PHOTO, start: 0, end: 5, sound: false }] }, [], [photo])

    await userEvent.click(page.getByTitle(PHOTO, { exact: true }).last())
    await userEvent.fill(page.getByRole('textbox', { name: 'Length' }), '0:20.0')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('0:00.0 / 0:36.0', { exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Choose the part…' })).not.toBeInTheDocument()
  })

  test('shows a photo as the picture, with the video left empty, while the playhead is on it', async () => {
    await open({ clips: [{ id: 'clip-0', name: PHOTO, start: 0, end: 5, sound: false }, ...answer.edit.clips] }, [], [photo])

    await expect.poll(() => document.querySelectorAll('video')[1]?.getAttribute('poster')).toBe(`/api/file/o/${PHOTO}`)
    expect(document.querySelectorAll('video')[1]?.getAttribute('src')).toBeNull()
  })

  test('has the next clip ready in the layer under the picture, and shows it at the seam without loading it then', async () => {
    await open()
    const [under, top] = document.querySelectorAll('video')

    expect(under.getAttribute('src')).toBeNull()
    await playheadAt(6)
    expect(under.getAttribute('src')).toBe(`/api/file/o/${SECOND}`)
    expect(under.classList.contains('invisible')).toBe(true)
    await playheadAt(4)

    expect(under.getAttribute('src')).toBe(`/api/file/o/${SECOND}`)
    expect(under.classList.contains('invisible')).toBe(false)
    expect(top.classList.contains('invisible')).toBe(true)
  })

  test('keeps the cued clip hidden and silent in its layer until the seam', async () => {
    await open()
    const [under] = document.querySelectorAll('video')
    await playheadAt(6)

    expect(under.volume).toBe(0)
    expect(under.classList.contains('invisible')).toBe(true)
  })

  test('keeps each clip in the layer that already holds it when the playhead goes back over a seam', async () => {
    await open()
    const [under, top] = document.querySelectorAll('video')
    await playheadAt(10)
    for (let i = 0; i < 10; i++) await userEvent.keyboard('{ArrowLeft}')

    expect(top.getAttribute('src')).toBe(`/api/file/o/${FIRST}`)
    expect(under.getAttribute('src')).toBe(`/api/file/o/${SECOND}`)
    expect(top.classList.contains('invisible')).toBe(false)
  })

  test('keeps the picture on screen until the layer it moves to has a frame', async () => {
    await open()
    const [under, top] = document.querySelectorAll('video')
    ready.mockReturnValue(0)
    await playheadAt(11)

    expect(under.getAttribute('src')).toBe(`/api/file/o/${SECOND}`)
    expect(top.classList.contains('invisible')).toBe(false)
    expect(under.classList.contains('invisible')).toBe(true)
    ready.mockReturnValue(4)
    under.dispatchEvent(new Event('seeked'))

    await expect.poll(() => top.classList.contains('invisible')).toBe(true)
    expect(under.classList.contains('invisible')).toBe(false)
  })

  test('moves to the layer cued at the in-point when two pieces of the same file touch', async () => {
    await open({
      clips: [
        { id: 'clip-1', name: FIRST, start: 0, end: 5, sound: false },
        { id: 'clip-2', name: FIRST, start: 5, end: 10, sound: false }
      ]
    })
    const decks = [...document.querySelectorAll<HTMLVideoElement>('.film-stage video')]
    const shownDeck = () => decks.findIndex((one) => !one.classList.contains('invisible'))
    await playheadAt(4)
    const before = shownDeck()
    expect(decks[1 - before]!.dataset.src).toBe(`/api/file/o/${FIRST}`)
    const cued = decks[1 - before]!.currentTime

    await playheadAt(1)

    expect(shownDeck()).toBe(1 - before)
    expect(decks[1 - before]!.currentTime).toBe(cued)
  })

  test('shows the next picture when the layer it moves to fails to load', async () => {
    await open()
    const [under, top] = document.querySelectorAll('video')
    ready.mockReturnValue(0)
    await playheadAt(11)
    expect(top.classList.contains('invisible')).toBe(false)
    failure.mockReturnValue({} as MediaError)
    under.dispatchEvent(new Event('error'))

    await expect.poll(() => top.classList.contains('invisible')).toBe(true)
  })

  test('shows a text above the picture, where it can be picked', async () => {
    await open(later)
    await playheadAt(2)

    const rect = document.querySelector('.film-text')!.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    expect(hit?.closest('.film-text')).not.toBeNull()
  })

  test('has the next photo ready as the poster of the layer under the picture', async () => {
    await open({ clips: [...answer.edit.clips.slice(0, 1), { id: 'clip-3', name: PHOTO, start: 0, end: 5, sound: false }] }, [], [photo])
    await playheadAt(6)

    await expect.poll(() => document.querySelectorAll('video')[0]?.getAttribute('poster')).toBe(`/api/file/o/${PHOTO}`)
    expect(document.querySelectorAll('video')[0].classList.contains('invisible')).toBe(true)
  })

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

  test('has Select, Cut at playhead, Delete, Ripple and Snap above the timeline', async () => {
    await open()

    await expect.element(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: 'Ripple', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: 'Snap', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
    await expect.element(page.getByRole('button', { name: 'Snap', exact: true })).toHaveAttribute('aria-pressed', 'false')
  })

  test('cuts the clip under the playhead in two, keeps the film as long, and takes it back with Undo', async () => {
    await open()
    const cut = page.getByRole('button', { name: 'Cut at playhead' })
    await expect.element(cut).toBeDisabled()

    await playheadAt(4)
    await expect.element(cut).toBeEnabled()
    await userEvent.click(cut)

    expect(clipsOnTimeline()).toHaveLength(3)
    await expect.element(page.getByText('0:04.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Undo' }))
    expect(clipsOnTimeline()).toHaveLength(2)
  })

  test('picks the piece after the cut, so that the next cut or delete is of that one', async () => {
    await open()
    const pressed = () => [...clipsOnTimeline()].map((one) => one.getAttribute('aria-pressed'))

    await playheadAt(4)
    await userEvent.keyboard('c')

    expect(pressed()).toEqual(['false', 'true', 'false'])
    await playheadAt(2)
    await userEvent.keyboard('c')
    expect(pressed()).toEqual(['false', 'false', 'true', 'false'])
  })

  test('cuts with the C key, and not where a piece would be too short', async () => {
    await open()

    await playheadAt(10)
    await userEvent.keyboard('c')
    expect(clipsOnTimeline()).toHaveLength(2)
    await playheadAt(1)
    await userEvent.keyboard('c')
    expect(clipsOnTimeline()).toHaveLength(3)
  })

  test('pulls the text and the music that come later along when a clip is deleted, with Ripple on', async () => {
    await open({ ...later, texts: [{ ...later.texts[0]!, at: 11 }] })

    const pps = pxPerSecond()
    await userEvent.click(page.getByTitle(`${FIRST} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))

    expect(parseFloat(leftOf(textBlock()))).toBeCloseTo(pps, 3)
    expect(parseFloat(leftOf(page.getByTitle('song.mp3').element()))).toBeCloseTo(3 * pps, 3)
  })

  test('leaves the text and the music where they are when a clip is deleted, with Ripple off', async () => {
    await open({ ...later, texts: [{ ...later.texts[0]!, at: 11 }] })

    const pps = pxPerSecond()
    await userEvent.click(page.getByRole('button', { name: 'Ripple', exact: true }))
    await userEvent.click(page.getByTitle(`${FIRST} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))

    expect(parseFloat(leftOf(textBlock()))).toBeCloseTo(11 * pps, 3)
    expect(parseFloat(leftOf(page.getByTitle('song.mp3').element()))).toBeCloseTo(13 * pps, 3)
  })

  test('snaps a dragged text to the playhead with Snap on, and not with Snap off', async () => {
    await open(later)
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' })
    await playheadAt(5)
    const pps = pxPerSecond()

    await userEvent.dragAndDrop(textBlock(), ruler, {
      sourcePosition: { x: 2, y: 5 },
      targetPosition: { x: 5 * pps + 5, y: 5 }
    })
    expect(parseFloat(leftOf(textBlock()))).toBeCloseTo(5 * pps, 3)

    await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
    await userEvent.dragAndDrop(textBlock(), ruler, {
      sourcePosition: { x: 2, y: 5 },
      targetPosition: { x: 5 * pps + 5, y: 5 }
    })
    expect(parseFloat(leftOf(textBlock()))).toBeCloseTo(5 * pps + 3, 0)
  })

  test('pulls a trimmed clip edge to a jump mark with Snap on, and not with Snap off', async () => {
    await open({}, [{ which: 'canopy', at: 8 }])
    const clip = page.getByTitle(`${FIRST} · double-click to choose the part`)
    const width = () => parseFloat((clip.element() as HTMLElement).style.width)
    const handle = document.querySelector<HTMLElement>('[aria-label="Trim the end"]')!
    const pps = pxPerSecond()

    await userEvent.dragAndDrop(handle, handle, {
      sourcePosition: { x: 4, y: 5 },
      targetPosition: { x: 4 - 2 * pps + 3, y: 5 }
    })
    expect(width()).toBeCloseTo(8 * pps - 2, 1)

    await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
    await userEvent.dragAndDrop(handle, handle, {
      sourcePosition: { x: 4, y: 5 },
      targetPosition: { x: 4 + 3, y: 5 }
    })
    expect(width()).toBeCloseTo(8 * pps + 1, 0)
  })

  test('a small trim of a clip edge is not pulled back to where the edge was', async () => {
    await open()
    const clip = page.getByTitle(`${FIRST} · double-click to choose the part`)
    const before = parseFloat((clip.element() as HTMLElement).style.width)
    const handle = document.querySelector<HTMLElement>('[aria-label="Trim the end"]')!

    await userEvent.dragAndDrop(handle, handle, {
      sourcePosition: { x: 4, y: 5 },
      targetPosition: { x: -2, y: 5 }
    })

    expect(parseFloat((clip.element() as HTMLElement).style.width)).toBeLessThan(before - 3)
  })

  describe('a gap between two clips', () => {
    const THIRD = [
      { id: 'clip-1', name: FIRST, start: 0, end: 10, sound: false },
      { id: 'clip-2', name: SECOND, start: 0, end: 3, sound: false },
      { id: 'clip-3', name: SECOND, start: 3, end: 6, sound: false, gap: 3 }
    ]
    const unit = () => (parseFloat((clipBy(FIRST) as HTMLElement).style.width) + 2) / 10
    const clock = () => page.getByText(/^\d:\d\d\.\d \//).element().textContent
    const clipBy = (name: string, nth = 0) =>
      page.getByTitle(`${name} · double-click to choose the part`).elements()[nth]!
    const dragClip = async (name: string, seconds: number, nth = 0) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const ruler = page.getByRole('slider', { name: 'Timeline ruler' })
      const pps = unit()
      const left = parseFloat(leftOf(clipBy(name, nth)))
      await userEvent.dragAndDrop(clipBy(name, nth), ruler, {
        sourcePosition: { x: 30, y: 20 },
        targetPosition: { x: left + 30 + seconds * pps, y: 5 }
      })
    }
    const at = (name: string, nth = 0) =>
      parseFloat(leftOf(clipBy(name, nth))) / unit()

    test('opens when a clip is dragged to the right, and the clock counts it', async () => {
      await open()
      await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))

      await dragClip(SECOND, 2)

      expect(at(SECOND)).toBeCloseTo(12, 1)
      expect(clock()).toBe('0:00.0 / 0:18.0')
      expect(document.body.textContent).toContain('Film 0:18.0')
    })

    test('takes the text and the music that come later along with Ripple on', async () => {
      await open({ ...later, texts: [{ ...later.texts[0]!, at: 11 }] })
      await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
      const pps = unit()

      await dragClip(SECOND, 2)

      expect(parseFloat(leftOf(textBlock()))).toBeCloseTo(13 * pps, -1)
      expect(parseFloat(leftOf(page.getByTitle('song.mp3').element()))).toBeCloseTo(15 * pps, -1)
    })

    test('keeps the later clips where they are with Ripple off, and stops when the next gap is used up', async () => {
      await open({ clips: THIRD })
      await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
      await userEvent.click(page.getByRole('button', { name: 'Ripple', exact: true }))

      await dragClip(SECOND, 2)
      expect(at(SECOND)).toBeCloseTo(12, 1)
      expect(at(SECOND, 1)).toBeCloseTo(16, 1)

      await dragClip(SECOND, 4)
      expect(at(SECOND)).toBeCloseTo(13, 1)
      expect(at(SECOND, 1)).toBeCloseTo(16, 1)
      expect(clock()).toBe('0:00.0 / 0:19.0')
    })

    test('closes when the clip is dragged back, stops against the clip before and swaps past its middle', async () => {
      await open({ clips: [THIRD[0]!, { ...THIRD[1]!, end: 6, gap: 3 }] })
      await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))
      expect(at(SECOND)).toBeCloseTo(13, 1)

      await dragClip(SECOND, -2)
      expect(at(SECOND)).toBeCloseTo(11, 1)

      await dragClip(SECOND, -4)
      expect(at(SECOND)).toBeCloseTo(10, 1)
      expect(clock()).toBe('0:00.0 / 0:16.0')

      await dragClip(SECOND, -9)
      expect(at(SECOND)).toBeCloseTo(0, 1)
    })

    test('pulls the dragged clip to the edge of its neighbour with Snap on', async () => {
      await open({ clips: THIRD })
      await userEvent.click(page.getByRole('button', { name: 'Ripple', exact: true }))

      await dragClip(SECOND, 2.9)

      expect(at(SECOND)).toBeCloseTo(13, 3)
    })

    test('is taken back with one Undo', async () => {
      await open()
      await userEvent.click(page.getByRole('button', { name: 'Snap', exact: true }))

      await dragClip(SECOND, 2)
      expect(clock()).toBe('0:00.0 / 0:18.0')
      await userEvent.click(page.getByRole('button', { name: 'Undo' }))

      expect(clock()).toBe('0:00.0 / 0:16.0')
      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    })

    test('is set from the Starts at box of the picked clip', async () => {
      await open()
      await userEvent.click(clipBy(SECOND))

      await userEvent.fill(page.getByRole('textbox', { name: 'Starts at' }), '0:12.5')
      await userEvent.keyboard('{Enter}')

      expect(clock()).toBe('0:00.0 / 0:18.5')
      await userEvent.fill(page.getByRole('textbox', { name: 'Starts at' }), '0:03.0')
      await userEvent.keyboard('{Enter}')
      expect(clock()).toBe('0:00.0 / 0:16.0')
    })

    test('is moved by a tenth of a second with Alt and the arrows, a second with Shift', async () => {
      await open()
      await userEvent.click(clipBy(SECOND))

      await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
      expect(clock()).toBe('0:00.0 / 0:16.1')
      await userEvent.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}')
      expect(clock()).toBe('0:00.0 / 0:17.1')
      await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}')
      expect(clock()).toBe('0:00.0 / 0:17.0')
    })

    test('is black in the picture while the playhead is in it', async () => {
      await open({ clips: THIRD })

      await playheadAt(14)

      await expect.element(page.getByText('No sound', { exact: true })).toBeVisible()
      expect(document.querySelector('video')?.className).toContain('invisible')
    })
  })

  describe('the timeline', () => {
    const ruler = () => page.getByRole('slider', { name: 'Timeline ruler' }).element() as HTMLElement
    const scroller = () => ruler().closest('.overflow-auto') as HTMLElement
    const zoom = () => Number((page.getByRole('slider', { name: 'Zoom the timeline' }).element() as HTMLInputElement).value)
    const clock = () => page.getByText(/^\d:\d\d\.\d \//).element().textContent
    const secondClipX = () => page.getByTitle(`${SECOND} · double-click to choose the part`).element().getBoundingClientRect().left
    const wheel = (init: WheelEventInit) =>
      scroller().dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, clientY: 400, ...init })
      )
    const touch = (type: string, id: number, x: number) =>
      scroller().dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: 600 })
      )

    test('runs to the end of the last text or piece of music, not of the last video', async () => {
      await open(later)

      expect(ruler().getAttribute('aria-valuemax')).toBe('18')
      expect(clock()).toBe('0:00.0 / 0:18.0')
      expect(document.body.textContent).toContain('Film 0:16.0')
      for (let i = 0; i < 3; i++) await userEvent.click(page.getByRole('button', { name: 'Next clip' }))
      expect(clock()).toBe('0:18.0 / 0:18.0')
      expect(ruler().getAttribute('aria-valuenow')).toBe('18')
    })

    test('fills the width of its parent, ticks across it, and a click beyond the end goes to the end', async () => {
      await open({ clips: [{ id: 'clip-1', name: FIRST, start: 0, end: 3, sound: false }] })

      const lane = scroller().clientWidth - 150
      expect(ruler().getBoundingClientRect().width).toBeCloseTo(lane, 0)
      const ticks = [...ruler().querySelectorAll<HTMLElement>('span')]
      expect(parseFloat(ticks.at(-1)!.style.left)).toBeGreaterThan(lane * 0.8)
      await userEvent.click(ruler(), { position: { x: lane - 20, y: 5 } })
      expect(ruler().getAttribute('aria-valuenow')).toBe('3')
    })

    test('zooms about the pointer with Ctrl and the wheel, and not with the wheel alone', async () => {
      await open()
      const before = zoom()
      const x = secondClipX()

      wheel({ deltaY: -100, clientX: x })
      await new Promise((resolve) => requestAnimationFrame(resolve))
      expect(zoom()).toBe(before)
      wheel({ deltaY: -50, clientX: x, ctrlKey: true })
      await expect.poll(zoom).toBeGreaterThan(before)
      expect(Math.abs(secondClipX() - x)).toBeLessThan(2)
    })

    test('zooms with two fingers, about their middle', async () => {
      await open()
      const before = zoom()
      const x = secondClipX()

      touch('pointerdown', 1, x - 50)
      touch('pointerdown', 2, x + 50)
      touch('pointermove', 2, x + 100)
      touch('pointermove', 1, x - 100)
      touch('pointerup', 1, x - 100)
      touch('pointerup', 2, x + 100)

      await expect.poll(zoom).toBeGreaterThan(before)
      expect(Math.abs(secondClipX() - x)).toBeLessThan(2)
    })

    test('changes nothing when a clip is dragged while two fingers are down', async () => {
      await open()
      touch('pointerdown', 1, 300)
      touch('pointerdown', 2, 400)

      await userEvent.dragAndDrop(
        page.getByTitle(`${SECOND} · double-click to choose the part`),
        page.getByRole('slider', { name: 'Timeline ruler' }),
        { sourcePosition: { x: 30, y: 20 }, targetPosition: { x: 400, y: 5 } }
      )

      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    })

    test('changes nothing when two fingers pinch the timeline', async () => {
      await open()
      const x = secondClipX()

      touch('pointerdown', 1, x - 50)
      touch('pointerdown', 2, x + 50)
      touch('pointermove', 2, x + 100)
      touch('pointerup', 1, x - 50)
      touch('pointerup', 2, x + 100)

      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
      expect(clock()).toBe('0:00.0 / 0:16.0')
    })

    test('pans with one finger on the empty part of the timeline', async () => {
      await open()
      const x = secondClipX()
      wheel({ deltaY: -400, clientX: x, ctrlKey: true })
      await expect.poll(() => scroller().scrollWidth > scroller().clientWidth).toBe(true)
      const before = scroller().scrollLeft

      touch('pointerdown', 1, 600)
      touch('pointermove', 1, 500)
      touch('pointerup', 1, 500)

      expect(scroller().scrollLeft).toBeGreaterThan(before + 50)
    })

    test('forgets a finger that lost its capture or when the window loses focus', async () => {
      await open()
      const before = zoom()
      const x = secondClipX()

      touch('pointerdown', 1, x - 50)
      scroller().dispatchEvent(
        new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1, pointerType: 'touch' })
      )
      touch('pointerdown', 2, x + 50)
      touch('pointermove', 2, x + 150)
      touch('pointerup', 2, x + 150)
      expect(zoom()).toBe(before)

      touch('pointerdown', 3, x - 50)
      window.dispatchEvent(new Event('blur'))
      touch('pointerdown', 4, x + 50)
      touch('pointermove', 4, x + 150)
      expect(zoom()).toBe(before)
      touch('pointerup', 4, x + 150)
    })

    test('changes nothing when a drag ends while two fingers are down', async () => {
      await open()
      const handle = document.querySelector<HTMLElement>('[aria-label="Trim the end"]')!
      touch('pointerdown', 1, 300)
      touch('pointerdown', 2, 400)

      await userEvent.dragAndDrop(handle, handle, {
        sourcePosition: { x: 4, y: 5 },
        targetPosition: { x: -20, y: 5 }
      })

      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    })
  })
})

describe('a crossfade between two clips', () => {
  const clock = () => page.getByText(/^\d:\d\d\.\d \//).element().textContent
  const fadeButton = () => page.getByRole('button', { name: 'Fade in', exact: true })
  const handle = () => page.getByRole('slider', { name: `Fade into ${SECOND}` })
  const pick = (name: string) => userEvent.click(page.getByTitle(`${name} · double-click to choose the part`))

  test('is added with one click on the picked clip, shortens the film, and is taken off with a second click', async () => {
    await open()
    expect(clock()).toBe('0:00.0 / 0:16.0')
    await pick(SECOND)
    await expect.element(fadeButton()).toBeEnabled()
    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(fadeButton())

    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'true')
    expect(clock()).toBe('0:00.0 / 0:15.0')
    expect(document.body.textContent).toContain('Film 0:15.0')
    await userEvent.click(fadeButton())
    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'false')
    expect(clock()).toBe('0:00.0 / 0:16.0')
  })

  test('is not offered on the first clip or with nothing picked, and says why', async () => {
    await open()
    await expect.element(fadeButton()).toBeDisabled()
    await pick(FIRST)
    await expect.element(fadeButton()).toBeDisabled()
    await expect.element(fadeButton()).toHaveAttribute('title', 'The first clip has no clip before it to fade from (F)')
  })

  test('is not offered beside a gap, and says why', async () => {
    await open({
      clips: [
        { id: 'clip-1', name: FIRST, start: 0, end: 10, sound: false },
        { id: 'clip-2', name: SECOND, start: 0, end: 6, sound: false, gap: 2 }
      ]
    })
    await pick(SECOND)

    await expect.element(fadeButton()).toBeDisabled()
    await expect.element(fadeButton()).toHaveAttribute('title', 'A gap separates the two clips: close it first (F)')
  })

  test('is not offered when a clip is shorter than 0.4 seconds', async () => {
    await open({
      clips: [
        { id: 'clip-1', name: FIRST, start: 0, end: 10, sound: false },
        { id: 'clip-2', name: SECOND, start: 0, end: 0.3, sound: false }
      ]
    })
    await pick(SECOND)

    await expect.element(fadeButton()).toBeDisabled()
    await expect.element(fadeButton()).toHaveAttribute('title', 'A clip shorter than 0.4 seconds cannot fade (F)')
  })

  test('is taken back in one step by Undo', async () => {
    await open()
    await pick(SECOND)
    await userEvent.click(fadeButton())
    expect(clock()).toBe('0:00.0 / 0:15.0')

    await userEvent.click(page.getByRole('button', { name: 'Undo' }))

    expect(clock()).toBe('0:00.0 / 0:16.0')
    await expect.element(page.getByRole('slider', { name: `Fade into ${SECOND}` }).query()).toBeNull()
  })

  test('is drawn as an overlap at the start of the clip, with a handle that arrow keys and the pointer change', async () => {
    await open()
    await pick(SECOND)
    await userEvent.click(fadeButton())
    const pps = (parseFloat((page.getByTitle(`${FIRST} · double-click to choose the part`).element() as HTMLElement).style.width) + 2) / 10

    await expect.element(handle()).toHaveAttribute('aria-valuenow', '1')
    expect(parseFloat(leftOf(handle().element()))).toBeCloseTo(9 * pps, 1)
    expect(parseFloat((handle().element() as HTMLElement).style.width)).toBeCloseTo(pps, 1)
    expect(parseFloat(leftOf(page.getByTitle(`${SECOND} · double-click to choose the part`).element()))).toBeCloseTo(9 * pps, 1)

    handle().element().focus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '1.1')
    expect(clock()).toBe('0:00.0 / 0:14.9')
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '2.1')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '1.9')

    const grip = handle().element() as HTMLElement
    await userEvent.dragAndDrop(grip, grip, {
      sourcePosition: { x: 1.5 * pps, y: 5 },
      targetPosition: { x: 0.5 * pps, y: 5 }
    })
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '2.9')
  })

  test('holds the handle to half of the shorter clip and to its least from the keyboard', async () => {
    await open()
    await pick(SECOND)
    await userEvent.click(fadeButton())
    handle().element().focus()
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '3')

    for (let i = 0; i < 30; i++) await userEvent.keyboard('{ArrowRight}')

    await expect.element(handle()).toHaveAttribute('aria-valuenow', '0.2')
    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(fadeButton())
    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'false')
    expect(clock()).toBe('0:00.0 / 0:16.0')
  })

  test('keeps the trim grips of both clips reachable at the fade and trims with them', async () => {
    await open()
    await pick(SECOND)
    await userEvent.click(fadeButton())
    const grips = [
      document.querySelectorAll<HTMLElement>('[aria-label="Trim the end"]')[0]!,
      document.querySelectorAll<HTMLElement>('[aria-label="Trim the start"]')[1]!
    ]
    for (const grip of grips) {
      const box = grip.getBoundingClientRect()
      expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)).toBe(grip)
    }
    const clip = page.getByTitle(`${FIRST} · double-click to choose the part`)
    const width = () => parseFloat((clip.element() as HTMLElement).style.width)
    const before = width()
    await userEvent.dragAndDrop(grips[0]!, grips[0]!, {
      sourcePosition: { x: 4, y: 5 },
      targetPosition: { x: 4 - pxPerSecond(), y: 5 }
    })
    expect(width()).toBeLessThan(before - pxPerSecond() / 2)
  })

  test('has the same switch and a length in the inspector of the picked clip', async () => {
    await open()
    await pick(SECOND)
    const fade = page.getByRole('checkbox', { name: 'Fade from the previous clip' })
    await expect.element(fade).not.toBeChecked()

    await userEvent.click(fade)

    await expect.element(fade).toBeChecked()
    await expect.element(fadeButton()).toHaveAttribute('aria-pressed', 'true')
    await userEvent.fill(page.getByRole('slider', { name: 'Length of the fade' }), '2')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '2')
    expect(clock()).toBe('0:00.0 / 0:14.0')
    await userEvent.fill(page.getByRole('slider', { name: 'Length of the fade' }), '0.2')
    await expect.element(handle()).toHaveAttribute('aria-valuenow', '0.2')
    await userEvent.click(fade)
    await expect.element(fade).not.toBeChecked()
    expect(clock()).toBe('0:00.0 / 0:16.0')
  })

  test('is saved with the film', async () => {
    const posts: string[] = []
    vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(String(init.body))
        return Response.json({ ok: true })
      }
      return Response.json(answer)
    })
    await render(createElement(FilmEditor, { groupId: 'g1', onClose: () => {} }))
    await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`)).toBeVisible()
    await pick(SECOND)
    await userEvent.click(fadeButton())

    await expect.poll(() => posts.length, { timeout: 3000 }).toBeGreaterThan(0)
    expect(posts.at(-1)).toContain('fade')
  })

  test('shows both clips in the stage inside the overlap, the new one fading in over the old one', async () => {
    await open({
      clips: [
        { id: 'clip-1', name: FIRST, start: 0, end: 10, sound: false },
        { id: 'clip-2', name: SECOND, start: 0, end: 6, sound: false, fade: 2 }
      ]
    })
    const layers = () => [...document.querySelectorAll<HTMLVideoElement>('.film-stage video')]
    await expect.poll(() => layers().length).toBe(2)
    const opacities = () => layers().map((one) => parseFloat(one.style.opacity || '1'))

    expect(layers()[0]!.dataset.src).toBeUndefined()
    await playheadAt(7)
    expect(opacities()[1]).toBe(1)
    expect(layers()[0]!.className).toContain('invisible')

    await playheadAt(2)
    expect(layers()[1]!.className).not.toContain('invisible')
    expect(layers()[1]!.dataset.src).toContain(FIRST)
    expect(layers()[0]!.dataset.src).toContain(SECOND)
    expect(opacities()[0]).toBeCloseTo(0.5, 2)
    expect(layers()[1]!.volume).toBeCloseTo(0.5, 2)

    await playheadAt(1)
    expect(layers()[1]!.className).toContain('invisible')
    expect(opacities()[0]).toBe(1)
  })
})

describe('the film editor’s own page', () => {
  const posts = [] as string[]
  const stubFetch = () => {
    posts.length = 0
    vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(String(init.body))
        return Response.json({ ok: true })
      }
      return Response.json(answer)
    })
  }

  const visit = async (entries: string[], index?: number) => {
    stubFetch()
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <>
            <Link to='/elsewhere'>Elsewhere</Link>
            <Outlet />
          </>
        ),
        children: [
          { path: 'montage/:name', Component: () => <p>Luc Favre’s page</p> },
          { path: 'elsewhere', Component: () => <p>Somewhere else</p> },
          {
            path: 'edit/:groupId',
            Component: Edit,
            loader: () => ({ groupId: 'g1', day: '06.09.2026', back: '/montage/Luc' })
          }
        ]
      }
    ])
    await render(createElement(Stub, { initialEntries: entries, initialIndex: index }))
  }

  test('goes back to where it was opened from when it is closed', async () => {
    await visit(['/elsewhere', '/edit/g1'], 1)

    await expect.element(page.getByRole('main', { name: 'Film editor' })).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Close', exact: true }))

    await expect.element(page.getByText('Somewhere else')).toBeVisible()
  })

  test('goes to the montage’s page when it was the page loaded first', async () => {
    await visit(['/edit/g1'])

    await expect.element(page.getByText(`${FIRST}`).first()).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Close', exact: true }))

    await expect.element(page.getByText('Luc Favre’s page')).toBeVisible()
  })

  test('saves what was changed when the page is left some other way than closing it', async () => {
    await visit(['/montage/Luc', '/edit/g1'], 1)
    await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`)).toBeVisible()
    await userEvent.click(page.getByTitle(`${SECOND} · double-click to choose the part`))
    await userEvent.click(page.getByRole('button', { name: 'Delete', exact: true }))
    expect(posts).toEqual([])

    await userEvent.click(page.getByRole('link', { name: 'Elsewhere' }))

    await expect.element(page.getByText('Somewhere else')).toBeVisible()
    await expect.poll(() => posts.length).toBe(1)
  })
})

describe('the film editor and the film templates', () => {
  const posts: Array<{ url: string; body: Record<string, any> }> = []

  const summer = { name: 'Summer.mp3', path: '/m/Summer.mp3', seconds: 300 }

  const look = {
    effect: 'fade',
    font: 'bold',
    x: 0.5,
    y: 0.5,
    size: 0.09,
    colour: '#ffffff'
  }

  const club = {
    name: 'Club',
    missing: [] as string[],
    template: {
      version: 1,
      length: 16,
      underSound: 0.3,
      texts: [{ ...look, text: '{name} on {day}', from: 'start', at: 0, seconds: 4 }],
      music: [{ name: 'Summer.mp3', from: 'start', at: 0, start: 0, end: 60, volume: 0.8 }]
    }
  }

  const titled = {
    texts: [{ ...look, id: 'text-1', text: 'Luc Favre', at: 0, seconds: 4 }],
    music: []
  }

  const start = async ({
    saved = true,
    templates = [club],
    listed = true,
    edit = {}
  }: {
    saved?: boolean
    templates?: unknown[]
    listed?: boolean
    edit?: Record<string, unknown>
  } = {}) => {
    posts.length = 0
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
        return Response.json({ ok: true })
      }
      if (String(url).includes('/api/film-templates'))
        return Response.json(listed ? { templates, music: [summer] } : { nope: true })
      return Response.json({ ...answer, saved, music: [summer], edit: { ...answer.edit, ...edit } })
    })
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => <FilmEditor groupId='g1' day='06.09.2026' onClose={() => {}} />
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`)).toBeVisible()
  }

  const edits = () => posts.filter((one) => one.url.includes('/api/edit'))
  const picker = () => page.getByRole('dialog', { name: 'Start the film from a film template?' })
  const modal = () => page.getByRole('dialog', { name: 'Film template' })

  test('does not let a key through to the editor from the picker or the film template dialog', async () => {
    const pressed = (name: string) =>
      page.getByRole('button', { name, exact: true }).element().getAttribute('aria-pressed')
    await start({ saved: false })
    await expect.element(picker()).toBeVisible()
    await userEvent.keyboard('r')
    await userEvent.keyboard('s')
    await userEvent.keyboard('{End}')
    expect([pressed('Ripple'), pressed('Snap')]).toEqual(['true', 'true'])
    await expect.element(page.getByText('0:00.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(picker()).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Film template…' }))
    await expect.element(modal()).toBeVisible()
    await userEvent.keyboard('r')
    await userEvent.keyboard('{End}')
    expect(pressed('Ripple')).toBe('true')
    await expect.element(page.getByText('0:00.0 / 0:16.0', { exact: true })).toBeVisible()
  })

  test('starts the film as usual when there is no film template, or the list cannot be read', async () => {
    await start({ saved: false, templates: [] })
    await expect.poll(() => edits().length, { timeout: 3000 }).toBe(1)
    await expect.element(picker()).not.toBeInTheDocument()
  })

  test('starts the film as usual when the list of film templates cannot be read', async () => {
    await start({ saved: false, listed: false })
    await expect.poll(() => edits().length, { timeout: 3000 }).toBe(1)
    await expect.element(picker()).not.toBeInTheDocument()
    await expect.element(page.getByText('The film templates could not be read.')).toBeVisible()
  })

  test('names the music of the chosen film template that is left out', async () => {
    const lost = {
      ...club,
      name: 'Lost',
      template: {
        ...club.template,
        music: [{ name: 'Gone.mp3', from: 'start', at: 0, start: 0, end: 20, volume: 1 }]
      }
    }
    await start({ saved: false, templates: [lost] })
    await userEvent.click(picker().getByRole('radio', { name: /Lost/ }))
    await userEvent.click(picker().getByRole('button', { name: 'Start the film' }))
    await expect
      .element(page.getByText('Not in the music folder, left out: Gone.mp3'))
      .toBeVisible()
  })

  test('does not ask when the film was started before', async () => {
    await start()
    await expect.element(picker()).not.toBeInTheDocument()
  })

  test('asks which film template to start from, with the last one ticked, and saves nothing before the choice', async () => {
    setFilmTemplateChoice('Club')
    await start({ saved: false })

    await expect.element(picker()).toBeVisible()
    await expect.element(picker().getByRole('radio', { name: /Club/ })).toBeChecked()
    await expect.element(picker().getByRole('radio', { name: /No film template/ })).not.toBeChecked()
    await expect
      .element(picker().getByText('1 text · 1 piece of music · 0:16'))
      .toBeVisible()
    await new Promise((done) => setTimeout(done, 1200))
    expect(edits()).toEqual([])

    await userEvent.click(picker().getByRole('button', { name: 'Start the film' }))

    await expect.element(picker()).not.toBeInTheDocument()
    await expect.poll(() => edits().length, { timeout: 3000 }).toBe(1)
    const saved = edits()[0]!.body.edit
    expect(saved.texts.map((one: { text: string }) => one.text)).toEqual(['Luc Favre on 06.09.2026'])
    expect(saved.music[0]).toMatchObject({ name: 'Summer.mp3', end: 16, volume: 0.8 })
    expect(saved.underSound).toBe(0.3)
    setFilmTemplateChoice('')
  })

  test('starts with none when the choice is dismissed with Escape', async () => {
    await start({ saved: false })
    await expect.element(picker().getByRole('radio', { name: /No film template/ })).toBeChecked()

    await userEvent.keyboard('{Escape}')

    await expect.element(picker()).not.toBeInTheDocument()
    await expect.poll(() => edits().length, { timeout: 3000 }).toBe(1)
    expect(edits()[0]!.body.edit.texts).toEqual([])
  })

  test('applies a film template in one Undo step and says what it replaces and what is left out', async () => {
    const lost = {
      ...club,
      name: 'Lost',
      template: {
        ...club.template,
        music: [{ name: 'Gone.mp3', from: 'start', at: 0, start: 0, end: 20, volume: 1 }]
      }
    }
    await start({ edit: titled, templates: [club, lost] })
    await userEvent.click(page.getByRole('button', { name: 'Film template…' }))
    const apply = modal().getByRole('button', { name: 'Apply' })
    await expect.element(apply).toBeDisabled()

    await userEvent.click(modal().getByRole('radio', { name: /Lost/ }))

    await expect
      .element(
        modal().getByText(
          'It replaces the 1 text, the 0 pieces of music and the camera-sound level of this film. Your clips stay. Undo brings it back.'
        )
      )
      .toBeVisible()
    await expect
      .element(modal().getByText('Not in the music folder, left out: Gone.mp3'))
      .toBeVisible()
    await userEvent.click(modal().getByRole('radio', { name: /Club/ }))
    await userEvent.click(apply)

    await expect.element(modal()).not.toBeInTheDocument()
    await expect.element(page.getByText('Luc Favre on 06.09.2026').first()).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Undo' }))
    await expect.element(page.getByText('Luc Favre on 06.09.2026')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('drops the selection when a film template is applied and keeps the old film after Undo', async () => {
    await start({ edit: titled })
    const title = () =>
      [...document.querySelectorAll<HTMLElement>('div.cursor-grab')].find((one) =>
        one.textContent?.includes('Luc Favre')
      )!
    await userEvent.click(title())
    await expect.element(page.getByRole('textbox')).toHaveValue('Luc Favre')

    await userEvent.click(page.getByRole('button', { name: 'Film template…' }))
    await userEvent.click(modal().getByRole('radio', { name: /Club/ }))
    await userEvent.click(modal().getByRole('button', { name: 'Apply' }))

    await expect.element(page.getByText('Luc Favre on 06.09.2026').first()).toBeVisible()
    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Undo' }))
    await expect.element(page.getByText('Luc Favre on 06.09.2026')).not.toBeInTheDocument()
    expect(title()).toBeTruthy()
    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
  })

  test('forgets a remembered film template that is no longer there, and ticks none', async () => {
    setFilmTemplateChoice('Gone')
    await start({ saved: false })

    await expect.element(picker().getByRole('radio', { name: /No film template/ })).toBeChecked()
    await expect.poll(() => localStorage.getItem('skydock.filmTemplate')).toBeNull()
  })

  test('says so when the film has no texts or music yet', async () => {
    await start()
    await userEvent.click(page.getByRole('button', { name: 'Film template…' }))
    await userEvent.click(modal().getByRole('radio', { name: /Club/ }))
    await expect
      .element(modal().getByText('This film has no texts or music yet. Your clips stay.'))
      .toBeVisible()
  })

  test('keeps the film as a film template under a name and offers to replace one that is there', async () => {
    await start({ edit: titled })
    await userEvent.click(page.getByRole('button', { name: 'Film template…' }))
    await expect
      .element(
        modal().getByText(
          'Keeps 1 text, 0 pieces of music and the camera-sound level. The clips stay with this film.'
        )
      )
      .toBeVisible()
    await expect
      .element(
        modal().getByText(
          "Texts are saved as typed, apart from the passenger's name and the day, which become {name} and {day} and are filled in again for each film. Any other personal text stays in the film template file."
        )
      )
      .toBeVisible()

    await userEvent.fill(modal().getByLabelText('Name'), 'Mine')
    await userEvent.click(modal().getByRole('button', { name: 'Save', exact: true }))

    await expect
      .element(modal().getByText('Saved as film template Mine.'))
      .toBeVisible()
    const kept = posts.find((one) => one.url.includes('/api/film-templates'))!.body
    expect(kept).toMatchObject({ intent: 'save', name: 'Mine', replace: false })
    expect(kept.template.texts[0]).toMatchObject({ text: '{name}', from: 'start', at: 0 })

    await userEvent.fill(modal().getByLabelText('Name'), 'Club')
    await expect
      .element(modal().getByText('A film template called Club is already there.'))
      .toBeVisible()
    await userEvent.click(modal().getByRole('button', { name: 'Replace it' }))
    await expect.poll(() => posts.at(-1)!.body.replace).toBe(true)
  })
})

describe('the film editor text cards', () => {
  const tileOf = (card: Element) => card.querySelector<HTMLElement>('[data-effect]')!
  const animationOf = (card: Element) =>
    getComputedStyle(tileOf(card).querySelector('.fx-text')!).animationName
  const cardNamed = (name: string | RegExp) => page.getByRole('button', { name }).element()

  const openTextTab = async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Text', exact: true }))
  }

  const pickText = async () => {
    await open(later)
    await userEvent.click(textBlock())
  }

  test('shows each text preset as a card with a sky tile, the sample text, its name and its effect', async () => {
    await openTextTab()

    const subtitle = cardNamed(/Subtitle/)
    expect(tileOf(subtitle).dataset.effect).toBe('rise')
    expect(tileOf(subtitle).textContent).toBe('Your text')
    expect(getComputedStyle(tileOf(subtitle)).backgroundImage).toContain('linear-gradient')
    expect(subtitle.textContent).toContain('Rise')
    expect(tileOf(cardNamed(/Title/)).textContent).toBe('Luc Favre')
    expect(tileOf(cardNamed(/Big moment/)).dataset.effect).toBe('pop')
  })

  test('names a card by its preset only and grows the sample text from its centre', async () => {
    await openTextTab()

    const subtitle = page.getByRole('button', { name: 'Subtitle', exact: true }).element()
    const sample = tileOf(subtitle).querySelector<HTMLElement>('.fx-text')!
    expect(tileOf(subtitle).getAttribute('aria-hidden')).toBe('true')
    expect(Math.abs(parseFloat(getComputedStyle(sample).transformOrigin) - sample.offsetWidth / 2)).toBeLessThan(1)
  })

  test('plays the effect of a preset in its tile on hover and on focus, and not otherwise', async () => {
    await openTextTab()

    const subtitle = cardNamed(/Subtitle/)
    expect(animationOf(subtitle)).toBe('none')
    await userEvent.hover(page.getByRole('button', { name: /Subtitle/ }))
    expect(animationOf(subtitle)).toBe('fx-rise')
    expect(getComputedStyle(tileOf(subtitle).querySelector('.fx-text')!).animationDuration).toBe(`${TILE_LOOP * TEXT_FADE}s`)
    await userEvent.hover(page.getByRole('button', { name: /Big moment/ }))
    expect(animationOf(cardNamed(/Big moment/))).toBe('fx-pop')
    await userEvent.hover(page.getByRole('button', { name: /Lower third/ }))
    expect(animationOf(cardNamed(/Lower third/))).toBe('fx-lower')
    await userEvent.hover(page.getByRole('button', { name: 'Undo' }))
    expect(animationOf(subtitle)).toBe('none')
    await userEvent.keyboard('{Tab}')
    subtitle.focus()
    expect(animationOf(subtitle)).toBe('fx-rise')
  })

  test('keeps the pop of a card as long as the pop of the film', () => {
    const keyframes = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule && rule.name === 'fx-pop')!
    const offsets = [...keyframes.cssRules].map((rule) => parseFloat((rule as CSSKeyframeRule).keyText))
    const at = (POP / (TILE_LOOP * TEXT_FADE)) * 100
    expect(offsets.some((offset) => Math.abs(offset - at) < 0.005)).toBe(true)
  })

  test('still puts the text at the playhead when a card is clicked', async () => {
    await openTextTab()

    await userEvent.click(page.getByRole('button', { name: /Subtitle/ }))

    await expect.element(page.getByRole('textbox', { name: 'Text' })).toHaveValue('Your text')
  })

  test('stops the animations of the cards for people who ask for less motion', async () => {
    await openTextTab()

    const rules = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
      .filter((rule) => rule.conditionText.includes('prefers-reduced-motion'))
      .flatMap((rule) => [...rule.cssRules].map((one) => one.cssText))
    expect(rules.some((text) => text.startsWith('.fx-card .fx-text') && text.includes('animation') && text.includes('none !important'))).toBe(true)
  })

  test('shows the effects of a picked text as cards, the current one pressed and playing', async () => {
    await pickText()

    const fade = cardNamed('Fade')
    expect(fade.getAttribute('aria-pressed')).toBe('true')
    expect(tileOf(fade).dataset.effect).toBe('fade')
    expect(animationOf(fade)).toBe('fx-fade')
    expect(cardNamed('Rise').getAttribute('aria-pressed')).toBe('false')
    expect(animationOf(cardNamed('Rise'))).toBe('none')
    await userEvent.hover(page.getByRole('button', { name: 'Rise', exact: true }))
    expect(animationOf(cardNamed('Rise'))).toBe('fx-rise')
  })

  test('changes the effect with one click on its card and takes it back with one Undo', async () => {
    await pickText()

    await userEvent.click(page.getByRole('button', { name: 'Pop', exact: true }))
    expect(cardNamed('Pop').getAttribute('aria-pressed')).toBe('true')
    expect(cardNamed('Fade').getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(page.getByRole('button', { name: 'Undo' }))
    expect(cardNamed('Fade').getAttribute('aria-pressed')).toBe('true')
  })

  test('shows each font as a button with Aa in that font, the current one pressed', async () => {
    await pickText()

    for (const name of ['Clean', 'Bold', 'Elegant', 'Hand']) {
      expect(cardNamed(name).textContent).toBe('Aa')
    }
    expect(cardNamed('Bold').getAttribute('aria-pressed')).toBe('true')
    expect(cardNamed('Elegant').className).toContain('italic')
    await userEvent.click(page.getByRole('button', { name: 'Elegant', exact: true }))
    expect(cardNamed('Elegant').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the preview at a seam', () => {
  const holdDecodes = () => {
    const waiting: Array<() => void> = []
    const spy = vi.spyOn(Image.prototype, 'decode').mockImplementation(
      () => new Promise<void>((resolve) => waiting.push(resolve))
    )
    return { release: () => waiting.splice(0).forEach((resolve) => resolve()), spy }
  }

  test('does not start a video when a photo finishes decoding after the playhead was paused', async () => {
    const held = holdDecodes()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    await open(
      {
        clips: [
          { id: 'clip-1', name: PHOTO, start: 0, end: 3, sound: false },
          { id: 'clip-2', name: FIRST, start: 0, end: 5, sound: false }
        ]
      },
      [],
      [photo]
    )
    await playheadAt(3)
    await userEvent.click(page.getByRole('button', { name: 'Play', exact: true }))
    await userEvent.click(page.getByRole('button', { name: 'Pause', exact: true }))
    const before = play.mock.calls.length
    held.release()
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(play.mock.calls.length).toBe(before)
    held.spy.mockRestore()
    play.mockRestore()
  })

  test('keeps the picture of the layer in front until the layer a far jump moves to has its frame', async () => {
    const held = holdDecodes()
    await open(
      {
        clips: [
          { id: 'clip-1', name: FIRST, start: 0, end: 3, sound: false },
          { id: 'clip-2', name: SECOND, start: 0, end: 3, sound: false },
          { id: 'clip-3', name: PHOTO, start: 0, end: 3, sound: false }
        ]
      },
      [],
      [photo]
    )
    const decks = [...document.querySelectorAll<HTMLVideoElement>('.film-stage video')]
    const inFront = () => decks.findIndex((one) => !one.classList.contains('invisible'))
    const front = inFront()
    ready.mockReturnValue(0)
    await playheadAt(7)

    expect(inFront()).toBe(front)
    expect(decks[front]!.dataset.src).toBe(`/api/file/o/${FIRST}`)
    expect(decks[1 - front]!.getAttribute('poster')).toBe(`/api/file/o/${PHOTO}`)
    held.release()

    await expect.poll(inFront).toBe(1 - front)
    held.spy.mockRestore()
  })
})

describe('the film editor keys', () => {
  const playing = () => page.getByRole('button', { name: 'Pause', exact: true })
  const stopped = () => page.getByRole('button', { name: 'Play', exact: true })
  const clock = () => page.getByText(/^\d:\d\d\.\d \//).element().textContent
  const pick = (name: string) => userEvent.click(page.getByTitle(`${name} · double-click to choose the part`))
  const tool = (name: string) => page.getByRole('button', { name, exact: true })

  test('plays and stops with Enter and with Space', async () => {
    await open()

    await userEvent.keyboard('{Enter}')
    await expect.element(playing()).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect.element(stopped()).toBeVisible()
    await userEvent.keyboard(' ')
    await expect.element(playing()).toBeVisible()
    await userEvent.keyboard(' ')
    await expect.element(stopped()).toBeVisible()
  })

  test('plays on a held key only once', async () => {
    await open()
    await userEvent.keyboard('{Enter>3/}')
    await userEvent.keyboard('{/Enter}')

    await expect.element(playing()).toBeVisible()
  })

  test('types a space in a text box, and commits a value with Enter, without playing', async () => {
    await open()
    await pick(SECOND)
    const box = page.getByRole('textbox', { name: 'Starts at' })
    await userEvent.click(box)
    await userEvent.keyboard(' ')
    expect((box.element() as HTMLInputElement).value).toContain(' ')
    await userEvent.keyboard('{Enter}')

    await expect.element(stopped()).toBeVisible()
  })

  test('plays instead of ticking a checkbox that the mouse focused', async () => {
    await open()
    await pick(SECOND)
    const box = page.getByRole('checkbox', { name: 'Fade from the previous clip' })
    await userEvent.click(box)
    await expect.element(box).toBeChecked()
    await userEvent.keyboard(' ')

    await expect.element(box).toBeChecked()
    await expect.element(playing()).toBeVisible()
  })

  test('plays instead of pressing a button that the mouse focused', async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Next clip' }))
    await expect.element(page.getByText('0:10.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{Enter}')

    await expect.element(playing()).toBeVisible()
    expect(clock()).not.toBe('0:16.0 / 0:16.0')
    await userEvent.keyboard(' ')
    await expect.element(stopped()).toBeVisible()
  })

  test('plays instead of nudging a slider that the mouse focused', async () => {
    await open()
    const zoom = page.getByRole('slider', { name: 'Zoom the timeline' })
    await userEvent.click(zoom)
    const was = (zoom.element() as HTMLInputElement).value
    await userEvent.keyboard('{Enter}')

    await expect.element(playing()).toBeVisible()
    expect((zoom.element() as HTMLInputElement).value).toBe(was)
  })

  test('does not press a button that the mouse focused when Enter is held', async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Next clip' }))
    await expect.element(page.getByText('0:10.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{Enter>3/}')
    await userEvent.keyboard('{/Enter}')

    await expect.element(page.getByText('0:10.0 / 0:16.0', { exact: true })).toBeVisible()
    await expect.element(playing()).toBeVisible()
  })

  test('lets the music file input that Tab reached keep its Enter', async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Music', exact: true }))
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    for (let i = 0; i < 80 && document.activeElement !== input; i++) await userEvent.tab()
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('{Enter}')

    await expect.element(stopped()).toBeVisible()
  })

  test('does not close the editor with Esc after a click on the dead space of a dialog', async () => {
    await open()
    await userEvent.keyboard('?')
    const help = page.getByRole('dialog', { name: 'Film editor shortcuts' })
    await userEvent.click(help)
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByRole('main', { name: 'Film editor' })).toBeVisible()
  })

  test('does not delete the picked clip with Delete on a button that Tab reached', async () => {
    await open()
    await pick(SECOND)
    const next = page.getByRole('button', { name: 'Next clip' }).element()
    for (let i = 0; i < 60 && document.activeElement !== next; i++) await userEvent.tab()
    const before = clipsOnTimeline().length
    await userEvent.keyboard('{Delete}')

    expect(clipsOnTimeline().length).toBe(before)
  })

  test('lets a button that Tab reached keep its Enter and its Space', async () => {
    await open()
    const next = page.getByRole('button', { name: 'Next clip' }).element()
    for (let i = 0; i < 60 && document.activeElement !== next; i++) await userEvent.tab()
    expect(document.activeElement).toBe(next)
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('0:10.0 / 0:16.0', { exact: true })).toBeVisible()
    await expect.element(stopped()).toBeVisible()
    await userEvent.keyboard(' ')
    await expect.element(stopped()).toBeVisible()
  })

  test('plays on Space and Enter with a clip block that Tab reached', async () => {
    await open()
    const block = clipsOnTimeline()[0] as HTMLElement
    for (let i = 0; i < 80 && document.activeElement !== block; i++) await userEvent.tab()
    expect(document.activeElement).toBe(block)
    await userEvent.keyboard(' ')

    await expect.element(playing()).toBeVisible()
  })

  test('plays on Space after a Tab-focused button lost its focus to a click on empty space', async () => {
    await open()
    const next = page.getByRole('button', { name: 'Next clip' }).element()
    for (let i = 0; i < 60 && document.activeElement !== next; i++) await userEvent.tab()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    await userEvent.keyboard(' ')

    await expect.element(playing()).toBeVisible()
  })

  test('toggles twice for two quick presses of Space', async () => {
    await open()
    await userEvent.keyboard('  ')

    await expect.element(stopped()).toBeVisible()
  })

  test('toggles Fade in with F for the picked clip, only where the button is enabled', async () => {
    await open()
    await userEvent.keyboard('f')
    await expect.element(tool('Fade in')).toHaveAttribute('aria-pressed', 'false')
    await pick(FIRST)
    await userEvent.keyboard('f')
    await expect.element(tool('Fade in')).toHaveAttribute('aria-pressed', 'false')
    await pick(SECOND)
    await userEvent.keyboard('f')
    await expect.element(tool('Fade in')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('f')
    await expect.element(tool('Fade in')).toHaveAttribute('aria-pressed', 'false')
  })

  test('deletes the picked clip with Delete and with Backspace', async () => {
    await open()
    await pick(SECOND)
    await userEvent.keyboard('{Backspace}')
    expect(clipsOnTimeline()).toHaveLength(1)
    await pick(FIRST)
    await userEvent.keyboard('{Delete}')
    expect(clipsOnTimeline()).toHaveLength(0)
  })

  test('turns Ripple on and off with R, and Snap with S', async () => {
    await open()
    await userEvent.keyboard('r')
    await expect.element(tool('Ripple')).toHaveAttribute('aria-pressed', 'false')
    await userEvent.keyboard('r')
    await expect.element(tool('Ripple')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('s')
    await expect.element(tool('Snap')).toHaveAttribute('aria-pressed', 'false')
  })

  test('adds a text at the playhead with T, and picks it', async () => {
    await open()
    await playheadAt(2)
    await userEvent.keyboard('t')

    await expect.element(page.getByRole('textbox', { name: 'Text' })).toBeVisible()
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect.element(page.getByRole('textbox', { name: 'Text' })).not.toBeInTheDocument()
  })

  test('selects with V', async () => {
    await open()
    await userEvent.keyboard('v')

    await expect.element(tool('Select')).toHaveAttribute('aria-pressed', 'true')
  })

  test('steps the playhead with the arrows, a second with Shift, and to the ends with Home and End', async () => {
    await open()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByText('0:00.1 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await expect.element(page.getByText('0:01.1 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(page.getByText('0:01.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{End}')
    await expect.element(page.getByText('0:16.0 / 0:16.0', { exact: true })).toBeVisible()
    await userEvent.keyboard('{Home}')
    await expect.element(page.getByText('0:00.0 / 0:16.0', { exact: true })).toBeVisible()
  })

  test('leaves the arrows to a slider that has focus', async () => {
    await open()
    const zoom = page.getByRole('slider', { name: 'Zoom the timeline' })
    await userEvent.click(zoom)
    const was = Number((zoom.element() as HTMLInputElement).value)
    await userEvent.keyboard('{ArrowRight}')

    expect(Number((zoom.element() as HTMLInputElement).value)).toBe(was + 1)
    await expect.element(page.getByText('0:00.0 / 0:16.0', { exact: true })).toBeVisible()
  })

  test('ignores the tool keys with Ctrl, Cmd or Alt held', async () => {
    await open()
    await userEvent.keyboard('{Control>}r{/Control}')
    await userEvent.keyboard('{Meta>}s{/Meta}')
    await userEvent.keyboard('{Alt>}t{/Alt}')

    await expect.element(tool('Ripple')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(tool('Snap')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelectorAll('div.cursor-grab').length).toBe(clipsOnTimeline().length)
  })

  test('names its key in the title and the keyshortcuts of each tool', async () => {
    await open()
    const keyed: Array<[string, string, string]> = [
      ['Cut at playhead', 'C', 'C'],
      ['Delete', 'Delete, Backspace', 'Delete Backspace'],
      ['Fade in', 'F', 'F'],
      ['Ripple', 'R', 'R'],
      ['Snap', 'S', 'S']
    ]
    for (const [name, key, shortcuts] of keyed) {
      const button = tool(name).element()
      expect(button.getAttribute('title')).toContain(`(${key})`)
      expect(button.getAttribute('aria-keyshortcuts')).toBe(shortcuts)
    }
  })

  test('lists the keys in a Shortcuts help, opened with ? or its button, closed with Esc, and gives the focus back', async () => {
    await open()
    await userEvent.keyboard('?')
    const help = page.getByRole('dialog', { name: 'Film editor shortcuts' })
    await expect.element(help).toBeVisible()
    await expect.element(help.getByText('Enter, Space')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(help).not.toBeInTheDocument()

    const opener = page.getByRole('button', { name: 'Shortcuts' })
    await userEvent.click(opener)
    await expect.element(help).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(help).not.toBeInTheDocument()
    expect(document.activeElement).toBe(opener.element())
    await expect.element(page.getByRole('main', { name: 'Film editor' })).toBeVisible()
  })

  test('does not let a key through to the editor from an open dialog', async () => {
    await open()
    await userEvent.keyboard('?')
    await expect.element(page.getByRole('dialog', { name: 'Film editor shortcuts' })).toBeVisible()
    await userEvent.keyboard('r')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{End}')

    await expect.element(tool('Ripple')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByText('0:00.0 / 0:16.0', { exact: true })).toBeVisible()
  })

  test('stops listening to the window when the editor is gone', async () => {
    const removed = vi.spyOn(window, 'removeEventListener')
    const screen = await render(createElement(FilmEditor, { groupId: 'g1', onClose: () => {} }))
    await screen.unmount()

    expect(removed.mock.calls.some(([type]) => type === 'keydown')).toBe(true)
    removed.mockRestore()
  })
})
