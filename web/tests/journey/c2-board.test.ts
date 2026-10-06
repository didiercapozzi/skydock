import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { jumpsOf, scan } from './c2-helpers'
import { harness } from './harness'
import { dayFolder, makeClip } from './media'
import { dropFiles } from './page'
import { dialogNamed, folders, place, preview } from './steps'

/* The board's own furniture: the toolbar and the status bar, light and dark, the one line it says after anything,
   its dialogs and the box that finds anything. It starts from the footage found, a destination made and a jump
   filed into it. */

const j = harness({ name: 'c2-board', state: 'sorted', viewport: { width: 1400, height: 1000 } })
const { see, quiet, open } = j
const hint = (name: string | RegExp) => j.page.getByRole('button', { name })

describe('the toolbar and the status bar', () => {
  test('scans from the toolbar, and the footage a camera copy left under the originals is found', async () => {
    await open()
    await see('2 jumps are waiting for a home')
    const when = '2026-09-08T10:00:00'
    const folder = dayFolder(j.world, when)
    makeClip(path.join(folder, 'DJI_20260908100000_0009_D.MP4'), when, 2)
    makeClip(path.join(folder, 'DJI_20260908100100_0010_D.MP4'), '2026-09-08T10:01:00', 2)
    await scan(j.page)
    await see('3 jumps are waiting for a home')
    await expect.poll(() => jumpsOf(j.world).filter((jump) => !jump.destination)).toHaveLength(3)
    await quiet()
  })

  test('shows files as rows or as thumbnails, whichever was chosen last, for the whole board', async () => {
    const rows = hint('Rows')
    const thumbnails = hint('Thumbnails')
    expect(await rows.getAttribute('aria-pressed')).toBe('true')
    expect(await j.page.getByRole('slider', { name: 'Thumbnail size' }).count()).toBe(0)
    await thumbnails.click()
    expect(await thumbnails.getAttribute('aria-pressed')).toBe('true')
    await j.page.getByRole('slider', { name: 'Thumbnail size' }).waitFor()
    await place(j.page, /Sion/).click()
    expect(await thumbnails.getAttribute('aria-pressed'), 'the choice holds in another place').toBe(
      'true'
    )
    await rows.click()
    await j.page.getByRole('slider', { name: 'Thumbnail size' }).waitFor({ state: 'detached' })
    await quiet()
  })

  test('puts what is set once behind Settings, and says in the status bar that the storage is not connected', async () => {
    await j.page.getByRole('button', { name: 'Settings' }).click()
    const settings = j.page.getByRole('group', { name: 'Settings' })
    await settings.getByRole('group', { name: 'Theme' }).waitFor()
    await settings.getByRole('group', { name: 'Language' }).waitFor()
    for (const name of ['Templates…', 'Work folder…', 'History…'])
      await settings.getByRole('button', { name }).waitFor()
    await j.page.getByRole('button', { name: 'Settings' }).click()
    await j.page.getByText('Connect the storage').waitFor()
    await j.page.getByText('Transfers', { exact: true }).waitFor()
    expect(
      await j.page.getByRole('group', { name: 'Size of the board' }).count(),
      'a browser tab draws no zoom control of its own'
    ).toBe(0)
    await quiet()
  })
})

describe('light and dark', () => {
  /* how light the board is drawn: the mean of the red, green and blue of what is behind everything */
  const lightness = async () => {
    const [red, green, blue] = (
      await j.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    )
      .match(/\d+/g)!
      .map(Number)
    return (red! + green! + blue!) / 3
  }
  const theme = () => j.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  const pin = async (name: 'Auto' | 'Light' | 'Dark') => {
    await j.page.getByRole('button', { name: 'Settings' }).click()
    await j.page.getByRole('group', { name: 'Theme' }).getByRole('button', { name }).click()
    await j.page.getByRole('button', { name: 'Settings' }).click()
  }

  test('follows the machine while no choice has been made', async () => {
    await j.page.emulateMedia({ colorScheme: 'dark' })
    expect(await theme()).toBeNull()
    expect(await lightness()).toBeLessThan(60)
    await j.page.emulateMedia({ colorScheme: 'light' })
    expect(await lightness()).toBeGreaterThan(180)
    await quiet()
  })

  test('is pinned light or dark in the app, whatever the machine says', async () => {
    await j.page.emulateMedia({ colorScheme: 'dark' })
    await pin('Light')
    expect(await theme()).toBe('light')
    expect(await lightness(), 'light on a machine that says dark').toBeGreaterThan(180)
    await j.page.emulateMedia({ colorScheme: 'light' })
    await pin('Dark')
    expect(await theme()).toBe('dark')
    expect(await lightness(), 'dark on a machine that says light').toBeLessThan(60)
    await quiet()
  })

  test('keeps the choice on that machine and applies it before the first thing is drawn', async () => {
    await j.page.emulateMedia({ colorScheme: 'light' })
    await j.page.reload({ waitUntil: 'commit' })
    await j.page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'))
    expect(await theme()).toBe('dark')
    expect(await lightness()).toBeLessThan(60)
    await folders(j.page).waitFor()
    await pin('Auto')
    expect(await theme()).toBeNull()
    expect(await lightness(), 'back to what the machine says').toBeGreaterThan(180)
    await quiet()
  })
})

