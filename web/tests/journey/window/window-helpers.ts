import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { chromium } from 'playwright'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, describe } from 'vitest'
import { makeWorld } from '../app'
import { makeBigClip, tool } from '../media'
import type { World } from '../app'
import { loadState } from '../saved'
import { VIDEOS } from '../page'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const JOURNEY = path.join(here, '..')
const REPO = path.join(JOURNEY, '..', '..', '..')
const SCREENS = path.join(JOURNEY, 'screens')
const ELECTRON_DIR = path.join(REPO, 'node_modules', 'electron')
const ELECTRON = path.join(ELECTRON_DIR, 'dist', 'electron')
const SIZE = { width: 1440, height: 900 }
const PORT = 9333

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

const waitFor = async <T>(
  what: string,
  look: () => T | undefined | false | null | Promise<T | undefined | false | null>,
  seconds = 30
) => {
  for (let tries = 0; tries < seconds * 4; tries++) {
    const found = await look()
    if (found) return found
    await sleep(250)
  }
  throw new Error(`gave up waiting for ${what}`)
}

const cachedZip = () => {
  const version = (
    JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, 'package.json'), 'utf8')) as {
      version: string
    }
  ).version
  const name = `electron-v${version}-${process.platform}-${process.arch}.zip`
  const roots = [process.env.ELECTRON_CACHE, path.join(os.homedir(), '.cache', 'electron')]
  const search = (folder: string, depth: number): string | null => {
    if (!fs.existsSync(folder)) return null
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const found = path.join(folder, entry.name)
      if (entry.isFile() && entry.name === name) return found
      if (entry.isDirectory() && depth > 0) {
        const inside = search(found, depth - 1)
        if (inside) return inside
      }
    }
    return null
  }
  for (const root of roots) {
    const found = root ? search(root, 2) : null
    if (found) return found
  }
  return null
}

const electronReady = () => {
  if (fs.existsSync(ELECTRON)) return true
  try {
    const zip = fs.existsSync(ELECTRON_DIR) ? cachedZip() : null
    if (!zip) return false
    execFileSync('unzip', ['-q', '-o', zip, '-d', path.join(ELECTRON_DIR, 'dist')])
    return fs.existsSync(ELECTRON)
  } catch {
    return false
  }
}

const windowAvailable = electronReady()
if (!windowAvailable) console.warn('window journey skipped: no Electron binary')

const windowDescribe = (name: string, chapters: () => void) =>
  describe.skipIf(!windowAvailable)(
    windowAvailable ? name : `${name} (skipped: no Electron binary)`,
    chapters
  )

const ensureShell = () => {
  if (fs.existsSync(path.join(REPO, 'build', 'electron', 'main.cjs'))) return
  execFileSync('npx', ['tsx', 'scripts/build-shell.ts'], { cwd: REPO, stdio: 'inherit' })
}

const freeDisplay = () => {
  const n = [90, 91, 92, 93, 94, 95, 96, 97, 98].find(
    (each) => !fs.existsSync(`/tmp/.X11-unix/X${each}`)
  )
  if (n === undefined) throw new Error('no free display to draw on')
  return `:${n}`
}

const isPreview = (address: string) => {
  try {
    return (
      /^http:/.test(address) && (new URL(address).searchParams.get('q') ?? '').includes('preview')
    )
  } catch {
    return false
  }
}

type Seen = { id: string; name: string; x: number; y: number; width: number; height: number }
type Launch = {
  env?: Record<string, string>
  settings?: Record<string, unknown>
  state?: string
  prepare?: (world: World) => void
}

