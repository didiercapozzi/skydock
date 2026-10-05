import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { makeWorld, start } from './app'
import type { World } from './app'
import { CLIPS, dayFolder, DROPS, makeClip, makePhoto, PHOTOS } from './media'
import { dropFiles, pointerDot, VIDEOS, watch } from './page'

/* One person, one afternoon: the footage comes in, is sorted, trimmed, prepared and sent, with the real
   server, the real tools and a browser. Every chapter ends by asking whether anything broke without saying
   so — an error in the console, a request the server could not answer. */

let world: World
let app: Awaited<ReturnType<typeof start>>
let browser: Browser
let context: BrowserContext
let page: Page
let seen: ReturnType<typeof watch>

const open = async (at = '/') => {
  await page.goto(`${app.url}${at}`)
}

/* a person waits for the page to show something; so does this */
const see = (text: string | RegExp, timeout = 15_000) =>
  page.getByText(text).first().waitFor({ state: 'visible', timeout })

const quiet = async () => expect(await seen.take(), 'nothing went wrong unnoticed').toEqual([])

beforeAll(async () => {
  world = makeWorld()
  /* and what is on the computer, to be dropped */
  for (const [name, when] of DROPS) makeClip(path.join(world.computer, name), when)
  app = await start(world)
  /* the whole run is filmed, with the pointer drawn, so it can be watched afterwards; JOURNEY_SLOW (ms) slows
     every action down to the pace of a person */
  browser = await chromium.launch({ slowMo: Number(process.env.JOURNEY_SLOW ?? 0) })
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEOS, size: { width: 1280, height: 800 } }
  })
  await context.addInitScript(pointerDot)
  await context.tracing.start({ screenshots: true, snapshots: true })
  page = await context.newPage()
  seen = watch(page)
})

/* a chapter that fails leaves what the person would have seen, and what was on screen */
afterEach(async (context) => {
  if (context.task.result?.state !== 'fail') return
  failed = true
  const shot = path.join(world.root, `${context.task.name.replace(/\W+/g, '-')}.png`)
  await page.screenshot({ path: shot })
  console.log(
    `[journey] failed — screen: ${shot}\n${(await page.locator('body').innerText()).slice(0, 1500)}`
  )
})

/* a run that fails keeps its folder, with the screens of what failed and a trace to open with
   `npx playwright show-trace` */
let failed = false
afterAll(async () => {
  const film = page?.video()
  await context?.tracing.stop(failed ? { path: path.join(world.root, 'trace.zip') } : {})
  await context?.close()
  /* kept as mp4, which a click in the editor plays; the browser's own film is webm */
  const raw = path.join(VIDEOS, 'journey.webm')
  await film?.saveAs(raw)
  await film?.delete()
  if (film)
    execFileSync(process.env.SKYDOCK_FFMPEG_PATH ?? 'ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      raw,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      path.join(VIDEOS, 'journey.mp4')
    ])
  fs.rmSync(raw, { force: true })
  await browser?.close()
  await app?.stop()
  if (!failed) fs.rmSync(world.root, { recursive: true, force: true })
})

describe('the first afternoon', () => {
  test('opens on an empty board that says so', async () => {
    await open()
    await see('Nothing left to sort')
    await quiet()
  })

  /* what a camera copy leaves in the originals: one folder a day, as the card had it */
  test('finds the jumps in what a camera copy left, when asked to scan', async () => {
    for (const [name, when] of CLIPS) makeClip(path.join(dayFolder(world, when), name), when)
    for (const [name, when] of PHOTOS) makePhoto(path.join(dayFolder(world, when), name), when)
    await page.getByRole('button', { name: 'Scan' }).click()
    await see(/8 files in 3 jumps/, 60_000)
    await quiet()
  })

  test('takes in files dropped from the computer, and leaves them loose', async () => {
    await dropFiles(
      page,
      DROPS.map(([name]) => path.join(world.computer, name))
    )
    await see('GX010001.MP4 has been added to Fresh files', 60_000)
    await quiet()
  })
})

