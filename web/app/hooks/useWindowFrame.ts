import { useEffect, useState, useSyncExternalStore } from 'react'

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
        minimize: () => frame.minimize(),
        toggleMaximize: () => frame.toggleMaximize(),
        close: () => frame.close()
      }
    : null
}

const useRoundedWindow = () => {
  const frame = useWindowFrame()
  const own = frame !== null
  useEffect(() => {
    document.documentElement.classList.toggle('window-own', own)
    return () => document.documentElement.classList.remove('window-own')
  }, [own])
  return own && !frame.maximized
}

export { useRoundedWindow, useWindowFrame }
