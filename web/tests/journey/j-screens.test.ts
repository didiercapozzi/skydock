import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { checkScreen, pinTheme } from './shots'
import { place } from './steps'

/* One picture of each page, in light and in dark, against the one kept when it was last known to be right:
   the places, a jump chosen with its panel, a destination with its files ready, the bin, the keyboard
   shortcuts. It is what catches the page that still works but no longer looks like itself. */

const light = harness({ name: 'j-screens-light', state: 'processed' })
const dark = harness({ name: 'j-screens-dark', state: 'processed' })

const walk = async (j: typeof light, theme: 'light' | 'dark') => {
  await pinTheme(j.page, theme)
  await j.open()
  const problems: string[] = []
  const take = async (name: string) => {
    const found = await checkScreen(j.page, `${theme}-${name}`)
    if (found) problems.push(found)
  }
  await j.see(/jumps? (is|are) waiting for a home/)
  /* a page is only still once the small copies are made: the corner and the status bar say so until then */
  await j.page
    .getByText('Making small copies')
    .first()
    .waitFor({ state: 'detached', timeout: 90_000 })
  await take('fresh-files')

  await j.page.getByRole('button', { name: /^Jump 2, / }).click()
  await j.see('Or make it a film')
  await take('a-jump-chosen')

  await place(j.page, /Sion/).click()
  await j.see(/files? (is|are) ready to upload/)
  await take('a-destination')

  await j.page.getByRole('link', { name: 'Bin' }).click()
  await j.see(/bin/i)
  await take('the-bin')

  await j.page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await j.page.getByRole('dialog').waitFor()
  await take('keyboard-shortcuts')
  await j.page.keyboard.press('Escape')
  await j.quiet()
  return problems
}

describe('how the pages look', () => {
  test('every page is drawn as it was when last it was right, in light', async () => {
    expect(await walk(light, 'light')).toEqual([])
  })

  test('every page is drawn as it was when last it was right, in dark', async () => {
    expect(await walk(dark, 'dark')).toEqual([])
  })
})