describe('what the board says', () => {
  const notes = () => path.join(j.world.computer, 'notes.txt')

  test('says a refusal as an alert, in the colour of something still owed, and it can be dismissed', async () => {
    fs.writeFileSync(notes(), 'not footage')
    await place(j.page, /Fresh files/).click()
    await dropFiles(j.page, [notes()])
    const alert = j.page.getByRole('alert')
    await alert.getByText('Nothing in that drop is a video or a photo SkyDock can show.').waitFor()
    await alert.getByRole('button', { name: 'Dismiss' }).click()
    await alert.waitFor({ state: 'detached' })
    await quiet()
  })

  test('says news in the app’s own colour, and the next thing done replaces the line', async () => {
    await dropFiles(j.page, [notes()])
    const alert = j.page.getByRole('alert')
    await alert.waitFor()
    const colour = (line: ReturnType<typeof j.page.getByRole>) =>
      line.evaluate((el) => getComputedStyle(el).color)
    const refusal = await colour(alert)

    await j.page.getByRole('button', { name: /^Jump 1,/ }).click()
    await j.page.getByRole('button', { name: 'Make a montage…' }).click()
    await j.page.getByLabel('Name').fill('Ana Test')
    await j.page.getByLabel('Name').press('Enter')
    const news = j.page.getByRole('status').filter({ hasText: 'Made Ana Test’s montage' })
    await news.waitFor()
    await alert.waitFor({ state: 'detached' })
    expect(await colour(news), 'news is not drawn as a refusal is').not.toBe(refusal)
    await news.getByRole('button', { name: 'Dismiss' }).click()
    await news.waitFor({ state: 'detached' })
    await quiet()
  })
})

