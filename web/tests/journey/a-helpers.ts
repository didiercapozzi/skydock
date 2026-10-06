import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from 'playwright'
import { expect } from 'vitest'
import { z } from 'zod'
import type { World } from './app'
import { makeClip, makeOwnPhoto } from './media'
import { watch } from './page'

/* What chapters about getting footage in share: a camera card that is plugged in and taken out, and a folder
   let go of over the board. */

/* A camera is a mount with a DCIM folder at its top, found where the app is told cameras turn up. The
   card is a folder of the run bound onto itself, which makes it a mount to the machine as a real card is;
   it is plugged in by mounting it and taken out by unmounting it, while the app runs. Where the machine does not let a
   test mount, no chapter can plug a card in. */
const CARDS = (world: World) => path.join(world.root, 'cameras')

/* where a desktop hands over a camera that is not a drive: the folder of the run standing for the user's own */
const HANDED = (world: World) => path.join(world.root, 'run', 'gvfs')

/* a card needs no id of its own: it is told apart by its name, as a card is where the machine keeps no list of ids */
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

/* what a camera holds: clips and photos under DCIM, a small preview copy and a Mac's `._` file beside the clip,
   which are not media */
const fillCard = (card: string, clips: readonly CardFile[], photos: readonly CardFile[] = []) => {
  const folder = path.join(card, 'DCIM', '100MEDIA')
  fs.mkdirSync(folder, { recursive: true })
  for (const { name, when, seconds } of clips) makeClip(path.join(folder, name), when, seconds ?? 2)
  for (const [n, { name, when }] of photos.entries())
    makeOwnPhoto(path.join(folder, name), when, 50 + n)
  for (const { name } of clips) {
    fs.writeFileSync(path.join(folder, name.replace(/\.MP4$/, '.LRF')), 'a small preview copy')
    fs.writeFileSync(path.join(folder, `._${name}`), 'what a Mac leaves')
  }
}

const cardFolder = (world: World, name: string) => path.join(CARDS(world), name)

/* plugged in: the folder is made a mount, which is when the machine says a camera is there */
const plugIn = (folder: string) => execFileSync('mount', ['--bind', folder, folder])

/* taken out */
const unplug = (folder: string) => {
  try {
    execFileSync('umount', ['-l', folder], { stdio: 'ignore' })
  } catch {
    /* not plugged in */
  }
}

/* everything of the run taken out, before its folders are removed with the rest of the world */
const unplugAll = (world: World) => {
  for (const name of fs.existsSync(CARDS(world)) ? fs.readdirSync(CARDS(world)) : [])
    unplug(cardFolder(world, name))
  unplug(HANDED(world))
}

/* A folder is let go of over the board. The browser hands a page a folder as an entry it opens a level at a
   time; a headless one has no desktop to take it from, so the same kind of entry is made of a folder of the
   disk and handed over with the drop — the page reads it with the calls it makes of any dropped folder. */
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
                /* a folder is read until it answers with nothing */
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
    /* the drag carries the folder as an item that is a file by kind, named after the folder */
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

/* what the board's corner lists while files are being copied: a record of every change to a panel whose name
   begins with `label`, from which to read what was said first — the whole list before the first file landed */
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

/* the panel as it was each time it changed */
const panelsSeen = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as { __panels?: string[] }).__panels ?? [])).map(
    (seen) => panelSchema.parse(JSON.parse(seen))
  )

/* The silent-break check of a page that lists a camera's files, but for the small picture of each file, which
   the server does not find: it looks for it among the work folder's files, and a card is not one. Every other
   failed request and every console error still counts. */
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
  cardFolder,
  dropFolder,
  fillCard,
  HANDED,
  panelsSeen,
  plugIn,
  recordPanels,
  unplug,
  unplugAll
}
