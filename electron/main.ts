import type { WebContents } from 'electron'
import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
  shell
} from 'electron'
import updater from 'electron-updater'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

app.setPath('userData', path.join(app.getPath('appData'), 'ch.skydock.app'))

if (fs.existsSync('/.dockerenv')) app.disableHardwareAcceleration()

const resourcesDir = () =>
  app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'build', 'resources')

const carried = (name: string) => {
  const target = path.join(resourcesDir(), process.platform === 'win32' ? `${name}.exe` : name)
  return fs.existsSync(target) ? target : null
}

const configDir = () => app.getPath('userData')

const settingsSchema = z.object({ outputDir: z.string().optional(), zoom: z.number().optional() })

const settings = () => {
  try {
    const said = fs.readFileSync(path.join(configDir(), 'settings.json'), 'utf-8')
    const read = settingsSchema.safeParse(JSON.parse(said))
    return read.success ? read.data : {}
  } catch {
    return {}
  }
}

const suggestedWorkFolder = () => {
  const videos = (() => {
    try {
      return app.getPath('videos')
    } catch {
      return app.getPath('home')
    }
  })()
  return path.join(videos, 'SkyDock')
}

const welcomeFile = () => path.join(app.getAppPath(), 'build', 'electron', 'welcome.html')

const isWelcome = (contents: WebContents) =>
  contents.getURL().startsWith(pathToFileURL(welcomeFile()).href)

let picked: string | null = null

const spaceFree = (folder: string) => {
  let at = folder
  while (!fs.existsSync(at) && path.dirname(at) !== at) at = path.dirname(at)
  try {
    const found = fs.statfsSync(at)
    return found.bavail * found.bsize
  } catch {
    return null
  }
}

const aboutFolder = (folder: string) => ({
  folder,
  free: spaceFree(folder),
  found: fs.existsSync(path.join(folder, 'manifest.json'))
})

ipcMain.handle('welcome:suggested', (event) =>
  isWelcome(event.sender) ? aboutFolder(suggestedWorkFolder()) : null
)

ipcMain.handle('welcome:use-suggested', (event) => {
  if (!isWelcome(event.sender)) return null
  picked = suggestedWorkFolder()
  return aboutFolder(picked)
})

ipcMain.handle('welcome:choose', async (event) => {
  if (!isWelcome(event.sender)) return null
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const suggested = suggestedWorkFolder()
  const options = {
    title: 'Where should SkyDock keep its work?',
    defaultPath: fs.existsSync(suggested) ? suggested : path.dirname(suggested),
    properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
  }
  const asked = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const chosen = asked.canceled ? undefined : asked.filePaths[0]
  if (!chosen) return null
  picked = chosen
  return aboutFolder(chosen)
})

ipcMain.handle('welcome:open', (event) => {
  if (!isWelcome(event.sender) || !picked) return false
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
  void startServer(picked, window)
  return true
})

const settingsFor = (outputDir: string) => {
  const resources = resourcesDir()
  const told: Record<string, string> = {
    ...process.env,
    SKYDOCK_STOP_WITH_PARENT: '1',
    SKYDOCK_OUTPUT_DIR: outputDir,
    SKYDOCK_CONFIG_DIR: configDir(),
    SKYDOCK_CLIENT_DIR: path.join(resources, 'client'),
    ELECTRON_RUN_AS_NODE: '1',
    UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? '32'
  }
  for (const [tool, variable] of [
    ['ffmpeg', 'SKYDOCK_FFMPEG_PATH'],
    ['ffprobe', 'SKYDOCK_FFPROBE_PATH']
  ] as const) {
    const found = carried(tool)
    if (found) told[variable] = found
  }
  const exiftool = path.join(
    resources,
    'exiftool',
    process.platform === 'win32' ? 'exiftool.exe' : 'exiftool'
  )
  if (fs.existsSync(exiftool)) told.SKYDOCK_EXIFTOOL_PATH = exiftool
  return told
}

