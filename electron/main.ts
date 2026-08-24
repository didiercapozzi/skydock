import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let serverProcess: ReturnType<typeof spawn> | null = null
let watcherProcess: ReturnType<typeof spawn> | null = null

const SERVER_PORT = 3000
const SERVER_URL = `http://localhost:${SERVER_PORT}`
const USER_DATA = app.getPath('userData')
const VERSION_FILE = join(USER_DATA, '.skydock-version')
const OUTPUT_DIR = join(USER_DATA, 'output')

const getAssetPath = (...paths: string[]): string => {
  const resourcePath = isDev ? join(__dirname, '..', 'resources') : join(process.resourcesPath)
  return join(resourcePath, ...paths)
}

const getScriptsDir = (): string => {
  if (isDev) {
    return join(__dirname, '..', 'scripts')
  }
  return join(process.resourcesPath, 'scripts')
}

const getBundledScript = (name: string): string => {
  const scriptPath = join(getScriptsDir(), name)
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`)
  }
  return scriptPath
}

const startServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const serverPath = isDev
      ? join(__dirname, '..', 'node_modules', '.bin', 'react-router-serve')
      : join(process.resourcesPath, 'node_modules', '.bin', 'react-router-serve')

    const buildPath = isDev
      ? join(__dirname, '..', 'build', 'server', 'index.js')
      : join(process.resourcesPath, 'build', 'server', 'index.js')

    serverProcess = spawn(serverPath, [buildPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(SERVER_PORT),
        SKYDOCK_OUTPUT_DIR: OUTPUT_DIR
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[Server]', msg)
      if (msg.includes('Listening')) {
        resolve()
      }
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Server]', data.toString())
    })

    serverProcess.on('error', reject)
    serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`))
      }
    })

    setTimeout(() => resolve(), 3000)
  })
}

const startWatcher = (): void => {
  const scriptPath = getBundledScript('watcher.sh')

  watcherProcess = spawn('bash', [scriptPath], {
    env: {
      ...process.env,
      SKYDOCK_OUTPUT_DIR: OUTPUT_DIR,
      CAM_PHOTO_LABEL: 'DJI蔡司',
      CAM_VIDEO_LABEL: 'DJI蔡司',
      JUMP_GAP_SECONDS: '900',
      PHOTO_FPS: '2'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  watcherProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    console.log('[Watcher]', msg)
    mainWindow?.webContents.send('watcher-log', msg)
  })

  watcherProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    console.error('[Watcher]', msg)
    mainWindow?.webContents.send('watcher-log', msg)
  })

  watcherProcess.on('close', (code) => {
    console.log(`[Watcher] Exited with code ${code}`)
    mainWindow?.webContents.send('watcher-status', 'stopped')
  })

  mainWindow?.webContents.send('watcher-status', 'running')
}

const stopProcesses = (): void => {
  if (watcherProcess) {
    watcherProcess.kill('SIGTERM')
    watcherProcess = null
  }
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'SkyDock',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  })

  if (isDev) {
    mainWindow.loadURL(SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(SERVER_URL)
  }

  mainWindow.on('close', () => {
    stopProcesses()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const checkForUpdates = async (): Promise<void> => {
  if (isDev) return

  try {
    const result = await autoUpdater.checkForUpdates()
    if (result) {
      mainWindow?.webContents.send('update-available', result.updateInfo.version)
    }
  } catch (err) {
    console.error('[Updater] Check failed:', err)
  }
}

const installUpdate = (): void => {
  autoUpdater.quitAndInstall()
}

const getInstalledVersion = (): string => {
  if (existsSync(VERSION_FILE)) {
    return readFileSync(VERSION_FILE, 'utf-8').trim()
  }
  return app.getVersion()
}

const setInstalledVersion = (version: string): void => {
  writeFileSync(VERSION_FILE, version, 'utf-8')
}

const openOutputDir = (): void => {
  if (existsSync(OUTPUT_DIR)) {
    shell.openPath(OUTPUT_DIR)
  }
}

const selectOutputDir = async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Directory'
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
}

const setupIpc = (): void => {
  ipcMain.handle('get-version', () => app.getVersion())
  ipcMain.handle('get-installed-version', () => getInstalledVersion())
  ipcMain.handle('check-for-updates', () => checkForUpdates())
  ipcMain.handle('install-update', () => installUpdate())
  ipcMain.handle('open-output-dir', () => openOutputDir())
  ipcMain.handle('select-output-dir', () => selectOutputDir())
  ipcMain.handle('get-output-dir', () => OUTPUT_DIR)
  ipcMain.handle('start-watcher', () => {
    startWatcher()
    return true
  })
  ipcMain.handle('stop-watcher', () => {
    if (watcherProcess) {
      watcherProcess.kill('SIGTERM')
      watcherProcess = null
      mainWindow?.webContents.send('watcher-status', 'stopped')
    }
    return true
  })
}

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

if (process.argv.includes('--no-sandbox') || process.env.ELECTRON_DISABLE_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
}

app.whenReady().then(async () => {
  setupIpc()

  mkdirSync(OUTPUT_DIR, { recursive: true })

  try {
    await startServer()
    console.log('[Main] Server started')
  } catch (err) {
    console.error('[Main] Server failed to start:', err)
  }

  await createWindow()

  if (!isDev) {
    setInstalledVersion(app.getVersion())
    checkForUpdates()
  }
})

app.on('window-all-closed', () => {
  stopProcesses()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopProcesses()
})
