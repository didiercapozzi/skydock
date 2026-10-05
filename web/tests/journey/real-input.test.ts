import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { CLIPS, makeClip } from './media'
import { VIDEOS } from './page'

/* SkyDock's own window, on a screen of its own, worked with a real pointer: the X server is real, so is the
   window manager, and so is the drop — files offered by another program, by address, the way a file manager
   offers them, and let go over the board by a mouse that is pressed, moved and released. Nothing here is
   handed to the page; the page is only read (by its debugging port) to say what it shows. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const SCREENS = path.join(here, 'screens')
const ELECTRON = path.join(here, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron')
const SIZE = { width: 1440, height: 900 }
const PORT = 9333

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const waitFor = async <T>(what: string, look: () => T | undefined | false, seconds = 30) => {
  for (let tries = 0; tries < seconds * 4; tries++) {
    const found = look()
    if (found) return found
    await sleep(250)
  }
  throw new Error(`gave up waiting for ${what}`)
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-window-'))
const output = path.join(root, 'work')
const computer = path.join(root, 'computer')
const started: ChildProcess[] = []
let display = ''
let page: Page
let taken = 0
let film: ChildProcess

/* a display number nobody is using, so nothing here ever draws on the machine's own screen */
const freeDisplay = () => {
  const n = [90, 91, 92, 93, 94, 95, 96, 97, 98].find(
    (each) => !fs.existsSync(`/tmp/.X11-unix/X${each}`)
  )
  if (n === undefined) throw new Error('no free display to draw on')
  return `:${n}`
}

/* the environment of a desktop of this run's own: not the machine's session, not its Wayland socket, which a
   toolkit would rather draw on */
const desktop = () => {
  const { WAYLAND_DISPLAY: _wayland, ELECTRON_RUN_AS_NODE: _node, ...rest } = process.env
  return {
    ...rest,
    DISPLAY: display,
    GDK_BACKEND: 'x11',
    XDG_SESSION_TYPE: 'x11',
    HOME: root,
    XDG_CONFIG_HOME: path.join(root, 'config')
  }
}

const start = (command: string, args: string[]) => {
  const child = spawn(command, args, { env: desktop(), detached: true, stdio: 'ignore' })
  started.push(child)
  return child
}

const pointer = (...args: string[]) =>
  execFileSync('xdotool', args, { env: desktop() }).toString().trim()

/* what is on the screen, to be looked at afterwards */
const shot = (name: string) => {
  fs.mkdirSync(SCREENS, { recursive: true })
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'x11grab',
      '-video_size',
      `${SIZE.width}x${SIZE.height}`,
      '-i',
      display,
      '-frames:v',
      '1',
      path.join(SCREENS, `${++taken}-${name}.png`)
    ],
    { env: desktop() }
  )
}

beforeAll(async () => {
  /* the window's own program is unpacked from the copy Electron keeps, which an install may have removed */
  if (!fs.existsSync(ELECTRON))
    execFileSync('node', [path.join(path.dirname(path.dirname(ELECTRON)), 'install.js')])
  display = freeDisplay()
  fs.mkdirSync(computer)
  fs.mkdirSync(path.join(root, 'config', 'ch.skydock.app'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'config', 'ch.skydock.app', 'settings.json'),
    JSON.stringify({ outputDir: output })
  )
  start('Xvfb', [display, '-screen', '0', `${SIZE.width}x${SIZE.height}x24`])
  await waitFor('the screen', () => fs.existsSync(`/tmp/.X11-unix/X${display.slice(1)}`))
  start('openbox', [])
  /* the whole screen is filmed, whatever happens on it */
  fs.mkdirSync(VIDEOS, { recursive: true })
  film = start('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'x11grab',
    '-framerate',
    '15',
    '-video_size',
    `${SIZE.width}x${SIZE.height}`,
    '-i',
    display,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+frag_keyframe+empty_moov',
    path.join(VIDEOS, 'window.mp4')
  ])
  start(ELECTRON, [
    path.join(here, '..', '..', '..'),
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`
  ])
  await waitFor(
    'the window',
    () => {
      try {
        return pointer('search', '--name', 'SkyDock')
      } catch {
        return undefined
      }
    },
    60
  )
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  page = await waitFor('the page', () => browser.contexts()[0]?.pages()[0], 30)
  await page.getByText('Nothing left to sort').first().waitFor()
})

afterAll(async () => {
  /* the film is ended first, by asking, so what it holds is a file that plays */
  film?.kill('SIGINT')
  await sleep(1500)
  for (const child of started.reverse()) {
    try {
      process.kill(-child.pid!, 'SIGTERM')
    } catch {}
  }
  if (!fs.existsSync(SCREENS) || fs.readdirSync(SCREENS).length === 0)
    fs.rmSync(root, { recursive: true, force: true })
})

describe('the window, worked with a real pointer', () => {
  test('files let go over the board from another program are copied into the originals, and become a jump when asked', async () => {
    const files = CLIPS.slice(0, 3).map(([name, when]) => {
      const file = path.join(computer, name)
      makeClip(file, when)
      return file
    })
    start('python3', [path.join(here, 'drag-source.py'), '1000', '640', ...files])
    const source = await waitFor('the files to drag', () => {
      try {
        return pointer('search', '--name', 'files to drag')
      } catch {
        return undefined
      }
    })
    shot('files-offered')

    /* press on the files, carry them across the screen, and let go over the board */
    pointer('mousemove', '1100', '690')
    pointer('mousedown', '1')
    for (const [x, y] of [
      [1080, 680],
      [1000, 640],
      [900, 600],
      [800, 520],
      [750, 480],
      [720, 470]
    ]) {
      pointer('mousemove', String(x), String(y))
      await sleep(150)
    }
    shot('carried-over-the-board')
    pointer('mouseup', '1')
    expect(source).toBeTruthy()

    await waitFor('the files in the originals', () => {
      const inside = fs.existsSync(path.join(output, 'original_files'))
        ? fs
            .readdirSync(path.join(output, 'original_files'), { recursive: true })
            .filter((f) => String(f).endsWith('.MP4'))
        : []
      return inside.length === 3
    })
    await page
      .getByText(/has been added to Fresh files|files have been added to Fresh files/)
      .first()
      .waitFor()
    shot('copied')

    /* the button that makes a jump of them, pressed with the pointer */
    pointer('mousemove', '1315', '177', 'click', '1')
    await page.getByText('Jump 1', { exact: true }).waitFor({ timeout: 30_000 })
    shot('grouped')
  })
})