describe('dialogs', () => {
  const inside = (name: string) =>
    dialogNamed(j.page, name).evaluate((box) => box.contains(document.activeElement))
  const focused = (opener: ReturnType<typeof hint>) =>
    opener.evaluate((el) => el === document.activeElement)
  const fromSettings = async (name: string) => {
    await j.page.getByRole('button', { name: 'Settings' }).click()
    await j.page.getByRole('group', { name: 'Settings' }).getByRole('button', { name }).click()
  }

  /* Escape closes it, as a click beside it does, and the keyboard stays inside while it is open */
  const closesWithEscapeAndOutsideClick = async (name: string, open: () => Promise<void>) => {
    await open()
    await dialogNamed(j.page, name).waitFor()
    expect(await inside(name), 'focus goes into it').toBe(true)
    for (let key = 0; key < 14; key++) {
      await j.page.keyboard.press('Tab')
      expect(await inside(name), 'Tab stays inside').toBe(true)
    }
    await j.page.keyboard.press('Escape')
    await dialogNamed(j.page, name).waitFor({ state: 'detached' })
    await open()
    await dialogNamed(j.page, name).waitFor()
    await j.page.mouse.click(4, 4)
    await dialogNamed(j.page, name).waitFor({ state: 'detached' })
  }

  test('closes the keyboard shortcuts with Escape and with a click outside, and focus goes back to the button that opened it', async () => {
    const opener = hint('Keyboard shortcuts')
    await closesWithEscapeAndOutsideClick('Keyboard shortcuts', () => opener.click())
    expect(await focused(opener)).toBe(true)
    await quiet()
  })

  test('closes the history, the editing templates and the work folder with Escape and with a click outside', async () => {
    await closesWithEscapeAndOutsideClick('History', () => fromSettings('History…'))
    await closesWithEscapeAndOutsideClick('Editing templates', () => fromSettings('Templates…'))
    await closesWithEscapeAndOutsideClick('Work folder', () => fromSettings('Work folder…'))
    await quiet()
  })

  test('closes the question about connecting to the storage with Escape and with a click outside', async () => {
    await closesWithEscapeAndOutsideClick('Connect to the storage', () =>
      hint('Connect the storage').click()
    )
    await quiet()
  })

  test('closes the question about putting files in the bin with Escape and with a click outside, Cancel first and what it does last', async () => {
    await place(j.page, /Fresh files/).click()
    await j.page.getByRole('button', { name: /^Loose files,/ }).click()
    await j.page.getByRole('button', { name: 'Pick', exact: true }).first().click()
    const remove = hint(/Remove…/)
    await closesWithEscapeAndOutsideClick('Remove files', () => remove.click())
    expect(await focused(remove), 'focus goes back where it was').toBe(true)

    await remove.click()
    expect(
      await dialogNamed(j.page, 'Remove files').getByRole('button').allInnerTexts(),
      'files already loose have only the bin left'
    ).toEqual(['Cancel', 'Put in the bin'])
    const bin = dialogNamed(j.page, 'Remove files').getByRole('button', { name: 'Put in the bin' })
    expect(await bin.locator('svg').count(), 'the bin carries its icon').toBe(1)
    await j.page.keyboard.press('Escape')
    await quiet()
  })

  test('closes the question about taking a destination off the board with Escape and with a click outside, the red button without an icon', async () => {
    await place(j.page, /Sion/).click()
    const remove = hint('Remove destination…')
    await closesWithEscapeAndOutsideClick('Remove a destination', () => remove.click())
    await remove.click()
    const names = await dialogNamed(j.page, 'Remove a destination')
      .getByRole('button')
      .allInnerTexts()
    expect(names).toEqual(['Cancel', 'Remove Sion'])
    const last = dialogNamed(j.page, 'Remove a destination').getByRole('button', {
      name: 'Remove Sion'
    })
    expect(await last.locator('svg').count()).toBe(0)
    const [red, green, blue] = (await last.evaluate((el) => getComputedStyle(el).color))
      .match(/\d+/g)!
      .map(Number)
    expect(red! > green! + 40 && red! > blue! + 40, 'what lets go of something is red').toBe(true)
    await j.page.keyboard.press('Escape')
    await quiet()
  })

  test('closes the question about resetting Fresh files and the one asking a montage’s name with Escape and with a click outside', async () => {
    await place(j.page, /Fresh files/).click()
    await closesWithEscapeAndOutsideClick('Reset Fresh files', async () => {
      await hint('More').click()
      await hint('Reset Fresh files…').click()
    })
    await j.page.getByRole('button', { name: /^Loose files,/ }).click()
    await j.page.getByRole('button', { name: 'Pick', exact: true }).first().click()
    await closesWithEscapeAndOutsideClick('Name the montage', async () => {
      await hint('Move to…').click()
      await j.page.getByRole('button', { name: 'A new montage…' }).click()
    })
    await quiet()
  })
})

describe('finding anything', () => {
  const box = () => j.page.getByRole('searchbox', { name: 'Find anything' })
  const found = () => j.page.getByRole('list', { name: 'Found' })
  const pane = (name: string) => j.page.getByRole('region', { name })
  const ask = async (query: string) => {
    await j.page.keyboard.press('Control+f')
    await box().fill(query)
  }

  test('goes to the box on Ctrl F and finds a destination, a montage or a file by a piece of its name, saying where each is', async () => {
    await j.page.keyboard.press('Control+f')
    expect(
      await box().evaluate((el) => el === document.activeElement),
      'Ctrl F goes to the box'
    ).toBe(true)
    await box().fill('sio')
    await found()
      .getByRole('button', { name: /Sion\s*Destination/ })
      .waitFor()
    await box().fill('ana')
    await found()
      .getByRole('button', { name: /Ana Test\s*Montage/ })
      .waitFor()
    await box().fill('gx01')
    await found()
      .getByRole('button', { name: /GX010001\.MP4\s*Fresh files/ })
      .waitFor()
    await quiet()
  })

  test('says so when nothing has that piece of a name, and looks only from two letters on', async () => {
    await box().fill('zzz')
    await found().getByText('Nothing by that name').waitFor()
    await box().fill('s')
    await found().waitFor({ state: 'detached' })
    await quiet()
  })

  test('goes to the first place found on Enter', async () => {
    await ask('sio')
    await found().waitFor()
    await box().press('Enter')
    await pane('Sion').waitFor()
    expect(await box().inputValue(), 'the box is empty again').toBe('')
    await quiet()
  })

  test('goes to whichever place found is clicked: a montage, or a file opened where it is', async () => {
    await ask('ana')
    await found()
      .getByRole('button', { name: /Ana Test/ })
      .click()
    await pane('Ana Test').first().waitFor()
    await ask('gx01')
    await found()
      .getByRole('button', { name: /GX010001/ })
      .click()
    const shown = preview(j.page)
    await shown.getByText('GX010001.MP4').first().waitFor()
    await j.page.keyboard.press('Escape')
    await shown.waitFor({ state: 'detached' })
    await quiet()
  })
})
