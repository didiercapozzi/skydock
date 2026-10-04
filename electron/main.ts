/* SkyDock as an installed app.

   The app itself is the same web app the development server runs. This starts it: the SkyDock
   server, as a program of its own beside the window, on a port nobody else is using and reachable
   only from this machine. The window is a browser pointed at it. Everything the app does — reading
   a camera, cutting a clip, making a montage, sending a film to the storage — happens in there.

   What this side is responsible for: where the work is kept, where the media tools are, and that
   nothing is left running when the window is closed. */

import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeTheme, shell } from 'electron'
import type { WebContents } from 'electron'
import updater from 'electron-updater'
import { z } from 'zod'

/* Where every version of SkyDock has kept its settings and its storage session. Named rather than
   left to the app's own name, so that a machine already using SkyDock keeps the folder it works in
   and stays logged in to the storage. */
app.setPath('userData', path.join(app.getPath('appData'), 'ch.skydock.app'))

/* This container holds every card the machine has, and reaching for one is what takes the session
   around it down. A machine SkyDock is installed on is the opposite case: its card is what plays the
   clips, and asking it not to would be asking it to do the work twice as slowly. */
if (fs.existsSync('/.dockerenv')) app.disableHardwareAcceleration()

/* Where the app's own files are: the server, the built page, the templates and the tools it runs.
   Installed, they are where the installer put them; run from the source, where `npm run pack` left
   them. */
const resourcesDir = () =>
  app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'build', 'resources')

/* A program the app carries, which is never the machine's own: a dropzone's computer has nothing
   installed on it, and one that happens to have an ffmpeg must not be the one we run. */
const carried = (name: string) => {
  const target = path.join(resourcesDir(), process.platform === 'win32' ? `${name}.exe` : name)
  return fs.existsSync(target) ? target : null
}

const configDir = () => app.getPath('userData')

/* What the app was told last time: where to work, and how big to draw. Where to work is the
   server's to write; how big to draw is this side's, and anything else in there is left as it is. */
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

/* The folder SkyDock offers on its first run: the machine's videos folder, with a folder of its own
   in it, so the footage lands where somebody would look for it. */
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

/* Where the work lives. Asked for once, the first time the app is opened, because it is a dropzone's
   whole season of footage and nobody should find out afterwards that it went somewhere surprising.
   The asking is a page of the app's own — what SkyDock is, what the folder will hold, and one button
   to choose it — shown in the window before any server is started. Answered once and never asked
   again: the server writes it down. */
const welcomeFile = () => path.join(app.getAppPath(), 'build', 'electron', 'welcome.html')

/* only that page may ask for the folder: the board's own pages have their own way, in Settings */
const isWelcome = (contents: WebContents) =>
  contents.getURL().startsWith(pathToFileURL(welcomeFile()).href)

/* the folder chosen on that page, until it says to open the board */
let picked: string | null = null

/* a folder that is not made yet has no disk of its own to ask: the nearest one that is has */
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

/* what the page says of a folder: where it is, how much room is left, and whether it already holds
   the work of an earlier SkyDock */
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

/* The machine's own folder picker, opened on the folder SkyDock would suggest. Not choosing leaves
   the page as it was: the work does not go anywhere nobody said. */
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

/* the page says to start: the server is started in the folder, and the window shows its board */
ipcMain.handle('welcome:open', (event) => {
  if (!isWelcome(event.sender) || !picked) return false
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
  void startServer(picked, window)
  return true
})

/* What the server is told before it starts: where to work, where its settings and its bin are, and
   where the tools it runs are, since a packaged app carries its own and must not go looking for
   somebody else's. */
