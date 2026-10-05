import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import type { Page } from 'playwright'

/* What a person does that a test cannot do with a click: let go of files from the computer over the board.
   A headless browser has no desktop to drag from, so the drop is handed the files' real bytes, the way a
   browser hands them to a page. */
const dropFiles = async (page: Page, files: string[], onto = 'section[aria-label]') => {
  const payload = files.map((file) => ({
    name: path.basename(file),
    bytes: [...fs.readFileSync(file)],
    type: file.endsWith('.JPG') ? 'image/jpeg' : 'video/mp4',
    modified: fs.statSync(file).mtimeMs
  }))
  const transfer = await page.evaluateHandle((list) => {
    const data = new DataTransfer()
    for (const f of list)
      data.items.add(
        new File([new Uint8Array(f.bytes)], f.name, { type: f.type, lastModified: f.modified })
      )
    return data
  }, payload)
  for (const type of ['dragenter', 'dragover', 'drop'])
    await page.locator(onto).first().dispatchEvent(type, { dataTransfer: transfer })
}

/* what goes wrong without anyone saying so: an error in the console, or a request the server could not answer.
   A picture asked for by a page that has since been left is answered with nothing and is no one's problem,
   so a request that failed is asked for again when the chapter ends, and counts only if it fails again. */
const watch = (page: Page) => {
  const problems: string[] = []
  const failed: string[] = []
  page.on('console', (m) => {
    /* the browser says only that a resource failed; the response below says which */
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`page: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url())
  })
  const take = async () => {
    for (const url of failed.splice(0)) {
      const again = await page.request.get(url)
      if (!again.ok()) problems.push(`${again.status()} GET ${url}`)
    }
    return problems.splice(0)
  }
  return { take }
}

/* where the films of a run are kept */
const VIDEOS = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'videos')

/* a recording shows no pointer of its own: a dot that follows it, and darkens while a button is down */
const pointerDot = () => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div')
    dot.style.cssText =
      'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,0,0,.45);pointer-events:none;left:0;top:0'
    document.body.append(dot)
    addEventListener(
      'mousemove',
      (e) => Object.assign(dot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }),
      true
    )
    addEventListener('mousedown', () => (dot.style.background = 'rgba(255,0,0,.9)'), true)
    addEventListener('mouseup', () => (dot.style.background = 'rgba(255,0,0,.45)'), true)
  })
}

export { dropFiles, pointerDot, VIDEOS, watch }