describe('sorting', () => {
  test('makes a destination, and files a jump into it by dragging it there', async () => {
    await page.getByRole('button', { name: /Add a destination/ }).click()
    await page.getByPlaceholder('New destination').fill('Sion')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const sion = page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
    await sion.waitFor()

    await page.getByText('Jump 1', { exact: true }).dragTo(sion)
    await see('3 files need processing')
    await quiet()
  })

  test('stops saying how many clips have their small copy once every clip can be played', async () => {
    await page.getByText(/Proxies ready/).waitFor({ state: 'detached', timeout: 30_000 })
    await quiet()
  })
})

describe('preparing', () => {
  test('processes the files of a destination, and writes their copies', async () => {
    await page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(fs.readdirSync(path.join(world.output, 'processed', 'Sion')).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4'
    ])
    await quiet()
  })
})

describe('trimming', () => {
  const copy = path.join('processed', 'Sion', 'sion_20260905_100000.mp4')
  const seconds = (file: string) =>
    Number(
      execFileSync(process.env.SKYDOCK_FFPROBE_PATH ?? 'ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file
      ])
    )
  /* a clip is opened by double-clicking it */
  const openClip = async () => {
    await page.getByText('sion_20260905_100000.mp4').first().dblclick()
    await page.getByRole('dialog', { name: 'Preview' }).waitFor()
  }
  const dialog = () => page.getByRole('dialog', { name: 'Preview' })

  test('trims a clip from the middle, and the copy is shorter once it is made again', async () => {
    expect(seconds(path.join(world.output, copy))).toBeGreaterThan(3.5)
    await openClip()
    const bar = page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await dialog().getByRole('button', { name: 'Start here' }).click()
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await dialog().waitFor({ state: 'detached' })

    await see('1 file needs processing')
    await page.getByRole('button', { name: 'Process 1 file' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(seconds(path.join(world.output, copy))).toBeLessThan(2.5)
    await quiet()
  })

  test('puts a clip back whole with Reset and Save, and the copy is whole again', async () => {
    await openClip()
    await dialog().getByRole('button', { name: 'Reset trim, frame and turn' }).click()
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await dialog().waitFor({ state: 'detached' })

    await see('1 file needs processing')
    await page.getByRole('button', { name: 'Process 1 file' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(seconds(path.join(world.output, copy))).toBeGreaterThan(3.5)
    await quiet()
  })
})

describe('stopping and opening again', () => {
  test('finds everything as it was left, from the record alone', async () => {
    await app.stop()
    app = await start(world)
    await open()
    await page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .click()
    await see('3 files are ready to upload')
    await page.getByRole('link', { name: /Fresh files/ }).click()
    await see('2 jumps are waiting for a home')
    await quiet()
  })
})

describe('the bin', () => {
  test('keeps a file put aside, and brings it back to Fresh files when asked', async () => {
    const original = path.join(world.output, 'original_files', '2026-09-06', 'GX010001.MP4')
    const row = page.locator('div', { has: page.getByText('GX010001.MP4', { exact: true }) }).last()
    await row.getByRole('button', { name: 'Pick' }).click()
    await page.getByRole('button', { name: /Remove…/ }).click()
    await page.getByRole('button', { name: 'Put in the bin' }).click()
    await page.getByText('GX010001.MP4', { exact: true }).first().waitFor({ state: 'detached' })
    expect(fs.existsSync(original), 'moved out of the originals, not copied').toBe(false)

    await page.getByRole('link', { name: 'Bin' }).click()
    await see(/Put in the bin from Fresh files/)
    await page.getByRole('button', { name: 'Pick GX010001.MP4' }).click()
    await page.getByRole('button', { name: /Bring 1 file back to Fresh files/ }).click()
    await page.getByRole('link', { name: /Fresh files/ }).click()
    await see('GX010001.MP4')
    expect(fs.existsSync(original), 'back where it was').toBe(true)
    await quiet()
  })
})
