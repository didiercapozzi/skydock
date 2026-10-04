import type { NavigateFunction } from 'react-router'
import { fileHref } from './places'
import type { Place } from './places'
import type { BoardView } from './view'

const PREVIEW_WINDOW = 'skydock-preview'

const hasOwnWindows = () => typeof window !== 'undefined' && 'skydock' in window

const openFile = (goTo: NavigateFunction, place: Place, fileId: string, view: BoardView = {}) => {
  if (view.window === 'preview' || !hasOwnWindows()) {
    goTo(fileHref(place, fileId, view))
    return
  }
  const href = fileHref(place, fileId, { ...view, window: 'preview' })
  const opened = window.open(new URL(href, window.location.href).toString(), PREVIEW_WINDOW)
  opened?.focus()
}

export { hasOwnWindows, openFile }
