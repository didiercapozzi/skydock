import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import type { Page } from 'playwright'

/* One screenshot per page, in light and in dark, compared with the one kept from the last time it was known
   to be right. A picture is never exact from one machine to the next, so what counts is how much of it
   changed: a few pixels of edge are nothing, a moved panel or a lost colour is a lot. Times and the like are
   masked first, so a clock never fails a chapter. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const BASELINES = path.join(here, 'baselines')

/* the share of pixels allowed to differ, and how far a channel may move before a pixel counts as different */
const MOST_CHANGED = 0.012
const CHANNEL = 28

/* every clock, date with a time and "n minutes ago" on the page is replaced by marks of the same width class,
   which is what hides them without moving anything around them */
const maskTimes = (page: Page) =>
  page.evaluate(() => {
    const clock = /\b\d{1,2}:\d{2}(:\d{2})?\b/g
    const ago = /\b\d+\s*(s|sec|seconds?|min|minutes?|h|hours?)\s+ago\b|\bjust now\b/gi
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      const masked = text.replace(clock, (m) => m.replace(/\d/g, '0')).replace(ago, 'now')
      if (masked !== text) node.textContent = masked
    }
  })

/* a page is still once its pictures are there and its fonts are drawn, and the pointer drawn for the film
   is not part of it */
const settle = async (page: Page) => {
  await page.addStyleTag({ content: 'div[style*="2147483647"] { display: none !important }' })
  await page.evaluate(async () => {
    await document.fonts.ready
    const pictures = [...document.images]
    await Promise.all(
      pictures.map((image) =>
        image.complete
          ? null
          : new Promise((done) => {
              image.addEventListener('load', done, { once: true })
              image.addEventListener('error', done, { once: true })
              setTimeout(done, 10_000)
            })
      )
    )
  })
  /* thumbnails are made when first asked for: the page is still when nothing more is being fetched */
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
}

/* what the page would have to show for a person who pinned a theme: set where the app reads it, before the
   page draws */
const pinTheme = async (page: Page, theme: 'light' | 'dark') => {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('skydock.theme', value)
    } catch {
      /* a page that cannot keep a setting is drawn as it comes */
    }
  }, theme)
}

/* how much of two pictures differs, worked out in a page of its own, since a page already knows how to
   read a picture */
const difference = async (page: Page, a: Buffer, b: Buffer) =>
  page.evaluate(
    async ([one, two, channel]) => {
      const load = (data: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = `data:image/png;base64,${data}`
        })
      const [x, y] = await Promise.all([load(one as string), load(two as string)])
      if (x.width !== y.width || x.height !== y.height) return 1
      const pixels = (image: HTMLImageElement) => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, image.width, image.height).data
      }
      const [p, q] = [pixels(x), pixels(y)]
      let changed = 0
      for (let at = 0; at < p.length; at += 4)
        if (
          Math.abs(p[at]! - q[at]!) > (channel as number) ||
          Math.abs(p[at + 1]! - q[at + 1]!) > (channel as number) ||
          Math.abs(p[at + 2]! - q[at + 2]!) > (channel as number)
        )
          changed++
      return changed / (p.length / 4)
    },
    [a.toString('base64'), b.toString('base64'), CHANNEL] as const
  )

/* takes the page as it is, and compares it with its baseline; `JOURNEY_UPDATE=1` keeps the picture as the new
   baseline. The baselines are made on the machine that runs them and are not kept in git — a picture is never
   exact from one machine to the next — so a page with no baseline yet gets one, and says so. Returns what
   differs, or null. */
const checkScreen = async (page: Page, name: string) => {
  await settle(page)
  await maskTimes(page)
  const now = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  const file = path.join(BASELINES, `${name}.png`)
  if (process.env.JOURNEY_UPDATE === '1' || !fs.existsSync(file)) {
    fs.mkdirSync(BASELINES, { recursive: true })
    fs.writeFileSync(file, now)
    return null
  }
  const share = await difference(page, now, fs.readFileSync(file))
  if (share <= MOST_CHANGED) return null
  const failed = path.join(BASELINES, '..', 'screens')
  fs.mkdirSync(failed, { recursive: true })
  fs.writeFileSync(path.join(failed, `${name}.now.png`), now)
  return `${name}: ${(share * 100).toFixed(2)}% of the picture changed (allowed ${(MOST_CHANGED * 100).toFixed(1)}%) — now: screens/${name}.now.png`
}

export { BASELINES, checkScreen, pinTheme }