const useDesk = (name: string) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-window-'))
  const configHome = path.join(root, 'config')
  const userData = path.join(configHome, 'ch.skydock.app')
  const started: ChildProcess[] = []
  const pages = new Map<Page, string[]>()
  let display = ''
  let film: ChildProcess | null = null
  let app: ChildProcess | null = null
  let appExited = true
  let taken = 0
  let failed = false
  let world: World = makeWorld()
  let connected = false

  const desktop = (extra: Record<string, string> = {}) => {
    const { WAYLAND_DISPLAY: _wayland, ELECTRON_RUN_AS_NODE: _node, ...rest } = process.env
    return {
      ...rest,
      DISPLAY: display,
      GDK_BACKEND: 'x11',
      XDG_SESSION_TYPE: 'x11',
      HOME: root,
      XDG_CONFIG_HOME: configHome,
      ...extra
    }
  }

  const run = (command: string, args: string[], extra: Record<string, string> = {}) => {
    const child = spawn(command, args, { env: desktop(extra), detached: true, stdio: 'ignore' })
    started.push(child)
    return child
  }

  const pointer = (...args: string[]) =>
    execFileSync('xdotool', args, { env: desktop() }).toString().trim()

  const windows = (): Seen[] => {
    let ids: string[] = []
    try {
      ids = pointer('search', '--onlyvisible', '--name', '.').split('\n').filter(Boolean)
    } catch {
      return []
    }
    return ids.flatMap((id) => {
      try {
        const said = pointer('getwindowgeometry', '--shell', id)
        const value = (key: string) => Number(new RegExp(`^${key}=(-?\\d+)`, 'm').exec(said)?.[1])
        const seen = {
          id,
          name: pointer('getwindowname', id),
          x: value('X'),
          y: value('Y'),
          width: value('WIDTH'),
          height: value('HEIGHT')
        }
        return seen.width > 50 && seen.height > 50 ? [seen] : []
      } catch {
        return []
      }
    })
  }

  const shot = (what: string) => {
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
        path.join(SCREENS, `${name}-${++taken}-${what}.png`)
      ],
      { env: desktop() }
    )
  }

  const attach = (page: Page) => {
    if (pages.has(page)) return
    const problems: string[] = []
    pages.set(page, problems)
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
        problems.push(`console: ${m.text()}`)
    })
    page.on('pageerror', (e) => problems.push(`page: ${e.message}`))
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`)
    })
  }

  let connectedContext: BrowserContext | null = null

  const open = () => {
    if (!connectedContext) return []
    for (const page of connectedContext.pages()) attach(page)
    return connectedContext.pages()
  }

  const start = async () => {
    display = freeDisplay()
    fs.mkdirSync(userData, { recursive: true })
    run('Xvfb', [display, '-screen', '0', `${SIZE.width}x${SIZE.height}x24`])
    await waitFor('the screen', () => fs.existsSync(`/tmp/.X11-unix/X${display.slice(1)}`))
    run('openbox', [])
    if (!process.env.JOURNEY_FILM) return
    fs.mkdirSync(VIDEOS, { recursive: true })
    film = run('ffmpeg', [
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
      path.join(VIDEOS, `window-${name}.mp4`)
    ])
  }

  const launch = async (options: Launch = {}) => {
    if (!display) await start()
    ensureShell()
    if (options.state) {
      world = loadState(options.state)
      options.prepare?.(world)
      fs.cpSync(world.config, userData, { recursive: true })
    }
    const settingsFile = path.join(userData, 'settings.json')
    const kept = fs.existsSync(settingsFile)
      ? (JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>)
      : {}
    const told = {
      ...kept,
      ...(options.state ? { outputDir: world.output } : {}),
      ...options.settings
    }
    fs.writeFileSync(settingsFile, JSON.stringify(told))
    appExited = false
    app = spawn(
      ELECTRON,
      [REPO, '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`],
      { env: desktop(options.env), detached: true, stdio: 'ignore' }
    )
    started.push(app)
    app.once('exit', () => {
      appExited = true
    })
    await waitFor('the window', () => windows().some((w) => /SkyDock/.test(w.name)), 90)
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
    connectedContext = await waitFor('the browser context', () => browser.contexts()[0], 30)
    connected = true
    await waitFor('the first page', () => open()[0], 30)
  }

  const quit = async () => {
    if (app?.pid && !appExited) {
      try {
        process.kill(-app.pid, 'SIGTERM')
      } catch {}
    }
    await waitFor('the window to be gone', () => appExited, 30)
    connected = false
    connectedContext = null
    pages.clear()
  }

  const pageWhere = async (what: string, wanted: (address: string) => boolean, seconds = 60) =>
    waitFor(what, () => open().find((page) => wanted(page.url())), seconds)

  const board = () =>
    pageWhere('the board', (address) => /^http:/.test(address) && !isPreview(address))
  const welcome = () => pageWhere('the welcome page', (address) => address.startsWith('file:'))
  const preview = () => pageWhere('the file window', isPreview)

  const screenBox = async (page: Page, target: Locator) => {
    await target.waitFor({ state: 'visible', timeout: 30_000 })
    const where = await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        scale: window.devicePixelRatio,
        inner: [window.innerWidth, window.innerHeight],
        outer: [window.outerWidth, window.outerHeight]
      }
    })
    const wide = Math.round(where.outer[0]!)
    const high = Math.round(where.outer[1]!)
    const frame = windows().find(
      (w) => Math.abs(w.width - wide) <= 2 && Math.abs(w.height - high) <= 2
    )
    if (!frame)
      throw new Error(
        `no window on the screen is ${wide}x${high}, the size of the page asked about`
      )
    const border = {
      x: (where.outer[0]! - where.inner[0]! * where.scale) / 2,
      y: (where.outer[1]! - where.inner[1]! * where.scale) / 2
    }
    return {
      x: frame.x + border.x + where.x * where.scale,
      y: frame.y + border.y + where.y * where.scale,
      width: where.width * where.scale,
      height: where.height * where.scale
    }
  }

  const middleOf = async (page: Page, target: Locator) => {
    const box = await screenBox(page, target)
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  }

  const moveTo = (x: number, y: number) => pointer('mousemove', String(x), String(y))

  const click = async (page: Page, target: Locator, times = 1) => {
    const { x, y } = await middleOf(page, target)
    moveTo(x, y)
    await sleep(120)
    pointer('click', '--repeat', String(times), '--delay', '90', '1')
  }

  const emptySpaceOf = async (page: Page, target: Locator) => {
    const box = await screenBox(page, target)
    const around = await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const scale = window.devicePixelRatio
      const found: number[] = []
      for (let x = r.x + 4; x < r.x + r.width - 4; x += 8) {
        const at = document.elementFromPoint(x, r.y + r.height / 2)
        if (at && el.contains(at) && !at.closest('button,input,a,select,textarea,label,video'))
          found.push(x * scale)
      }
      return { found, first: r.x * scale }
    })
    const x = around.found[Math.floor(around.found.length / 2)]
    if (x === undefined) throw new Error('no empty space in the toolbar to press on')
    return { x: Math.round(box.x + (x - around.first)), y: Math.round(box.y + box.height / 2) }
  }

  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    moveTo(from.x, from.y)
    pointer('mousedown', '1')
    const steps = 8
    for (let step = 1; step <= steps; step++) {
      moveTo(
        Math.round(from.x + ((to.x - from.x) * step) / steps),
        Math.round(from.y + ((to.y - from.y) * step) / steps)
      )
      await sleep(120)
    }
    pointer('mouseup', '1')
  }

  const key = (...keys: string[]) => pointer('key', '--delay', '60', ...keys)

  const dialog = (title: string, seconds = 30) =>
    waitFor(`the dialog "${title}"`, () => windows().find((w) => w.name.includes(title)), seconds)

  const dialogGone = (title: string, seconds = 30) =>
    waitFor(
      `the dialog "${title}" to close`,
      () => !windows().some((w) => w.name.includes(title)),
      seconds
    )

  const chooseFolder = async (title: string, folder: string) => {
    const picker = await dialog(title)
    pointer('windowfocus', picker.id)
    await sleep(500)
    key('ctrl+l')
    await sleep(300)
    pointer('type', '--delay', '30', folder)
    await sleep(300)
    for (let attempt = 0; attempt < 4; attempt++) {
      key('alt+o')
      await sleep(900)
      if (!windows().some((w) => w.name.includes(title))) return
    }
    throw new Error(`the folder picker "${title}" did not take ${folder}`)
  }

  const dismissDialog = async (title: string) => {
    const found = await dialog(title)
    pointer('windowfocus', found.id)
    await sleep(300)
    key('Escape')
    await dialogGone(title)
  }

  const answer = async (title: string, which: 'first' | 'second') => {
    const found = await dialog(title)
    pointer('windowfocus', found.id)
    await sleep(500)
    if (which === 'second') {
      key('Tab')
      await sleep(300)
    }
    key('Return')
    await dialogGone(title)
  }

  const silent = () => {
    open()
    const said = [...pages.entries()].flatMap(([page, problems]) =>
      problems.splice(0).map((p) => `${page.url()} ${p}`)
    )
    if (said.length > 0) throw new Error(`the window broke without saying so:\n${said.join('\n')}`)
  }

  const settings = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')) as Record<
        string,
        unknown
      >
    } catch {
      return {}
    }
  }

  const stop = async () => {
    film?.kill('SIGINT')
    await sleep(1500)
    for (const child of started.reverse()) {
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch {}
    }
    fs.rmSync(world.root, { recursive: true, force: true })
    if (!failed) fs.rmSync(root, { recursive: true, force: true })
  }

  afterAll(stop)

  return {
    launch,
    quit,
    run,
    pointer,
    windows,
    shot,
    board,
    welcome,
    preview,
    pages: open,
    screenBox,
    middleOf,
    click,
    emptySpaceOf,
    drag,
    moveTo,
    key,
    dialog,
    dialogGone,
    chooseFolder,
    dismissDialog,
    answer,
    silent,
    settings,
    get world() {
      return world
    },
    get root() {
      return root
    },
    get running() {
      return connected && !appExited
    },
    markFailed: () => {
      failed = true
    }
  }
}

