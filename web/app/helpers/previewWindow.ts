import type { NavigateFunction } from 'react-router'
import { fileHref } from './places'
import type { Place } from './places'
import type { BoardView } from './view'

/* A file is looked at in a window of its own, which is SkyDock's own window's to give: the page asks
   for an address to be opened in a new one and the window makes it, apart from the board, so a clip
   can sit beside the board, on another screen, while the board goes on being worked. In a plain
   browser there is no such window to give, and the file opens over the board as it always did
   (RULES, The preview). */

/* whether the page is in SkyDock's own window, which is where a file can have one of its own */
const hasOwnWindows = () => typeof window !== 'undefined' && 'skydock' in window

/* Opens a file: in a window of its own where there is one to give — else over the board. The window asks for
   it as a new one each time and SkyDock's own window decides: it shows the file in the one that is open, so the
   next file replaces the last rather than piling windows up, and brings that one to the front. Asked for by
   name, the open one would be given the address by the page's engine and never be brought forward. */
const openFile = (goTo: NavigateFunction, place: Place, fileId: string, view: BoardView = {}) => {
  if (view.window === 'preview' || !hasOwnWindows()) {
    goTo(fileHref(place, fileId, view))
    return
  }
  const href = fileHref(place, fileId, { ...view, window: 'preview' })
  window.open(new URL(href, window.location.href).toString())
}

export { hasOwnWindows, openFile }
