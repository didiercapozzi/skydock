/* The two things the window can do that a browser tab cannot: say where a dropped file is, and move
   the work to another folder.

   A video dragged in from the machine is the board's to file. The page is handed the file itself and
   could send its bytes, but the server is on this very machine — so where the file already is, is
   worth more than a copy of it: the board hands over the address and the server reads it from there.
   The work folder is the server's whole world, so changing it is the window's to do: it asks, and
   starts the server again there. Nothing else of the app is reachable from the page. */

import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('skydock', {
  /* the address of a file let go on the window, or nothing when the engine will not say */
  pathOf: (file: File) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
  /* the machine's own folder picker; the folder chosen, none when nothing changed, or why not */
  chooseWorkFolder: () => ipcRenderer.invoke('work-folder:choose')
})