const zoomLevel = () => {
  const told = Number(process.env.SKYDOCK_ZOOM?.trim() || settings().zoom)
  if (!Number.isFinite(told) || told === 0) return 1
  const asked = told > 5 ? told / 100 : told
  if (asked >= 0.5 && asked <= 3) return asked
  console.error(`[SkyDock] ${asked} is not a size to draw at — showing it as it is.`)
  return 1
}

const ZOOM_STEP: Record<string, number> = { '+': 0.1, '=': 0.1, '-': -0.1, _: -0.1 }

const rememberZoom = (factor: number) => {
  const file = path.join(configDir(), 'settings.json')
  try {
    const kept = (() => {
      try {
        const read = z
          .record(z.string(), z.unknown())
          .safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')))
        return read.success ? read.data : {}
      } catch {
        return {}
      }
    })()
    fs.mkdirSync(configDir(), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...kept, zoom: Math.round(factor * 100) }, null, 2))
  } catch (e) {
    console.error(`[SkyDock] the size could not be kept for next time: ${e}`)
  }
}

let zoomKept: ReturnType<typeof setTimeout> | null = null

const zoomTo = (contents: WebContents, asked: number) => {
  const factor = Math.round(Math.min(3, Math.max(0.5, asked)) * 10) / 10
  contents.setZoomFactor(factor)
  contents.send('zoom:changed', factor)
  if (zoomKept) clearTimeout(zoomKept)
  zoomKept = setTimeout(() => rememberZoom(factor), 300)
  return factor
}

const zoomHotkeys = (contents: WebContents) => {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return
    const step = ZOOM_STEP[input.key]
    if (step === undefined && input.key !== '0') return
    event.preventDefault()
    zoomTo(contents, input.key === '0' ? 1 : contents.getZoomFactor() + (step ?? 0))
  })
}

ipcMain.handle(
  'window:state',
  (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
)
ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
})
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

ipcMain.handle('zoom:get', (event) => event.sender.getZoomFactor())
ipcMain.handle('zoom:set', (event, asked: unknown) =>
  typeof asked === 'number' && Number.isFinite(asked)
    ? zoomTo(event.sender, asked)
    : event.sender.getZoomFactor()
)

const runningNow = async (window: BrowserWindow) => {
  try {
    const address = new URL('/api/busy', window.webContents.getURL())
    const said = z
      .object({ running: z.string().nullable() })
      .safeParse(await (await fetch(address, { signal: AbortSignal.timeout(2000) })).json())
    return said.success ? said.data.running : null
  } catch {
    return null
  }
}

const goAheadDespite = async (window: BrowserWindow, doing: string) => {
  const running = await runningNow(window)
  if (!running) return true
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'SkyDock is working',
    message: `${running}.`,
    detail: `${doing} now stops it halfway. What was finished stays; the rest has to be done again.`,
    buttons: ['Keep working', `${doing} anyway`],
    defaultId: 0,
    cancelId: 0
  })
  return response === 1
}

const KEEP_AWAKE_CHECK_MS = 5000

