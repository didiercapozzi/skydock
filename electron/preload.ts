import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('skydock', {
  pathOf: (file: File) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
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
  chooseWorkFolder: () => ipcRenderer.invoke('work-folder:choose'),
  welcome: {
    suggested: () => ipcRenderer.invoke('welcome:suggested'),
    useSuggested: () => ipcRenderer.invoke('welcome:use-suggested'),
    choose: () => ipcRenderer.invoke('welcome:choose'),
    open: () => ipcRenderer.invoke('welcome:open')
  },
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
