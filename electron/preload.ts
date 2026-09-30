/* The things the window can do that a browser tab cannot: say where a dropped file is, move the work
   to another folder, and draw the whole board bigger or smaller.

   A video dragged in from the machine is the board's to file. The page is handed the file itself and
   could send its bytes, but the server is on this very machine — so where the file already is, is
   worth more than a copy of it: the board hands over the address and the server reads it from there.
   The work folder is the server's whole world, so changing it is the window's to do: it asks, and
   starts the server again there. Nothing else of the app is reachable from the page. */

import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

/* The window has nothing behind the page, so the page must not paint a ground of its own: the
   space between the panels is the desktop. Inserted here, before the page is drawn, so nothing
   flashes opaque first. */
webFrame.insertCSS(
  'html, body { background: transparent !important } .ground { background: none !important }'
)

contextBridge.exposeInMainWorld('skydock', {
  /* the address of a file let go on the window, or nothing when the engine will not say */
  pathOf: (file: File) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
  /* the window's own title bar: what its buttons ask, and whether it is maximised */
  frame: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:state'),
    onMaximized: (listen: (maximized: boolean) => void) => {
      const heard = (_event: unknown, maximized: boolean) => listen(maximized)
      ipcRenderer.on('window:maximized', heard)
      return () => {
        ipcRenderer.removeListener('window:maximized', heard)
      }
    }
  },
  /* the machine's own folder picker; the folder chosen, none when nothing changed, or why not */
  chooseWorkFolder: () => ipcRenderer.invoke('work-folder:choose'),
  /* how big the whole window is drawn: asked, set, and heard when the keys change it */
  zoom: {
    get: () => ipcRenderer.invoke('zoom:get'),
    set: (factor: number) => ipcRenderer.invoke('zoom:set', factor),
    onChange: (listen: (factor: number) => void) => {
      const heard = (_event: unknown, factor: number) => listen(factor)
      ipcRenderer.on('zoom:changed', heard)
      return () => {
        ipcRenderer.removeListener('zoom:changed', heard)
      }
    }
  }
})
