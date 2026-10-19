import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { createRoutesStub, Link, Outlet } from 'react-router'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FilmEditor } from '../../app/components/film-editor'
import Edit from '../../app/routes/edit'

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
  await expect.element(page.getByTitle(`${FIRST} · double-click to choose the part`)).toBeVisible()
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
    await expect.element(fadeButton()).toHaveAttribute('title', 'The first clip has no clip before it to fade from')
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
    await expect.element(fadeButton()).toHaveAttribute('title', 'A gap separates the two clips: close it first')
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
    await expect.element(fadeButton()).toHaveAttribute('title', 'A clip shorter than 0.4 seconds cannot fade')
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
    expect(layers()[0]!.className).not.toContain('invisible')
    expect(layers()[0]!.dataset.src).toContain(FIRST)
    expect(layers()[1]!.dataset.src).toContain(SECOND)
    expect(opacities()[1]).toBeCloseTo(0.5, 2)
    expect(layers()[0]!.volume).toBeCloseTo(0.5, 2)

    await playheadAt(1)
    expect(layers()[0]!.className).toContain('invisible')
    expect(opacities()[1]).toBe(1)
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
    expect(posts).toHaveLength(1)
  })
})
