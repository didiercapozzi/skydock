import * as fs from 'node:fs'
import * as path from 'node:path'
import type { BrowserContext, Page } from 'playwright'

const lookInside = () => {
  const bars: Record<string, number> = JSON.parse(sessionStorage.getItem('e-bars') ?? '{}')
  const longest: number[] = JSON.parse(sessionStorage.getItem('e-long') ?? '[]')
  const keep = () => {
    sessionStorage.setItem('e-bars', JSON.stringify(bars))
    sessionStorage.setItem('e-long', JSON.stringify(longest))
  }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (entry.startTime > 4000) longest.push(entry.duration)
    keep()
  }).observe({ type: 'longtask', buffered: true })
  const read = () => {
    for (const bar of document.querySelectorAll('[role=progressbar][aria-label]')) {
      const label = bar.getAttribute('aria-label') ?? ''
      const now = Number(bar.getAttribute('aria-valuenow') ?? 0)
      bars[label] = Math.max(bars[label] ?? -1, now)
    }
    keep()
  }
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-valuenow']
    })
    read()
  })
}

const lookAtPages = (context: BrowserContext) => context.addInitScript(lookInside)

const seenSince = async (page: Page) =>
  page.evaluate(() => {
    const bars: Record<string, number> = JSON.parse(sessionStorage.getItem('e-bars') ?? '{}')
    const longest: number[] = JSON.parse(sessionStorage.getItem('e-long') ?? '[]')
    sessionStorage.removeItem('e-bars')
    sessionStorage.removeItem('e-long')
    return { bars, longest: Math.max(0, ...longest) }
  })

const identities = (folder: string) =>
  Object.fromEntries(
    fs
      .readdirSync(folder)
      .sort()
      .map((name) => {
        const stat = fs.statSync(path.join(folder, name))
        return [name, `${stat.ino}:${stat.ctimeMs}`]
      })
  )

export { identities, lookAtPages, seenSince }
