import { useEffect, useState } from 'react'

/* How big SkyDock's own window draws the whole board, as a factor — and a way to change it. Only the
   window can: a browser tab zooms with its own keys, and has nothing here to show. Read once the page
   is up, since the server that drew it has no window to ask. */
const ZOOM_STEP = 0.1

const useZoom = () => {
  const [factor, setFactor] = useState<number | null>(null)
  useEffect(() => {
    const zoom = window.skydock?.zoom
    if (!zoom) return
    void zoom.get().then(setFactor)
    return zoom.onChange(setFactor)
  }, [])
  const set = (asked: number) => {
    void window.skydock?.zoom?.set(asked).then(setFactor)
  }
  return factor === null
    ? null
    : {
        factor,
        smaller: () => set(factor - ZOOM_STEP),
        bigger: () => set(factor + ZOOM_STEP),
        asDrawn: () => set(1)
      }
}

export { useZoom }
