/* The one thing the window can do that a browser tab cannot: say where a dropped file is.

   A video dragged in from the machine is the board's to file. The page is handed the file itself and
   could send its bytes, but the server is on this very machine — so where the file already is, is
   worth more than a copy of it: the board hands over the address and the server reads it from there.
   Nothing else of the app is reachable from the page. */

import { contextBridge, webUtils } from 'electron'

contextBridge.exposeInMainWorld('skydock', {
  /* the address of a file let go on the window, or nothing when the engine will not say */
  pathOf: (file: File) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  }
})