const lengthenFootage = (world: World, seconds = 1800) => {
  const clips = fs
    .readdirSync(path.join(world.output, 'original_files'), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.MP4'))
  for (const clip of clips) {
    const file = path.join(world.output, 'original_files', clip)
    const { atime, mtime } = fs.statSync(file)
    const short = `${file}.short.mp4`
    makeBigClip(short, mtime.toISOString().slice(0, 19), {
      seconds: 20,
      size: '1920x1080',
      fast: true
    })
    execFileSync(tool('ffmpeg'), [
      '-y',
      '-v',
      'error',
      '-stream_loop',
      String(Math.ceil(seconds / 20)),
      '-i',
      short,
      '-c',
      'copy',
      '-t',
      String(seconds),
      '-f',
      'mp4',
      file
    ])
    fs.rmSync(short)
    fs.utimesSync(file, atime, mtime)
  }
}

const sees = (target: Locator, expected: string | RegExp, seconds = 15) =>
  waitFor(
    `${target} to say ${expected}`,
    async () => {
      const said = (await target.innerText()).trim()
      return typeof expected === 'string' ? said === expected : expected.test(said)
    },
    seconds
  )

const hasAttribute = (target: Locator, name: string, value: string, seconds = 15) =>
  waitFor(
    `${target} to have ${name}=${value}`,
    async () => (await target.getAttribute(name)) === value,
    seconds
  )

const gone = (target: Locator, seconds = 15) =>
  waitFor(`${target} to be out of sight`, async () => !(await target.isVisible()), seconds)

const disabled = (target: Locator, seconds = 15) =>
  waitFor(`${target} to be disabled`, () => target.isDisabled(), seconds)

type Desk = ReturnType<typeof useDesk>

export {
  disabled,
  gone,
  hasAttribute,
  JOURNEY,
  lengthenFootage,
  sees,
  PORT,
  sleep,
  useDesk,
  waitFor,
  windowAvailable,
  windowDescribe
}
export type { Desk }
