import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { JumpGraph } from '../../app/components/jump-graph'


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
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(2)
  })

  test('says what the frame on screen weighs and where in the jump it is', async () => {
    await render(createElement(Graph, { currentTime: 60 }))
    const readout = page.getByText(/1:00/)
    await expect.element(readout).toBeVisible()
    await expect.element(page.getByText(/freefall/)).toBeVisible()
  })

  test('says the least and the most the camera felt', async () => {
    await render(createElement(Graph, { currentTime: 0 }))

    const extremes = document.querySelector('[data-graph-extremes]')
    await expect.poll(() => extremes?.textContent ?? document.querySelector('[data-graph-extremes]')?.textContent).toMatch(/min 0\.35 g · max 2\.20 g/)
  })

  test('says which part of the jump the opening is, once the frame reaches it', async () => {
    await render(createElement(Graph, { currentTime: 99 }))
    await expect.element(page.getByText(/the opening/)).toBeVisible()
  })

  test('moves the footage to wherever a point on it is dragged', async () => {
    const moved = vi.fn()
    await render(createElement(Graph, { onSeek: moved }))
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    await userEvent.dragAndDrop(graph(), graph(), {
      targetPosition: { x: box.width * 0.5, y: box.height / 2 }
    })

    expect(moved).toHaveBeenCalled()
    const asked = moved.mock.calls.at(-1)![0]
    expect(asked).toBeGreaterThan(80)
    expect(asked).toBeLessThan(120)
  })

  test('shows the stretch the timeline is zoomed to, and seeks within it', async () => {
    const moved = vi.fn()
    await render(createElement(Graph, { onSeek: moved, view: { from: 100, span: 50 } }))
    const svg = document.querySelector('[data-jump-graph] svg')
    expect(svg?.getAttribute('viewBox')).toBe('500 0 250 96')
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    await userEvent.dragAndDrop(graph(), graph(), {
      targetPosition: { x: box.width * 0.5, y: box.height / 2 }
    })

    const asked = moved.mock.calls.at(-1)![0]
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
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(4)
    await expect.element(page.getByText(/4000 m/)).toBeVisible()
    await expect.element(page.getByText(/190 km\/h/)).toBeVisible()
  })

  test('says plainly when the camera knew neither', async () => {
    await render(createElement(Graph, {}))
    await expect.element(page.getByText(/no height or speed/i)).toBeVisible()
    expect(document.querySelectorAll('[data-jump-graph] path')).toHaveLength(2)
  })
})

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
    const box = (graph().element() as HTMLElement).getBoundingClientRect()

    await userEvent.keyboard('{Control>}')
    await userEvent.dragAndDrop(graph(), graph(), {
      sourcePosition: { x: box.width * 0.5, y: 10 },
      targetPosition: { x: box.width * 0.7, y: 10 }
    })
    await userEvent.keyboard('{/Control}')

    await vi.waitFor(() => expect(slid).toHaveBeenCalled())
    expect(slid.mock.calls.at(-1)![0]).toBeCloseTo(40, 0)
    expect(moved).not.toHaveBeenCalled()
  })
})
