import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { BrowserContext, Page } from 'playwright'

const FFMPEG = () => process.env.SKYDOCK_FFMPEG_PATH ?? 'ffmpeg'
const FFPROBE = () => process.env.SKYDOCK_FFPROBE_PATH ?? 'ffprobe'

const makeBigClip = (file: string, when: string, seconds: number, size = '1920x1080') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync(FFMPEG(), [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${size}:rate=25:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-metadata',
    `creation_time=${when}Z`,
    file
  ])
  const at = new Date(when)
  fs.utimesSync(file, at, at)
}

const probe = (file: string) => {
  const [width, height, seconds] = execFileSync(FFPROBE(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'csv=p=0:s=,',
    file
  ])
    .toString()
    .trim()
    .split(/[,\n]/)
    .map(Number)
  return { width: width ?? 0, height: height ?? 0, seconds: seconds ?? 0 }
}

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

export { identities, lookAtPages, makeBigClip, probe, seenSince }