const keepAwakeWhileWorking = (window: BrowserWindow) => {
  let blocker: number | null = null
  const check = async () => {
    const working = !window.isDestroyed() && (await runningNow(window)) !== null
    if (working && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension')
    if (!working && blocker !== null) {
      powerSaveBlocker.stop(blocker)
      blocker = null
    }
  }
  const timer = setInterval(() => void check(), KEEP_AWAKE_CHECK_MS)
  window.on('closed', () => {
    clearInterval(timer)
    if (blocker !== null) powerSaveBlocker.stop(blocker)
  })
}

let leaving = false

const askBeforeClosing = (window: BrowserWindow) => {
  let asked = false
  window.on('close', (event) => {
    if (asked || leaving) return
    event.preventDefault()
    void goAheadDespite(window, 'Closing').then((close) => {
      if (!close) return
      asked = true
      window.close()
    })
  })
}

const isPreviewAddress = (asked: string, board: string) => {
  try {
    const url = new URL(asked)
    return (
      url.origin === new URL(board).origin &&
      /\/file\/[^/]+$/.test(url.pathname) &&
      (JSON.parse(url.searchParams.get('q') ?? '{}') as { window?: string }).window === 'preview'
    )
  } catch {
    return false
  }
}

let previewWindow: BrowserWindow | null = null

const groundColour = () => (nativeTheme.shouldUseDarkColors ? '#0a1119' : '#f8fbfe')

const raise = (window: BrowserWindow) => {
  if (window.isMinimized()) window.restore()
  window.show()
  window.setAlwaysOnTop(true)
  window.moveTop()
  window.focus()
  window.setAlwaysOnTop(false)
}

const windowOptions = (zoom: number, size: { width: number; height: number }) => ({
  title: 'SkyDock',
  ...size,
  minWidth: 900,
  minHeight: 600,
  autoHideMenuBar: true,
  frame: false,
  webPreferences: {
    preload: path.join(app.getAppPath(), 'build', 'electron', 'preload.cjs'),
    zoomFactor: zoom
  }
})

const tellMaximizedOf = (window: BrowserWindow) => {
  const tell = () => window.webContents.send('window:maximized', window.isMaximized())
  window.on('maximize', tell)
  window.on('unmaximize', tell)
}

const denyButOpenLinks = (asked: string) => {
  if (/^https?:/.test(asked)) void shell.openExternal(asked)
  return { action: 'deny' as const }
}

const openWindow = (address: string) => {
  const zoom = zoomLevel()
  const window = new BrowserWindow(windowOptions(zoom, { width: 1440, height: 900 }))
  window.webContents.setWindowOpenHandler(({ url: asked }) => {
    if (isPreviewAddress(asked, window.webContents.getURL())) {
      const open = previewWindow
      if (open && !open.isDestroyed()) {
        void open.loadURL(asked)
        raise(open)
        return { action: 'deny' }
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...windowOptions(zoom, { width: 1360, height: 880 }),
          backgroundColor: groundColour()
        }
      }
    }
    return denyButOpenLinks(asked)
  })
  window.webContents.on('did-create-window', (preview) => {
    previewWindow = preview
    preview.on('closed', () => {
      if (previewWindow === preview) previewWindow = null
    })
    zoomHotkeys(preview.webContents)
    preview.webContents.setWindowOpenHandler(({ url: asked }) => denyButOpenLinks(asked))
    tellMaximizedOf(preview)
  })
  zoomHotkeys(window.webContents)
  askBeforeClosing(window)
  keepAwakeWhileWorking(window)
  tellMaximizedOf(window)
  void window.loadURL(address)
  console.log(`[SkyDock] the window is open on ${address}`)
  return window
}

let server: ChildProcessWithoutNullStreams | null = null

const stopServer = () => {
  const running = server
  server = null
  if (!running) return
  running.stdin.end()
  running.kill()
}

const startServer = async (folder?: string, into?: BrowserWindow) => {
  const outputDir = folder ?? settings().outputDir?.trim()
  if (!outputDir) {
    openWindow(pathToFileURL(welcomeFile()).href)
    return
  }
  fs.mkdirSync(outputDir, { recursive: true })
  const script = path.join(resourcesDir(), 'skydock-server.mjs')
  if (!fs.existsSync(script)) {
    console.error(`[SkyDock] the server is not where it should be: ${script}`)
    return
  }
  const running = spawn(process.execPath, [script], {
    env: settingsFor(outputDir),
    stdio: ['pipe', 'pipe', 'pipe']
  })
  server = running
  const journal = fs.createWriteStream(path.join(configDir(), 'server.log'), { flags: 'w' })
  running.on('error', (e) => {
    console.error(`[SkyDock] the server could not be started: ${e.message}`)
    journal.write(`the server could not be started: ${e.message}\n`)
  })
  running.on('exit', (code) => {
    console.error(`[SkyDock] the server stopped (${code})`)
    journal.end(`the server stopped (${code})\n`)
  })
  running.stderr.setEncoding('utf-8')
  running.stderr.on('data', (said: string) => {
    process.stderr.write(said)
    journal.write(said)
  })
  running.stdout.setEncoding('utf-8')
  let shown = false
  let rest = ''
  running.stdout.on('data', (said: string) => {
    rest += said
    const lines = rest.split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) {
      console.log(line)
      journal.write(`${line}\n`)
      const ready = /^SKYDOCK_READY (\d+)$/.exec(line.trim())
      if (!shown && ready) {
        shown = true
        const address = `http://127.0.0.1:${ready[1]}`
        if (into && !into.isDestroyed()) void into.loadURL(address)
        else openWindow(address)
      }
    }
  })
}

