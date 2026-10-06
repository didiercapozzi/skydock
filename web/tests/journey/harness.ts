import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import { makeWorld, start } from './app'
import type { World } from './app'
import { tool } from './media'
import { loadState, saveState } from './saved'
import { pointerDot, VIDEOS, watch } from './page'

/* What every file of the journey does the same way: a world of its own (or a saved one), the built app
   started on it, a browser with the whole run filmed and the pointer drawn, and — when a chapter fails —
   what the person would have seen. A file asks for it once and then writes only what a person does.

   `JOURNEY_SLOW` (ms) slows every action down to the pace of a person. `JOURNEY_FILM=1` films the run, with the
   pointer drawn, and keeps a trace of it: both cost time, so an ordinary run has neither. */

type Options = {
  /* names the film, and the folder kept when something fails */
  name: string
  /* start from the work folder another chapter saved, instead of an empty one */
  state?: string
  /* put things on the machine before the app starts: footage to be dropped, a camera folder, a stub */
  prepare?: (world: World) => void | Promise<void>
  /* what the app is told besides the folders of the run */
  env?: (world: World) => Record<string, string>
  viewport?: { width: number; height: number }
}

const harness = (options: Options) => {
  let world: World
  let app: Awaited<ReturnType<typeof start>>
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let seen: ReturnType<typeof watch>
  let failed = false
  const filming = Boolean(process.env.JOURNEY_FILM)
  const viewport = options.viewport ?? { width: 1280, height: 800 }
  const environment = () => options.env?.(world) ?? {}

  beforeAll(async () => {
    world = options.state ? loadState(options.state) : makeWorld()
    await options.prepare?.(world)
    app = await start(world, environment())
    browser = await chromium.launch({ slowMo: Number(process.env.JOURNEY_SLOW ?? 0) })
    fs.mkdirSync(VIDEOS, { recursive: true })
    context = await browser.newContext({
      viewport,
      ...(filming ? { recordVideo: { dir: VIDEOS, size: viewport } } : {})
    })
    if (filming) {
      await context.addInitScript(pointerDot)
      await context.tracing.start({ screenshots: true, snapshots: true })
    }
    page = await context.newPage()
    seen = watch(page)
  })

  /* a chapter that fails leaves what the person would have seen, and what was on screen */
  afterEach(async (test) => {
    if (test.task.result?.state !== 'fail') return
    failed = true
    const shot = path.join(world.root, `${test.task.name.replace(/\W+/g, '-')}.png`)
    await page.screenshot({ path: shot })
    console.log(
      `[journey] failed — screen: ${shot}\n${(await page.locator('body').innerText()).slice(0, 1500)}`
    )
  })

  /* a run that fails keeps its folder, with the screens of what failed — and, filmed, a trace to open with
     `npx playwright show-trace` */
  afterAll(async () => {
    const film = page?.video()
    if (filming)
      await context?.tracing.stop(failed ? { path: path.join(world.root, 'trace.zip') } : {})
    await context?.close()
    /* kept as mp4, which a click in the editor plays; the browser's own film is webm */
    const raw = path.join(VIDEOS, `${options.name}.webm`)
    await film?.saveAs(raw)
    await film?.delete()
    if (film)
      execFileSync(tool('ffmpeg'), [
        '-y',
        '-v',
        'error',
        '-i',
        raw,
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        path.join(VIDEOS, `${options.name}.mp4`)
      ])
    fs.rmSync(raw, { force: true })
    await browser?.close()
    await app?.stop()
    if (!failed) fs.rmSync(world.root, { recursive: true, force: true })
  })

  const open = async (at = '/') => {
    await page.goto(`${app.url}${at}`)
  }

  /* a person waits for the page to show something; so does this */
  const see = (text: string | RegExp, timeout = 15_000) =>
    page.getByText(text).first().waitFor({ state: 'visible', timeout })

  /* nothing went wrong without anyone saying so */
  const quiet = async () => expect(await seen.take(), 'nothing went wrong unnoticed').toEqual([])

  /* the app stopped and started again on the same folders, as when it is closed and opened */
  const restart = async () => {
    await app.stop()
    app = await start(world, environment())
  }

  return {
    get world() {
      return world
    },
    get app() {
      return app
    },
    get page() {
      return page
    },
    get context() {
      return context
    },
    open,
    see,
    quiet,
    restart,
    /* keep the work folder as it is now, for a chapter that starts from here */
    save: (name: string) => saveState(world, name)
  }
}

type Journey = ReturnType<typeof harness>

export { harness }
export type { Journey, Options }