const settingsFor = (outputDir: string) => {
  const resources = resourcesDir()
  const told: Record<string, string> = {
    ...process.env,
    /* the server ends when this app does, however this app ends */
    SKYDOCK_STOP_WITH_PARENT: '1',
    SKYDOCK_OUTPUT_DIR: outputDir,
    SKYDOCK_CONFIG_DIR: configDir(),
    SKYDOCK_CLIENT_DIR: path.join(resources, 'client'),
    SKYDOCK_TEMPLATES_DIR: path.join(resources, 'templates'),
    /* the app's own program, told to be Node and nothing else, is what runs the server */
    ELECTRON_RUN_AS_NODE: '1'
  }
  for (const [tool, variable] of [
    ['ffmpeg', 'SKYDOCK_FFMPEG_PATH'],
    ['ffprobe', 'SKYDOCK_FFPROBE_PATH']
  ] as const) {
    const found = carried(tool)
    if (found) told[variable] = found
  }
  /* ExifTool is a program and the several hundred files it reads formats out of, which have to stay
     beside it, so it is asked for in the folder it travels in. */
  const exiftool = path.join(
    resources,
    'exiftool',
    process.platform === 'win32' ? 'exiftool.exe' : 'exiftool'
  )
  if (fs.existsSync(exiftool)) told.SKYDOCK_EXIFTOOL_PATH = exiftool
  return told
}

/* How big the window draws everything. The board is laid out for the machine it is edited on, and
   the machine in the packing hall is across the room from whoever is reading it, so the whole of it
   scales — text, thumbnails and all — the way a browser's own zoom does.

   `SKYDOCK_ZOOM` for a moment, `zoom` in the settings for always. Said either as a factor (`1.5`) or
   as the percentage anybody would say out loud (`150`). Anything outside half to triple size is
   somebody's slip, and is left at as-drawn. */
const zoomLevel = () => {
  const told = Number(process.env.SKYDOCK_ZOOM?.trim() || settings().zoom)
  if (!Number.isFinite(told) || told === 0) return 1
  const asked = told > 5 ? told / 100 : told
  if (asked >= 0.5 && asked <= 3) return asked
  console.error(`[SkyDock] ${asked} is not a size to draw at — showing it as it is.`)
  return 1
}

const ZOOM_STEP: Record<string, number> = { '+': 0.1, '=': 0.1, '-': -0.1, _: -0.1 }

/* A size chosen is kept for next time, in the settings beside where to work — as the percentage
   anybody would say out loud. Whatever else is in the file stays as it is. */
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

/* A size asked for, kept between half and three times, on the tenth, told to the page so its own
   control says it, and remembered. */
const zoomTo = (contents: WebContents, asked: number) => {
  const factor = Math.round(Math.min(3, Math.max(0.5, asked)) * 10) / 10
  contents.setZoomFactor(factor)
  contents.send('zoom:changed', factor)
  /* written once the keys stop: a key held down asks many times a second, and the disk need hear
     only where it ended */
  if (zoomKept) clearTimeout(zoomKept)
  zoomKept = setTimeout(() => rememberZoom(factor), 300)
  return factor
}

/* ⌘/ctrl with + or − and 0, as they do in any browser. The engine does the zooming; which keys ask
   for it is the window's own to say. Where it starts is the window's to say when it is made: a
   factor set before the first page has loaded is lost to that page on some machines and not on
   others. */
const zoomHotkeys = (contents: WebContents) => {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return
    const step = ZOOM_STEP[input.key]
    if (step === undefined && input.key !== '0') return
    event.preventDefault()
    zoomTo(contents, input.key === '0' ? 1 : contents.getZoomFactor() + (step ?? 0))
  })
}

/* the same, asked for from the board's own control */
/* what the page's own title bar asks of the window it is in */
ipcMain.handle(
  'window:state',
  (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
)
ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.isMaximized() ? window.unmaximize() : window.maximize()
})
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

ipcMain.handle('zoom:get', (event) => event.sender.getZoomFactor())
ipcMain.handle('zoom:set', (event, asked: unknown) =>
  typeof asked === 'number' && Number.isFinite(asked)
    ? zoomTo(event.sender, asked)
    : event.sender.getZoomFactor()
)

