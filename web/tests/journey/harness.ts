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

type Options = {
  name: string
  state?: string
  prepare?: (world: World) => void | Promise<void>
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

  afterEach(async (test) => {
    if (test.task.result?.state !== 'fail') return
    failed = true
    const shot = path.join(world.root, `${test.task.name.replace(/\W+/g, '-')}.png`)
    await page.screenshot({ path: shot })
    console.log(
      `[journey] failed — screen: ${shot}\n${(await page.locator('body').innerText()).slice(0, 1500)}`
    )
  })

  afterAll(async () => {
    const film = page?.video()
    if (filming)
      await context?.tracing.stop(failed ? { path: path.join(world.root, 'trace.zip') } : {})
    await context?.close()
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

  const see = (text: string | RegExp, timeout = 15_000) =>
    page.getByText(text).first().waitFor({ state: 'visible', timeout })

  const quiet = async () => expect(await seen.take(), 'nothing went wrong unnoticed').toEqual([])

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
    save: (name: string) => saveState(world, name)
  }
}

type Journey = ReturnType<typeof harness>

export { harness }
export type { Journey, Options }