const toldWhere = () => process.env.SKYDOCK_DEV_URL?.trim() || null

const RELEASES = 'https://github.com/didiercapozzi/skydock/releases/latest'

const debToInstall = z.object({ installerPath: z.string().endsWith('.deb') })

const installDeb = (file: string) =>
  new Promise<boolean>((resolve) => {
    const install = spawn(
      'pkexec',
      ['/bin/bash', '-c', 'dpkg -i "$0" || apt-get install -f -y', file],
      {
        stdio: 'ignore'
      }
    )
    install.on('error', () => resolve(false))
    install.on('close', (code) => resolve(code === 0))
  })

const offerUpdate = () => {
  if (!app.isPackaged || toldWhere()) return
  const { autoUpdater } = updater
  const onMac = process.platform === 'darwin'
  autoUpdater.autoDownload = !onMac
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('error', (e) => console.log(`[SkyDock] could not ask about new versions: ${e}`))
  autoUpdater.on('update-available', (found) => {
    console.log(`[SkyDock] SkyDock ${found.version} is out — this is ${app.getVersion()}.`)
    if (!onMac) return
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'A new SkyDock',
        message: `SkyDock ${found.version} is out. This one is ${app.getVersion()}.`,
        detail: 'Download it, open it once, and drag it into Applications as before.',
        buttons: ['Open the page', 'Next time'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) void shell.openExternal(RELEASES)
      })
  })
  autoUpdater.on('update-downloaded', (found) => {
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'A new SkyDock',
        message: `SkyDock ${found.version} is ready to install.`,
        detail: 'It takes a moment and the board comes back where it was.',
        buttons: ['Install now', 'Next time'],
        defaultId: 0,
        cancelId: 1
      })
      .then(async ({ response }) => {
        if (response !== 0) return
        const [window] = BrowserWindow.getAllWindows()
        if (window && !(await goAheadDespite(window, 'Installing'))) return
        const deb = debToInstall.safeParse(autoUpdater)
        if (deb.success) {
          if (!(await installDeb(deb.data.installerPath))) {
            void dialog
              .showMessageBox({
                type: 'error',
                title: 'A new SkyDock',
                message: `SkyDock ${found.version} could not be installed.`,
                detail: 'Nothing was changed. The new version can be downloaded from its page.',
                buttons: ['Open the page', 'Close']
              })
              .then(({ response: opened }) => {
                if (opened === 0) void shell.openExternal(RELEASES)
              })
            return
          }
          leaving = true
          stopServer()
          app.relaunch()
          app.quit()
          return
        }
        leaving = true
        stopServer()
        autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.checkForUpdates().catch(() => undefined)
}

ipcMain.handle('work-folder:choose', async (event) => {
  if (toldWhere())
    return { refused: 'This window shows a development server, which keeps its own folder.' }
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
  if (window && !(await goAheadDespite(window, 'Choosing another folder'))) return { chosen: null }
  const current = settings().outputDir
  const options = {
    title: 'Where should SkyDock work from now on?',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
  }
  const asked = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const chosen = asked.canceled ? undefined : asked.filePaths[0]
  if (!chosen || (current && path.resolve(chosen) === path.resolve(current)))
    return { chosen: null }
  stopServer()
  void startServer(chosen, window)
  return { chosen }
})

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'darwin')
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' }
        ])
      )
    else Menu.setApplicationMenu(null)

    const address = toldWhere()
    if (address) {
      console.log(`[SkyDock] showing the server already running at ${address}`)
      openWindow(address)
    } else void startServer()
    offerUpdate()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', (event) => {
    const [window] = BrowserWindow.getAllWindows()
    if (leaving || !window) {
      stopServer()
      return
    }
    event.preventDefault()
    void goAheadDespite(window, 'Quitting').then((quit) => {
      if (!quit) return
      leaving = true
      app.quit()
    })
  })
}
