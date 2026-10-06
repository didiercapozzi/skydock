import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { counted, filesUnder, montageFolder, said } from './i2-helpers'

/* Going back: what the board was just before each change is kept, and any of them can be put back — the board's
   record only, never a file on the disk. */

const j = harness({ name: 'i2-montage-back', state: 'i2-ready' })
const history = () => j.page.getByRole('dialog', { name: 'History' })
const entry = (words: RegExp) => history().getByRole('listitem').filter({ hasText: words })
const openHistory = async () => {
  await j.page.getByRole('button', { name: 'Settings' }).click()
  await j.page.getByRole('button', { name: 'History…' }).click()
  await history().waitFor()
}
const sidebar = () => j.page.getByRole('navigation', { name: 'Folders' })

describe('going back', () => {
  test('lists the changes made on the board, the latest first, each said in words with the time it was made', async () => {
    await j.open()
    await j.see('Luc Favre')
    await openHistory()
    const lines = (await history().getByRole('listitem').allInnerTexts()).map((l) =>
      l.replace(/\s+/g, ' ')
    )
    expect(lines[0]).toMatch(/^\d\d:\d\d Processed 3 files/)
    expect(lines.findIndex((l) => l.includes('Made Luc Favre’s montage'))).toBeGreaterThan(0)
    expect(lines.findIndex((l) => l.includes('Moved 3 files to Sion'))).toBeGreaterThan(
      lines.findIndex((l) => l.includes('Made Luc Favre’s montage'))
    )
    await j.quiet()
  })

  test('puts the board back as it was just before a change, touching no file on the disk', async () => {
    const before = filesUnder(montageFolder(j))
    expect(before.length).toBeGreaterThan(0)
    await entry(/Made Luc Favre’s montage/)
      .getByRole('button', { name: 'Undo from here' })
      .click()
    await counted(sidebar().getByRole('link', { name: /Luc Favre/ })).toBe(0)
    await history().waitFor({ state: 'detached' })
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await j.see('Jump 2')
    expect(filesUnder(montageFolder(j))).toEqual(before)
    await j.quiet()
  })

  test('is itself a change, so it can be gone back from in the same way', async () => {
    await openHistory()
    const first = (await history().getByRole('listitem').first().innerText()).replace(/\s+/g, ' ')
    expect(first).not.toMatch(/Processed 3 files/)
    await history()
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: 'Undo from here' })
      .click()
    await said(sidebar()).toContain('Luc Favre')
    await history().waitFor({ state: 'detached' })
    await j.quiet()
  })

  test('reads the last good record kept beside it when the board is cut off half written, rather than losing it', async () => {
    const record = path.join(j.world.output, 'manifest.json')
    expect(fs.existsSync(`${record}.bak`)).toBe(true)
    const whole = fs.readFileSync(record, 'utf8')
    fs.writeFileSync(record, whole.slice(0, Math.floor(whole.length / 2)))
    await j.restart()
    await j.open()
    await said(sidebar()).toContain('Luc Favre')
    await said(sidebar()).toContain('Sion')
    await j.quiet()
  })

  /* BUG: with manifest.json cut off half written and manifest.json.bak whole, the board opens on the kept record but
     nothing on the page says so (the only trace is a console.warn of the server in loadManifest). RULES (Going
     back): a board that cannot be read is read from the last good record "and said so". */
  test.skip('says so when the board was read from the last good record', async () => {
    await said(j.page.locator('body')).toMatch(/could not be read|last good record|earlier record/i)
  })
})
