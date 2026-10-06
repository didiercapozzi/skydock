import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from 'playwright'
import { expect } from 'vitest'
import { z } from 'zod'
import type { World } from './app'
import { makeClip } from './media'
import { watch } from './page'

const CARDS = (world: World) => path.join(world.root, 'cameras')

const HANDED = (world: World) => path.join(world.root, 'run', 'gvfs')

const cameraEnvironment = (world: World) => ({
  SKYDOCK_CAMERA_ROOTS: [CARDS(world), HANDED(world)].join(path.delimiter),
  SKYDOCK_DISK_IDS: path.join(world.root, 'no-disk-ids'),
  XDG_RUNTIME_DIR: path.join(world.root, 'run')
})

const canMount = (() => {
  const probe = fs.mkdtempSync(
    path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'skydock-mount-')
  )
  try {
    execFileSync('mount', ['--bind', probe, probe], { stdio: 'ignore' })
    execFileSync('umount', [probe], { stdio: 'ignore' })
    return true
  } catch {
    return false
  } finally {
    fs.rmSync(probe, { recursive: true, force: true })
  }
})()

type CardFile = { name: string; when: string; seconds?: number }

const fillCard = (card: string, clips: readonly CardFile[], photos: readonly CardFile[] = []) => {
  const folder = path.join(card, 'DCIM', '100MEDIA')
  fs.mkdirSync(folder, { recursive: true })
  for (const { name, when, seconds } of clips) makeClip(path.join(folder, name), when, seconds ?? 2)
  for (const [n, { name, when }] of photos.entries())
    makeOtherPhoto(path.join(folder, name), when, 50 + n)
  for (const { name } of clips) {
    fs.writeFileSync(path.join(folder, name.replace(/\.MP4$/, '.LRF')), 'a small preview copy')
    fs.writeFileSync(path.join(folder, `._${name}`), 'what a Mac leaves')
  }
}

const makeOtherPhoto = (file: string, when: string, n: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync(process.env.SKYDOCK_FFMPEG_PATH ?? 'ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${200 + n}x150:rate=1`,
    '-frames:v',
    '1',
    file
  ])
  const at = new Date(when)
  fs.utimesSync(file, at, at)
}

const cardOf = (world: World, name: string) => path.join(CARDS(world), name)

const plugIn = (folder: string) => execFileSync('mount', ['--bind', folder, folder])

const unplug = (folder: string) => {
  try {
    execFileSync('umount', ['-l', folder], { stdio: 'ignore' })
  } catch {}
}

const unplugAll = (world: World) => {
  for (const name of fs.existsSync(CARDS(world)) ? fs.readdirSync(CARDS(world)) : [])
    unplug(cardOf(world, name))
  unplug(HANDED(world))
}

type Entry = {
  name: string
  bytes?: number[]
  type?: string
  modified?: number
  children?: Entry[]
}

const entryOf = (at: string): Entry => {
  const stat = fs.statSync(at)
  const name = path.basename(at)
  if (stat.isDirectory())
    return { name, children: fs.readdirSync(at).map((child) => entryOf(path.join(at, child))) }
  return {
    name,
    bytes: [...fs.readFileSync(at)],
    type: /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.mp4$/i.test(name) ? 'video/mp4' : 'text/plain',
    modified: stat.mtimeMs
  }
}

const dropFolder = async (page: Page, folder: string, onto = 'section[aria-label]') => {
  const transfer = await page.evaluateHandle((tree) => {
    type Fake = {
      name: string
      isDirectory: boolean
      isFile: boolean
      createReader?: () => { readEntries: (done: (list: Fake[]) => void) => void }
      file?: (done: (file: File) => void) => void
    }
    const fake = (entry: Entry): Fake =>
      entry.children
        ? {
            name: entry.name,
            isDirectory: true,
            isFile: false,
            createReader: () => {
              let given = false
              return {
                readEntries: (done) => {
                  const list = given ? [] : entry.children!.map(fake)
                  given = true
                  done(list)
                }
              }
            }
          }
        : {
            name: entry.name,
            isDirectory: false,
            isFile: true,
            file: (done) =>
              done(
                new File([new Uint8Array(entry.bytes ?? [])], entry.name, {
                  type: entry.type,
                  lastModified: entry.modified
                })
              )
          }
    const data = new DataTransfer()
    data.items.add(new File([], tree.name))
    const original = DataTransferItem.prototype.webkitGetAsEntry
    DataTransferItem.prototype.webkitGetAsEntry = function () {
      return this.getAsFile()?.name === tree.name
        ? (fake(tree) as unknown as FileSystemEntry)
        : original.call(this)
    }
    return data
  }, entryOf(folder))
  for (const type of ['dragenter', 'dragover', 'drop'])
    await page.locator(onto).first().dispatchEvent(type, { dataTransfer: transfer })
}

const recordPanels = (page: Page, label: string) =>
  page.evaluate((begins) => {
    const w = window as unknown as { __panels?: string[] }
    w.__panels = []
    new MutationObserver(() => {
      const panel = [...document.querySelectorAll('aside')].find((a) =>
        a.getAttribute('aria-label')?.startsWith(begins)
      )
      if (panel)
        w.__panels?.push(
          JSON.stringify({
            rows: [...panel.querySelectorAll('li')].map((li) => li.textContent ?? ''),
            summary: panel.textContent ?? ''
          })
        )
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  }, label)

const panelSchema = z.object({ rows: z.array(z.string()), summary: z.string() })

const panelsSeen = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as { __panels?: string[] }).__panels ?? [])).map(
    (seen) => panelSchema.parse(JSON.parse(seen))
  )

const cardQuiet = (page: Page, world: World) => {
  const seen = watch(page)
  const ofCard = (problem: string) =>
    problem.includes('/api/thumb/') &&
    [`${world.root}/cameras/`, `${world.root}/run/gvfs/`].some((root) => problem.includes(root))
  return async () =>
    expect(
      (await seen.take()).filter((problem) => !ofCard(problem)),
      'nothing went wrong unnoticed'
    ).toEqual([])
}

export {
  cardQuiet,
  cameraEnvironment,
  canMount,
  cardOf,
  dropFolder,
  fillCard,
  makeOtherPhoto,
  HANDED,
  panelsSeen,
  plugIn,
  recordPanels,
  unplug,
  unplugAll
}
