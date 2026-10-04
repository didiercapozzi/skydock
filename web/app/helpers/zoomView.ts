/* The stretch of a clip a timeline and the graph under it both show: how far in it is zoomed, and where
   it starts. Zooming is anchored where the pointer is, so what is under it stays under it, and a
   stretch can be slid along by dragging with ctrl. One place for the sums, so that the bar and the graph
   cannot disagree about where they are. */

const MAX_ZOOM = 10

const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value))

/* the zoom and the start after a turn of the wheel at `ratio` (0 to 1) across what is shown */
const zoomedView = (view: {
  duration: number
  zoom: number
  offset: number
  ratio: number
  deltaY: number
}) => {
  const { duration, zoom, offset, ratio, deltaY } = view
  const span = duration / zoom
  const under = offset + ratio * span
  const next = clamp(zoom * Math.exp(-deltaY * 0.002), 1, MAX_ZOOM)
  const nextSpan = duration / next
  return {
    zoom: next,
    offset: clamp(under - ratio * nextSpan, 0, Math.max(0, duration - nextSpan))
  }
}

/* the start after the stretch is slid by `dx` pixels along `width`: the footage follows the pointer */
const slidView = (view: {
  duration: number
  zoom: number
  offset: number
  dx: number
  width: number
}) => {
  const { duration, zoom, offset, dx, width } = view
  const span = duration / zoom
  return clamp(offset - (dx / (width || 1)) * span, 0, Math.max(0, duration - span))
}

export { clamp, MAX_ZOOM, slidView, zoomedView }
