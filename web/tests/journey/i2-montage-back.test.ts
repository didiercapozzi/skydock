import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { filesUnder, montageFolder } from './media'
import { counted, dialogNamed, folders, said } from './steps'

/* Going back: what the board was just before each change is kept, and any of them can be put back — the board's
   record only, never a file on the disk. */

const j = harness({ name: 'i2-montage-back', state: 'i2-ready' })
const history = () => dialogNamed(j.page, 'History')
const entry = (words: RegExp) => history().getByRole('listitem').filter({ hasText: words })
const openHistory = async () => {
  await j.page.getByRole('button', { name: 'Settings' }).click()
  await j.page.getByRole('button', { name: 'History…' }).click()
  await history().waitFor()
}

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
    const before = filesUnder(montageFolder(j.world))
    expect(before.length).toBeGreaterThan(0)
    await entry(/Made Luc Favre’s montage/)
      .getByRole('button', { name: 'Undo from here' })
      .click()
    await counted(folders(j.page).getByRole('link', { name: /Luc Favre/ })).toBe(0)
    await history().waitFor({ state: 'detached' })
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await j.see('Jump 2')
    expect(filesUnder(montageFolder(j.world))).toEqual(before)
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
    await said(folders(j.page)).toContain('Luc Favre')
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
    await said(folders(j.page)).toContain('Luc Favre')
    await said(folders(j.page)).toContain('Sion')
    await j.quiet()
  })

  test('says so when the board was read from the last good record', async () => {
    await said(j.page.locator('body')).toMatch(/could not be read|last good record|earlier record/i)
  })
})
