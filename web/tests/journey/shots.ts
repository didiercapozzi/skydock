import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import type { Page } from 'playwright'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const BASELINES = path.join(here, 'baselines')

const MOST_CHANGED = 0.012
const CHANNEL = 28

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

const picturesDrawn = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((image) =>
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

const settle = async (page: Page) => {
  await page.addStyleTag({ content: 'div[style*="2147483647"] { display: none !important }' })
  await picturesDrawn(page)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  await page.evaluate(
    () =>
      new Promise<void>((still) => {
        let timer = setTimeout(() => finish(), 250)
        const watcher = new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(() => finish(), 250)
        })
        const finish = () => {
          watcher.disconnect()
          still()
        }
        watcher.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true
        })
      })
  )
  await picturesDrawn(page)
  await page.evaluate(async () => {
    const ending = document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    await Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)))
    await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))
  })
}

const pinTheme = async (page: Page, theme: 'light' | 'dark') => {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('skydock.theme', value)
    } catch {}
  }, theme)
}

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
