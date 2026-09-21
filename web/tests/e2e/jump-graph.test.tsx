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
  ...over
}: {
  currentTime?: number
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
