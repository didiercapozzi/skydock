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
import { BrowserWindow, Menu, app, dialog, shell } from 'electron'
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

/* What the app was told last time: where to work, and how big to draw. Both are the server's to
   write, so this only reads them, and anything else in there is none of this side's business. */
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
   Answered once and never asked again — the server writes it down. Not answering is an answer too:
   the suggested folder is used, and it can be moved later. */
const workFolder = async () => {
  const remembered = settings().outputDir?.trim()
  if (remembered) return remembered
  const suggested = suggestedWorkFolder()
  fs.mkdirSync(suggested, { recursive: true })
  const asked = await dialog.showOpenDialog({
    title: 'Where should SkyDock keep its work?',
    defaultPath: suggested,
    properties: ['openDirectory', 'createDirectory']
  })
  return asked.canceled ? suggested : (asked.filePaths[0] ?? suggested)
}

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

/* ⌘/ctrl with + or − and 0, as they do in any browser. The engine does the zooming; which keys ask
   for it is the window's own to say. Where it starts is the window's to say when it is made: a
   factor set before the first page has loaded is lost to that page on some machines and not on
   others. */
const zoomHotkeys = (contents: WebContents, start: number) => {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return
    const step = ZOOM_STEP[input.key]
    if (step === undefined && input.key !== '0') return
    event.preventDefault()
    const asked = input.key === '0' ? start : contents.getZoomFactor() + (step ?? 0)
    contents.setZoomFactor(Math.min(3, Math.max(0.5, asked)))
  })
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
    backgroundColor: '#f2f4f6',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'build', 'electron', 'preload.cjs'),
      zoomFactor: zoom
    }
  })
  window.webContents.setWindowOpenHandler(({ url: asked }) => {
    if (/^https?:/.test(asked)) void shell.openExternal(asked)
    return { action: 'deny' }
  })
  zoomHotkeys(window.webContents, zoom)
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
   ends. */
const startServer = async () => {
  const outputDir = await workFolder()
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
        openWindow(`http://127.0.0.1:${ready[1]}`)
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
      .then(({ response }) => {
        if (response !== 0) return
        /* the server is stopped on the way out, as it is however the app ends */
        stopServer()
        autoUpdater.quitAndInstall()
      })
  })
  void autoUpdater.checkForUpdates()
}

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
