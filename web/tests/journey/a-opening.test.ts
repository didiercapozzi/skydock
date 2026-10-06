import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { harness } from './harness'
import { CLIPS, dayFolder, makeClip, originalsDir } from './media'
import { dialogNamed, place } from './steps'
import { groupsOf, manifestOf } from './record'

/* Opening SkyDock on a work folder: what it does the first time it sees one, before anyone has pressed a
   thing. The welcome page, the window's own buttons and the update belong to SkyDock's own window, not to a
   browser, and are walked there. */

/* what the page shows, kept from the moment it begins to be drawn: the loader of a first look lasts a blink,
   and a person sees it all the same */
const watchPage = () => {
  const seen: { text: string; buttons: string[] }[] = []
  const note = () => {
    const text = document.body?.innerText ?? ''
    if (seen.at(-1)?.text !== text)
      seen.push({
        text,
        buttons: [...document.querySelectorAll('button')].map((b) => b.textContent ?? '')
      })
  }
  addEventListener('DOMContentLoaded', () => {
    note()
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    })
  })
  ;(window as unknown as { __seen: typeof seen }).__seen = seen
}

const seenSchema = z.array(z.object({ text: z.string(), buttons: z.array(z.string()) }))

describe('a work folder with no record yet, that holds what a camera copy left', () => {
  const j = harness({
    name: 'a-first-look',
    prepare: (world) => {
      for (const [name, when] of CLIPS.slice(0, 3))
        makeClip(path.join(dayFolder(world, when), name), when, 2)
    }
  })

  test('a work folder with no record is looked through the moment the board opens, showing only a loader, and then opens on what was found', async () => {
    expect(fs.existsSync(path.join(j.world.output, 'manifest.json')), 'no record yet').toBe(false)
    await j.context.addInitScript(watchPage)
    await j.open()
    /* nobody pressed Scan: the board is there with the jump the look found */
    await j.see(/3 files in 1 jumps/, 60_000)
    await j.see('Jump 1')

    const shown = seenSchema.parse(
      await j.page.evaluate(() => (window as never as { __seen: unknown }).__seen)
    )
    const loader = shown.filter((s) => s.text.includes('Scanning…'))
    expect(loader.length, 'the loader was on screen').toBeGreaterThan(0)
    for (const s of loader) {
      expect(s.text, 'a loader and nothing else: no board').not.toContain('Fresh files')
      expect(s.text, 'no page of instructions').not.toMatch(/Start|Welcome/)
      expect(s.buttons.filter(Boolean), 'no button to press').toEqual([])
    }

    expect(manifestOf(j.world).files, 'the record was written').toHaveLength(3)
    expect(groupsOf(j.world), 'one jump found in what the copy left').toHaveLength(1)
    expect(fs.readdirSync(path.join(originalsDir(j.world), '2026-09-05'))).toHaveLength(3)
    await j.quiet()
  })

  test('the work folder dialog says where the work is kept, and that another folder is chosen from SkyDock’s own window', async () => {
    await j.page.getByRole('button', { name: 'Settings' }).click()
    await j.page.getByText('Work folder…').click()
    const dialog = dialogNamed(j.page, 'Work folder')
    await dialog.waitFor()
    await dialog.getByText(j.world.output, { exact: true }).waitFor()
    await dialog.getByText(/changed from SkyDock’s own window/).waitFor()
    expect(await dialog.getByRole('button', { name: /Choose another folder/ }).count()).toBe(0)
    await j.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await j.quiet()
  })
})

describe('a work folder nothing has been copied into yet', () => {
  const j = harness({ name: 'a-first-look-empty' })

  test('a work folder nothing has been copied into yet is settled by its first look: the originals folder made, an empty record written, and a board that says there is nothing to sort', async () => {
    await j.open()
    await j.see('Nothing left to sort')
    expect(fs.statSync(originalsDir(j.world)).isDirectory()).toBe(true)
    expect(groupsOf(j.world)).toEqual([])
    expect(manifestOf(j.world).files).toEqual([])
    await j.quiet()
  })
})

describe('a work folder that already holds the work of an earlier SkyDock', () => {
  const j = harness({ name: 'a-opens-on-the-work', state: 'sorted' })

  test('a work folder that holds the work of an earlier SkyDock opens on the work as it was, with no first look through it', async () => {
    const before = fs.readFileSync(path.join(j.world.output, 'manifest.json'), 'utf8')
    await j.context.addInitScript(watchPage)
    await j.open()
    await place(j.page, /Sion/).waitFor()
    const shown = seenSchema.parse(
      await j.page.evaluate(() => (window as never as { __seen: unknown }).__seen)
    )
    expect(
      shown.some((s) => s.text.includes('Scanning…')),
      'no loader: the record was there'
    ).toBe(false)
    expect(fs.readFileSync(path.join(j.world.output, 'manifest.json'), 'utf8')).toBe(before)
    await j.quiet()
  })
})