/* What the server behind the window is writing right now, or null — asked of it, since only it knows. */
const runningNow = async (window: BrowserWindow) => {
  try {
    const address = new URL('/api/busy', window.webContents.getURL())
    const said = z
      .object({ running: z.string().nullable() })
      /* a server too busy to answer in two seconds must not keep the window from closing */
      .safeParse(await (await fetch(address, { signal: AbortSignal.timeout(2000) })).json())
    return said.success ? said.data.running : null
  } catch {
    return null
  }
}

/* Asked before anything that ends the work in the middle — closing the window, installing an
   update: an upload, processing or a camera copy cut off halfway is work to do again. */
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

/* set once the app has been told to go — an update being installed asked already */
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

/* whether an address is a file to be shown in a window of its own: the board's own address, with the
   file in it and the mark that says so — nothing else is ever opened as a window of the app */
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

/* The window a file is looked at in: one at a time, so that asking for another file shows it there
   instead of piling windows up, and asking for it brings it to the front when it is under the board. */
let previewWindow: BrowserWindow | null = null

/* what the window is before the page has drawn: the ground's own colour, so nothing flashes */
const groundColour = () => (nativeTheme.shouldUseDarkColors ? '#0a0f14' : '#e3edf1')

const raise = (window: BrowserWindow) => {
  if (window.isMinimized()) window.restore()
  window.show()
  /* a window manager may decline to take the focus from what has it; being on top for a moment is
     what makes it come forward anyway */
  window.setAlwaysOnTop(true)
  window.moveTop()
  window.focus()
  window.setAlwaysOnTop(false)
}

/* The window itself: a browser on the server behind it, and nothing else. A link out of the board —
   the passenger's email, a share link — belongs to the machine's own browser; opened in here it
   would be the board gone, with no way back to it. */
const openWindow = (address: string) => {
  const zoom = zoomLevel()
  const window = new BrowserWindow({
    title: 'SkyDock',
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    /* No frame of the desktop's, and the window is solid: nothing of the desktop shows through. The page
       draws its own buttons, and asks the window to do what they say. */
    frame: false,
    backgroundColor: groundColour(),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'build', 'electron', 'preload.cjs'),
      zoomFactor: zoom
    }
  })
  window.webContents.setWindowOpenHandler(({ url: asked }) => {
    /* a file looked at has a window of its own, apart from the board: the board asks for one by
       opening its own address with the file in it, and it is given here, the same kind of window */
    if (isPreviewAddress(asked, address)) {
      const open = previewWindow
      if (open && !open.isDestroyed()) {
        void open.loadURL(asked)
        raise(open)
        return { action: 'deny' }
      }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: 'SkyDock',
          width: 1360,
          height: 880,
          minWidth: 900,
          minHeight: 600,
          autoHideMenuBar: true,
          frame: false,
          backgroundColor: groundColour(),
          webPreferences: {
            preload: path.join(app.getAppPath(), 'build', 'electron', 'preload.cjs'),
            zoomFactor: zoom
          }
        }
      }
    }
    if (/^https?:/.test(asked)) void shell.openExternal(asked)
    return { action: 'deny' }
  })
  window.webContents.on('did-create-window', (preview) => {
    previewWindow = preview
    preview.on('closed', () => {
      if (previewWindow === preview) previewWindow = null
    })
    zoomHotkeys(preview.webContents)
    /* nothing opens from it but a link out, which is the machine's own browser's */
    preview.webContents.setWindowOpenHandler(({ url: asked }) => {
      if (/^https?:/.test(asked)) void shell.openExternal(asked)
      return { action: 'deny' }
    })
    const tellMaximized = () => preview.webContents.send('window:maximized', preview.isMaximized())
    preview.on('maximize', tellMaximized)
    preview.on('unmaximize', tellMaximized)
  })
  zoomHotkeys(window.webContents)
  askBeforeClosing(window)
  const tellMaximized = () => window.webContents.send('window:maximized', window.isMaximized())
  window.on('maximize', tellMaximized)
  window.on('unmaximize', tellMaximized)
  void window.loadURL(address)
  console.log(`[SkyDock] the window is open on ${address}`)
  return window
}

