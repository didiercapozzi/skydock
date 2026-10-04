import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { JumpGraph } from '../../app/components/jump-graph'

/* The jump drawn against its own clip and tied to the frame on screen (RULES, The jump on a graph).
   The numbers below are a jump's shape: a minute in the plane, the door, freefall, the opening and
   a canopy ride. */

const SECONDS = 200

const RATE = 2

const shaped = (second: number) => {
  if (second < 38) return 1
  if (second < 41) return 0.35
  if (second < 98) return 1
  if (second < 102) return 2.2
  return 1
}

const track = (over: { altitude?: (number | null)[]; speed?: (number | null)[] } = {}) => ({
  seconds: SECONDS,
  rate: RATE,
  force: Array.from({ length: SECONDS * RATE }, (_, at) => shaped(at / RATE)),
  ...over
})

const moments = { exit: 38, opening: 98, canopy: 101.6, landing: 192 }

const Graph = ({
  currentTime = 0,
  onSeek = () => {},
  view,
  ...over
}: {
  currentTime?: number
  view?: { from: number; span: number }
  onSeek?: (seconds: number) => void
  altitude?: (number | null)[]
  speed?: (number | null)[]
}) =>
  createElement(JumpGraph, {
    track: track(over),
    waiting: false,
    moments,
    currentTime,
    duration: SECONDS,
    view,
    onSeek
  })

const graph = () => page.getByLabelText('The jump against the clip')

describe('the jump on a graph', () => {
  test('is drawn from the clip it belongs to, whatever the camera measured', async () => {
    await render(createElement(Graph, {}))
    await expect.element(graph()).toBeVisible()
    /* the measurement as it stands and the shape drawn over it */
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(2)
  })

  /* The point of tying it to the frame: a number is read with the picture it belongs to, so the
     readout says where in the jump this frame is. */
  test('says what the frame on screen weighs and where in the jump it is', async () => {
    await render(createElement(Graph, { currentTime: 60 }))
    const readout = page.getByText(/1:00/)
    await expect.element(readout).toBeVisible()
    await expect.element(page.getByText(/freefall/)).toBeVisible()
  })

  /* the least and the most the camera felt across the whole clip, whatever frame is on screen */
  test('says the least and the most the camera felt', async () => {
    await render(createElement(Graph, { currentTime: 0 }))

    const extremes = document.querySelector('[data-graph-extremes]')
    await expect.poll(() => extremes?.textContent ?? document.querySelector('[data-graph-extremes]')?.textContent).toMatch(/min 0\.35 g · max 2\.20 g/)
  })

  test('says which part of the jump the opening is, once the frame reaches it', async () => {
    await render(createElement(Graph, { currentTime: 99 }))
    await expect.element(page.getByText(/the opening/)).toBeVisible()
  })

  /* Dragging along it moves the footage — that is the whole of what it is for. */
  test('moves the footage to wherever a point on it is dragged', async () => {
    const moved = vi.fn()
    await render(createElement(Graph, { onSeek: moved }))
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    await userEvent.dragAndDrop(graph(), graph(), {
      targetPosition: { x: box.width * 0.5, y: box.height / 2 }
    })

    expect(moved).toHaveBeenCalled()
    const asked = moved.mock.calls[moved.mock.calls.length - 1][0]
    /* halfway along two hundred seconds */
    expect(asked).toBeGreaterThan(80)
    expect(asked).toBeLessThan(120)
  })

  /* zoomed in on the timeline, the graph shows the same stretch, and a drag along it is read against it */
  test('shows the stretch the timeline is zoomed to, and seeks within it', async () => {
    const moved = vi.fn()
    await render(createElement(Graph, { onSeek: moved, view: { from: 100, span: 50 } }))
    const svg = document.querySelector('[data-jump-graph] svg')
    /* 100 s of 200 along a width of 1000, and a quarter of it wide */
    expect(svg?.getAttribute('viewBox')).toBe('500 0 250 96')
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    await userEvent.dragAndDrop(graph(), graph(), {
      targetPosition: { x: box.width * 0.5, y: box.height / 2 }
    })

    const asked = moved.mock.calls[moved.mock.calls.length - 1][0]
    /* halfway along a stretch from 100 s to 150 s */
    expect(asked).toBeGreaterThan(120)
    expect(asked).toBeLessThan(130)
  })

  test('carries height and speed when the camera wrote them down', async () => {
    await render(
      createElement(Graph, {
        altitude: Array.from({ length: SECONDS * RATE }, (_, at) => 4000 - at * 8),
        speed: Array.from({ length: SECONDS * RATE }, () => 190)
      })
    )
    /* the measurement, its shape, and a line each for height and speed */
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(4)
    await expect.element(page.getByText(/4000 m/)).toBeVisible()
    await expect.element(page.getByText(/190 km\/h/)).toBeVisible()
  })

  /* Neither camera here was told where it was, and the graph says so rather than drawing a line
     from nothing. */
  test('says plainly when the camera knew neither', async () => {
    await render(createElement(Graph, {}))
    await expect.element(page.getByText(/no height or speed/i)).toBeVisible()
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(2)
  })
})

/* the graph zooms and slides like the bar above it: the wheel zooms about the pointer, and a drag with
   ctrl held slides the stretch along the clip without moving the footage */
describe('the jump on a graph — zooming and sliding', () => {
  test('is zoomed by the wheel, about the pointer', async () => {
    const zoomed = vi.fn()
    await render(
      createElement(JumpGraph, {
        track: track(),
        waiting: false,
        moments,
        currentTime: 0,
        duration: SECONDS,
        onZoom: zoomed,
        onSeek: () => {}
      })
    )
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    graph()
      .element()
      .dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -300,
          clientX: box.left + box.width / 2,
          bubbles: true,
          cancelable: true
        })
      )

    await vi.waitFor(() => expect(zoomed).toHaveBeenCalled())
    const [zoom, offset] = zoomed.mock.calls[0]!
    expect(zoom).toBeGreaterThan(1)
    /* what was under the middle of the graph stays there: halfway through 200 s is 100 s */
    expect(offset + (SECONDS / zoom) * 0.5).toBeCloseTo(100, 0)
  })

  test('is slid along the clip by a drag with ctrl, and the footage stays', async () => {
    const slid = vi.fn()
    const moved = vi.fn()
    await render(
      createElement(JumpGraph, {
        track: track(),
        waiting: false,
        moments,
        currentTime: 0,
        duration: SECONDS,
        view: { from: 50, span: 50 },
        onSlide: slid,
        onSeek: moved
      })
    )
    const el = graph().element() as HTMLElement
    const box = el.getBoundingClientRect()
    const at = (x: number) => ({
      clientX: box.left + x,
      clientY: box.top + 10,
      pointerId: 1,
      ctrlKey: true,
      bubbles: true
    })

    el.dispatchEvent(new PointerEvent('pointerdown', at(box.width * 0.5)))
    await new Promise((resolve) => setTimeout(resolve, 50))
    el.dispatchEvent(new PointerEvent('pointermove', at(box.width * 0.5 + box.width * 0.2)))
    el.dispatchEvent(new PointerEvent('pointerup', at(box.width * 0.7)))

    await vi.waitFor(() => expect(slid).toHaveBeenCalled())
    /* dragged right by a fifth of a 50 s stretch: the stretch starts 10 s earlier, the footage follows the pointer */
    expect(slid.mock.calls.at(-1)![0]).toBeCloseTo(40, 0)
    expect(moved).not.toHaveBeenCalled()
  })
})
