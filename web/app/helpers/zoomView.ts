const MAX_ZOOM = 10

const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value))

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
