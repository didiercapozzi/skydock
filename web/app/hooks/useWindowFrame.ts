import { useEffect, useState, useSyncExternalStore } from 'react'

/* SkyDock's own window has no frame of the desktop's, so the page draws the title bar and asks the
   window to do what its buttons say. A browser tab has neither: there is nothing to draw, and the
   server that drew the page cannot know, so the page learns it once it is up. */
const nobody = () => () => {}

const useWindowFrame = () => {
  const framed = useSyncExternalStore(
    nobody,
    () => Boolean(window.skydock?.frame),
    () => false
  )
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    const frame = window.skydock?.frame
    if (!frame) return
    void frame.isMaximized().then(setMaximized)
    return frame.onMaximized(setMaximized)
  }, [framed])
  const frame = framed ? window.skydock?.frame : undefined
  return frame
    ? {
        maximized,
        /* called with nothing, each one: a click's event handed straight to the window's bridge cannot
           be copied across it, and the button would do nothing */
        minimize: () => frame.minimize(),
        toggleMaximize: () => frame.toggleMaximize(),
        close: () => frame.close()
      }
    : null
}

export { useWindowFrame }
