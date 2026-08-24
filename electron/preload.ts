import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),
  getInstalledVersion: (): Promise<string> => ipcRenderer.invoke('get-installed-version'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  openOutputDir: (): Promise<void> => ipcRenderer.invoke('open-output-dir'),
  selectOutputDir: (): Promise<string | null> => ipcRenderer.invoke('select-output-dir'),
  getOutputDir: (): Promise<string> => ipcRenderer.invoke('get-output-dir'),
  startWatcher: (): Promise<boolean> => ipcRenderer.invoke('start-watcher'),
  stopWatcher: (): Promise<boolean> => ipcRenderer.invoke('stop-watcher'),

  onWatcherLog: (callback: (msg: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: string): void => {
      callback(msg)
    }
    ipcRenderer.on('watcher-log', handler)
    return () => ipcRenderer.removeListener('watcher-log', handler)
  },

  onWatcherStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('watcher-status', handler)
    return () => ipcRenderer.removeListener('watcher-status', handler)
  },

  onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string): void => {
      callback(version)
    }
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  }
}

export type ElectronAPI = typeof electronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