/* The server running behind the window, so that closing the app closes it too: one left behind
   holds the port and goes on working on nothing. */
let server: ChildProcessWithoutNullStreams | null = null

const stopServer = () => {
  const running = server
  server = null
  if (!running) return
  /* the end of what it is being sent is what it watches for, and it stops itself the way it does on
     an ordinary close */
  running.stdin.end()
  running.kill()
}

/* Starts the server and waits for it to say which port it is on. Its own output is passed through,
   because when something goes wrong in there this is the only place it is said.

   It is run by the app's own program, told to be Node and nothing else, so that nothing but SkyDock
   is installed on the machine and so that what the server is being sent can be ended when the app
   ends.

   Given a folder and a window, it is the work moving to another folder: the server there is started
   and the window already open is pointed at it, rather than a second one opened. */
const startServer = async (folder?: string, into?: BrowserWindow) => {
  const outputDir = folder ?? settings().outputDir?.trim()
  /* the first time: no server yet, only the page that asks where to keep the work */
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
  running.on('error', (e) =>
    console.error(`[SkyDock] the server could not be started: ${e.message}`)
  )
  running.on('exit', (code) => console.error(`[SkyDock] the server stopped (${code})`))
  running.stderr.setEncoding('utf-8')
  running.stderr.on('data', (said: string) => process.stderr.write(said))
  running.stdout.setEncoding('utf-8')
  let shown = false
  let rest = ''
  running.stdout.on('data', (said: string) => {
    rest += said
    const lines = rest.split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) {
      console.log(line)
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

/* A server already running, for working on the app itself: the development server is told where to
   keep its work and which editor to open, and this shows what it serves rather than starting a
   second one of its own. */
const toldWhere = () => {
  const told = process.env.SKYDOCK_DEV_URL?.trim()
  return told ? told : null
}

const RELEASES = 'https://github.com/didiercapozzi/skydock/releases/latest'

/* Whether there is a newer SkyDock, and if there is, offering it.

   Nothing is installed without being asked: a dropzone's machine is in the middle of somebody's day,
   and a version that changed underneath them is how a day goes wrong in a way nobody can explain
   afterwards. On Windows and on Linux it is fetched first, so that saying yes is a restart rather
   than a wait. A Mac replaces only an app that was signed for it, and this one is not, so there it
   says what is out and opens the page it comes from.

   Every way this can fail is quiet. A machine in a hangar with no internet must open its board
   exactly as it always does — an app that will not start because it could not ask about itself is
   worse than an old one. */
const offerUpdate = () => {
  /* a window showing a development server is somebody working on SkyDock, not somebody using it */
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
        leaving = true
        /* the server is stopped on the way out, as it is however the app ends */
        stopServer()
        autoUpdater.quitAndInstall()
      })
  })
  void autoUpdater.checkForUpdates()
}

/* Another folder to work in, asked for from the board. Nothing is copied or moved: the server is
   stopped and started again in the folder chosen, which it remembers from then on, and the window
   shows the board that folder holds — empty, or the work already kept there. The folder left behind
   stays exactly as it is, and can be chosen again. A development server keeps its own folder. */
ipcMain.handle('work-folder:choose', async (event) => {
  if (toldWhere())
    return { refused: 'This window shows a development server, which keeps its own folder.' }
  const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
  /* the page asks this too; the window makes sure, since leaving mid-way cuts the work off */
  const running = window ? await runningNow(window) : null
  if (running) return { refused: `${running} — wait until it is done.` }
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

/* One SkyDock at a time: a second one would fight the first over the same folder and the same
   camera, so opening it again brings the window already there to the front. */
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  void app.whenReady().then(() => {
    /* A Mac takes cut, copy and paste from the menu bar even where nothing shows one; the other two
       have them without it, and a menu nobody uses is a row of words across the top of the board. */
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

  /* Closing the window is closing SkyDock, on every system: the app is its window, and a Mac left
     with the app running and nothing to show has a server behind it working on nothing. */
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', stopServer)
}
