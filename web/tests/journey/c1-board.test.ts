import * as fs from 'node:fs'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cardsOf, namesListed } from './c1-helpers'
import { harness } from './harness'
import type { Page } from 'playwright'
import {
  addDestination,
  details,
  dialogNamed,
  eventually,
  folders,
  fresh,
  rowOf,
  showDetails,
  sionLink
} from './steps'
import { originalFile } from './media'

/* The everyday screen, from the work folder the story left sorted: the footage found, a destination
   made and its first jump filed. Fresh files holds two jumps and a loose file; Sion holds the three clips
   of the first jump (RULES, The board). */

const j = harness({ name: 'c1-board', state: 'sorted' })
const { see, quiet } = j

/* a person gives up waiting on a button that is not there; so does this, sooner than the default */
beforeAll(() => j.page.setDefaultTimeout(10_000))

const card = (label: RegExp) => j.page.getByRole('button', { name: label })
/* the head of the open folder: its name, the quiet line, the search icon and the menu */
const pane = (name: string) => j.page.getByRole('region', { name, exact: true })

/* whatever a chapter does to the size of the window is undone before the next one */
afterEach(() => j.page.setViewportSize({ width: 1280, height: 800 }))

describe('the panel on the right', () => {
  test('starts away, comes by itself when a jump is opened, and goes and comes back with the icon on the toolbar', async () => {
    await j.open()
    await see('Jump 2')
    expect(await details(j.page).isVisible(), 'a page starts calm, without the panel').toBe(false)

    await card(/^Jump 2, /).click()
    await details(j.page).waitFor()
    await details(j.page).getByRole('heading', { name: 'Jump 2' }).waitFor()

    /* the icon is lit while the panel is there, and puts it away */
    const icon = j.page.getByRole('button', { name: 'Hide details' })
    expect(await icon.getAttribute('aria-pressed')).toBe('true')
    await icon.click()
    await details(j.page).waitFor({ state: 'hidden' })
    await j.page.getByRole('button', { name: 'Details', exact: true }).click()
    await details(j.page).waitFor()
    await j.page.getByRole('button', { name: 'Hide details' }).click()
    await details(j.page).waitFor({ state: 'hidden' })
    await quiet()
  })

  test('is remembered beside the files, so a page opened again keeps it where it was left', async () => {
    /* nothing picked or opened, so only the choice decides */
    await fresh(j.page).click()
    expect(await details(j.page).isVisible()).toBe(false)
    await j.page.getByRole('button', { name: 'Details', exact: true }).click()
    await details(j.page).waitFor()
    await j.page.reload()
    await see('Jump 2')
    await details(j.page).waitFor()

    await j.page.getByRole('button', { name: 'Hide details' }).click()
    await details(j.page).waitFor({ state: 'hidden' })
    await j.page.reload()
    await see('Jump 2')
    expect(await details(j.page).isVisible()).toBe(false)
    await quiet()
  })

  test('folds into a drawer on a window narrower than a laptop, pulled out with the same icon and shut again on the next visit', async () => {
    /* the column is left open beside the files, which says nothing about a drawer */
    await j.page.getByRole('button', { name: 'Details', exact: true }).click()
    await details(j.page).waitFor()
    const visit = async () => {
      const tab = await j.context.newPage()
      await tab.setViewportSize({ width: 900, height: 800 })
      await tab.goto(j.app.url)
      await tab.getByText('Jump 2', { exact: true }).first().waitFor()
      return tab
    }
    const drawerOf = (tab: Page) => tab.getByRole('complementary', { name: 'Details' })

    const first = await visit()
    expect(await drawerOf(first).isVisible(), 'shut until asked for').toBe(false)
    await first.getByRole('button', { name: /^Jump 2, / }).click()
    await first.getByRole('button', { name: 'Details', exact: true }).click()
    await drawerOf(first).waitFor()
    await drawerOf(first).getByRole('button', { name: 'Make a montage…' }).waitFor()
    await first.close()

    const next = await visit()
    expect(await drawerOf(next).isVisible(), 'shut again on the next visit').toBe(false)
    await next.close()

    await j.page.getByRole('button', { name: 'Hide details' }).click()
    await details(j.page).waitFor({ state: 'hidden' })
    await quiet()
  })

  test('is still reached when the window is so narrow that the menu of places becomes a strip across the top', async () => {
    await j.page.setViewportSize({ width: 700, height: 800 })
    await see('Jump 2')
    const menu = (await folders(j.page).boundingBox())!
    expect(menu.width, 'across the top').toBeGreaterThan(menu.height * 3)
    expect(menu.y).toBeLessThan(200)
    await card(/^Jump 2, /).click()
    await j.page.getByRole('button', { name: 'Details', exact: true }).click()
    await details(j.page).getByRole('button', { name: 'Delete jump' }).waitFor()
    await quiet()
  })
})

describe('Fresh files', () => {
  test('is calm: its name, one quiet line, a search icon and a menu, over one card that says where things stand', async () => {
    await j.open()
    await see('Jump 2')
    const here = pane('Fresh files')
    await here.getByRole('heading', { name: 'Fresh files', level: 1 }).waitFor()
    await see('What came off the cameras, waiting to be sorted')
    /* one card in a sentence, and no column headings */
    await here.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    expect(await j.page.getByRole('columnheader').count()).toBe(0)

    /* what is set once is behind the menu */
    await here.getByRole('button', { name: 'More' }).click()
    await here.getByRole('button', { name: 'Reset Fresh files…' }).waitFor()
    await j.page.keyboard.press('Escape')

    /* the box to narrow by name opens when the icon is pressed and stays while something is typed in it */
    await here.getByRole('button', { name: 'Search' }).click()
    const box = here.getByRole('textbox', { name: 'Find a file' })
    await box.fill('GX01')
    await here.getByRole('heading', { name: 'Fresh files', level: 1 }).click()
    await box.waitFor()
    await box.fill('')
    await here.getByRole('heading', { name: 'Fresh files', level: 1 }).click()
    await here.getByRole('button', { name: 'Search' }).waitFor()
    await quiet()
  })

  test('shows its jumps as white cards over the loose files as one more card, and opening it from the menu chooses the loose files', async () => {
    await fresh(j.page).click()
    /* the loose files are the first thing there is to file: their card is the one chosen */
    expect(await card(/^Loose files, /).getAttribute('aria-pressed')).toBe('true')
    expect(await cardsOf(j.page)).toEqual([
      'Loose files, 1 video · 0 photos',
      'Jump 2, 6 September 2026 09:00, 2 videos · 1 photo',
      'Jump 1, 5 September 2026 14:30, 2 videos · 0 photos'
    ])
    /* a single loose file within the gap of nothing offers no grouping */
    expect(await j.page.getByRole('button', { name: /^Group \d+ loose file/ }).count()).toBe(0)
    /* under the cards only the chosen card's files are listed */
    expect(await namesListed(j.page)).toEqual(['GX010001.MP4'])
    await card(/^Jump 1, /).click()
    await eventually(() => namesListed(j.page)).toEqual([
      'DJI_20260905143300_0005_D.MP4',
      'DJI_20260905143000_0004_D.MP4'
    ])
    await quiet()
  })
})

describe('a destination', () => {
  test('is calm: its name, one quiet line, a search icon and a menu, over one card with its count, a bar and the next button', async () => {
    await sionLink(j.page).click()
    const here = pane('Sion')
    await here.getByRole('heading', { name: 'Sion', level: 1 }).waitFor()
    await see('3 files', 15_000)
    const next = here.getByRole('heading', { name: '3 files need processing' })
    await next.waitFor()
    /* how many of the files this machine holds are on the storage */
    await here.getByRole('progressbar', { name: '0 of 3 on the storage' }).waitFor()
    await here.getByRole('button', { name: 'Process 3 files' }).waitFor()
    expect(await j.page.getByRole('columnheader').count()).toBe(0)

    /* what is set once is in the menu */
    await here.getByRole('button', { name: 'More' }).click()
    await here.getByRole('button', { name: 'Choose a folder…' }).waitFor()
    await here.getByRole('button', { name: 'Remove destination…' }).waitFor()
    await j.page.keyboard.press('Escape')

    /* each file a row of its own: its picture, name, time and size */
    const row = rowOf(j.page, 'DJI_20260905100520_0003_D.MP4')
    expect(await row.innerText()).toMatch(/10:05\s*·\s*83 KB/)
    expect(await row.locator('img').count()).toBeGreaterThan(0)
    await quiet()
  })

  test('with no files yet says so, and asks where it should go', async () => {
    await addDestination(j.page, 'Colombier')
    await folders(j.page)
      .getByRole('link', { name: /Colombier/ })
      .click()
    const here = pane('Colombier')
    await here.getByText('No files yet').waitFor()
    await here.getByRole('heading', { name: 'Where should it go?' }).waitFor()
    await here.getByRole('button', { name: 'Choose a folder…' }).first().waitFor()
    await quiet()
  })

  test('cannot be named Montages, in any case, or like a path, and the board says why', async () => {
    for (const name of ['montages', 'MONTAGES', '..', 'a/b']) {
      await j.page.getByRole('button', { name: /Add a destination/ }).click()
      await j.page.getByPlaceholder('New destination').fill(name)
      await j.page.getByRole('button', { name: 'Add', exact: true }).click()
      const refusal = j.page.getByRole('alert').first()
      await refusal.waitFor()
      if (name.toLowerCase() === 'montages')
        expect(await refusal.innerText()).toContain('is where the montages are kept')
      await refusal.getByRole('button', { name: 'Dismiss' }).click()
    }
    expect(await folders(j.page).getByRole('link').allInnerTexts()).toHaveLength(4)
    await quiet()
  })
})

/* the panel's own words: what it says is what the page does not */
const panelText = () => details(j.page).innerText()

describe('the panel on the right says nothing the page already says', () => {
  test('holds, for a destination with nothing selected, only where its files go and taking it off the board', async () => {
    await sionLink(j.page).click()
    await pane('Sion').getByRole('heading', { name: '3 files need processing' }).waitFor()
    await showDetails(j.page)
    const text = await panelText()
    expect(text).toContain('Where its files go')
    expect(text).toContain('Storage folder')
    expect(text).toContain('None chosen yet')
    /* what the page already says is not said again */
    expect(text).not.toMatch(/need processing|Process 3|3 files/)
    const buttons = await details(j.page).getByRole('button').allInnerTexts()
    expect(buttons).toEqual(['Choose…', 'Remove destination…'])
    await quiet()
  })

  test('offers a jump waiting in Fresh files each destination to file it to, then making a montage, its start, and deleting it at the foot', async () => {
    await fresh(j.page).click()
    await card(/^Jump 2, /).click()
    await details(j.page).getByRole('heading', { name: 'Jump 2' }).waitFor()
    const buttons = await details(j.page).getByRole('button').allInnerTexts()
    /* each destination a button, under them the montage; the start's own button says what it corrects */
    expect(buttons.slice(0, 3)).toEqual(['Sion', 'Colombier', 'Make a montage…'])
    expect(buttons[3]).toMatch(/09:00/)
    expect(buttons.slice(4)).toEqual(['Select its 3 files', 'Delete jump'])
    /* the strip of the jump's own files is across the top, above its name */
    const strip = details(j.page).locator('img').first()
    await strip.waitFor()
    const [top, name] = [
      await strip.boundingBox(),
      await details(j.page).getByRole('heading', { name: 'Jump 2' }).boundingBox()
    ]
    expect(top!.y).toBeLessThan(name!.y)
    await quiet()
  })

  test('puts a file picture across the top, then its name, its state, its facts a line each, what can be done with it, and the bin at the foot', async () => {
    await rowOf(j.page, 'DJI_20260906090000_0006_D.MP4').click()
    await details(j.page).getByRole('heading', { name: 'DJI_20260906090000_0006_D.MP4' }).waitFor()
    const text = await panelText()
    expect(text).toMatch(/Shot[\s\S]*Size[\s\S]*Picture/)
    expect(text).toContain('as shot')
    const buttons = await details(j.page).getByRole('button').allInnerTexts()
    const names = buttons.map((b) => b.trim())
    expect(names.indexOf('Trim, frame or turn…')).toBeLessThan(names.indexOf('Move to…'))
    expect(names.at(-1)).toMatch(/^Remove…/)
    const [picture, heading] = [
      await details(j.page).locator('img').first().boundingBox(),
      await details(j.page).getByRole('heading').first().boundingBox()
    ]
    expect(picture!.y).toBeLessThan(heading!.y)
    await quiet()
  })

  test('puts, for a group of picked files, their strip of pictures edge to edge across the top, then how many, their size and the times they span', async () => {
    await rowOf(j.page, 'DJI_20260906090300_0007_D.MP4')
      .getByRole('button', { name: 'Pick', exact: true })
      .click()
    await rowOf(j.page, 'DJI_20260906090000_0006_D.MP4')
      .getByRole('button', { name: 'Pick', exact: true })
      .click()
    await details(j.page).getByRole('heading', { name: '2 files' }).waitFor()
    const text = await panelText()
    expect(text).toMatch(/2 videos · 0 photos/)
    expect(text).toMatch(/Total size[\s\S]*165 KB/)
    expect(text).toMatch(/From[\s\S]*09:00[\s\S]*To[\s\S]*09:03/)
    /* the strip meets both sides of the panel and the toolbar above it, with no margin, border or rounded corner */
    const frame = (await details(j.page).boundingBox())!
    const strip = details(j.page).locator('[data-picture]')
    const edge = (await strip.boundingBox())!
    expect(Math.abs(edge.x - frame.x)).toBeLessThan(2)
    expect(Math.abs(edge.x + edge.width - (frame.x + frame.width))).toBeLessThan(2)
    expect(Math.abs(edge.y - frame.y)).toBeLessThan(2)
    const look = await strip.evaluate((e) => {
      const style = getComputedStyle(e)
      return [style.borderTopWidth, style.borderTopLeftRadius]
    })
    expect(look).toEqual(['0px', '0px'])
    await j.page.keyboard.press('Escape')
    await quiet()
  })
})

describe('the places', () => {
  test('are a menu pinned down the left of Fresh files, destinations, montages and, under Elsewhere, the bin, each with what is left there', async () => {
    await fresh(j.page).click()
    const headings = await folders(j.page)
      .getByRole('heading')
      .evaluateAll((all) => all.map((heading) => heading.textContent))
    expect(headings).toEqual(['Work', 'Destinations', 'Montages', 'Elsewhere'])

    /* the place you are on is the card; each line says its name and what is left there in a few words */
    expect(await fresh(j.page).getAttribute('aria-current')).toBe('page')
    expect(await fresh(j.page).innerText()).toMatch(/Fresh files\s*3 to file/)
    expect(await sionLink(j.page).innerText()).toMatch(/Sion\s*3 to do/)
    expect(await sionLink(j.page).getAttribute('aria-current')).toBeNull()
    await folders(j.page).getByRole('link', { name: 'Bin' }).waitFor()
    /* no montage is done, so there is no such place; no camera has been met */
    expect(
      await folders(j.page)
        .getByRole('link', { name: /Montages done/ })
        .count()
    ).toBe(0)

    await sionLink(j.page).click()
    await eventually(() => sionLink(j.page).getAttribute('aria-current')).toBe('page')
    expect(await fresh(j.page).getAttribute('aria-current')).toBeNull()
    await quiet()
  })

  test('take a jump dropped on the Montages heading by asking its name first, and cancelled, the jump stays where it was', async () => {
    await fresh(j.page).click()
    await card(/^Jump 2, /).dragTo(folders(j.page).getByRole('heading', { name: 'Montages' }))
    const dialog = dialogNamed(j.page, 'Name the montage')
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })

    expect(await cardsOf(j.page)).toHaveLength(3)
    await card(/^Jump 2, /).waitFor()
    /* nothing is made, nothing moved */
    expect(await folders(j.page).getByRole('link').count()).toBe(4)
    await quiet()
  })
})

describe('the jumps of Fresh files, as cards', () => {
  test('are a grid of equal cells, newest first, the loose files first as a dashed card with no day, each jump with its day, what it holds, how far it has got and its pictures', async () => {
    await fresh(j.page).click()
    const [loose, newer, older] = await Promise.all(
      [/^Loose files, /, /^Jump 2, /, /^Jump 1, /].map((label) => card(label).boundingBox())
    )
    /* equal cells: the two jumps are as wide as one another, and the loose files' card is first */
    expect(Math.abs(newer!.width - older!.width)).toBeLessThan(2)
    expect(Math.abs(newer!.height - older!.height)).toBeLessThan(2)
    const before = (a: typeof loose, b: typeof loose) =>
      a!.y < b!.y - 1 || (Math.abs(a!.y - b!.y) < 2 && a!.x < b!.x)
    expect(before(loose, newer)).toBe(true)
    expect(before(newer, older)).toBe(true)

    const looseText = await card(/^Loose files, /).innerText()
    expect(looseText).not.toMatch(/Sept|\d\d:\d\d/)
    expect(await card(/^Loose files, /).evaluate((e) => getComputedStyle(e).borderStyle)).toBe(
      'dashed'
    )
    expect(
      await card(/^Loose files, /)
        .locator('img')
        .count()
    ).toBe(0)

    const jump = card(/^Jump 2, /)
    expect(await jump.innerText()).toMatch(
      /Jump 2\s*Sun 6 Sept · 09:00 · 2 videos, 1 photo\s*to file/
    )
    expect(await jump.locator('img').count()).toBeGreaterThan(0)
    await quiet()
  })

  test('carries its day and the time the jump started, never the time of one file', async () => {
    const text = await card(/^Jump 2, /).innerText()
    expect(text).toMatch(/Sun 6 Sept · 09:00 ·/)
    expect(text).not.toMatch(/09:00\s*[–-]\s*09:03/)
  })

  test('opens one card at a time, lists its files under the cards, and choosing the loose files lets go of the jump', async () => {
    await card(/^Jump 1, /).click()
    expect(await card(/^Jump 1, /).getAttribute('aria-pressed')).toBe('true')
    expect(await card(/^Jump 2, /).getAttribute('aria-pressed')).toBe('false')
    await j.page.getByRole('region', { name: 'Jump 1' }).waitFor()
    await eventually(() => namesListed(j.page)).toEqual([
      'DJI_20260905143300_0005_D.MP4',
      'DJI_20260905143000_0004_D.MP4'
    ])
    await showDetails(j.page)
    await details(j.page).getByRole('heading', { name: 'Jump 1' }).waitFor()

    await card(/^Loose files, /).click()
    await j.page.getByRole('region', { name: 'Loose files' }).waitFor()
    expect(await card(/^Jump 1, /).getAttribute('aria-pressed')).toBe('false')
    await details(j.page).getByRole('heading', { name: 'Jump 1' }).waitFor({ state: 'hidden' })
    await quiet()
  })

  test('takes files dropped on it into that jump whichever day it is on, which keeps its day and start and flags the file off the gap, while the loose card takes nothing', async () => {
    const moved = 'DJI_20260906090000_0006_D.MP4'
    await card(/^Jump 2, /).click()
    await rowOf(j.page, moved).dragTo(card(/^Jump 1, /))
    await expect
      .poll(() => cardsOf(j.page), { timeout: 15_000 })
      .toEqual([
        'Loose files, 1 video · 0 photos',
        'Jump 2, 6 September 2026 09:01, 1 video · 1 photo',
        'Jump 1, 5 September 2026 14:30, 3 videos · 0 photos'
      ])
    /* Jump 2 starts with the run it still has, and Jump 1 keeps the day and the start it had, as the file was brought in
       from elsewhere; it says one of its files is held against the gap rule */
    /* the jump keeps the day and the start it had, and says one of its files is held against the gap rule */
    expect(await card(/^Jump 1, /).innerText()).toMatch(/1 off the gap/)
    await card(/^Jump 1, /).click()
    expect(await rowOf(j.page, moved).textContent()).toMatch(/gap/)

    /* the loose files are in no jump, so they take nothing */
    await rowOf(j.page, moved).dragTo(card(/^Loose files, /))
    expect(await namesListed(j.page)).toContain(moved)
    expect(await card(/^Loose files, /).innerText()).toMatch(/1 file/)

    /* and back where it came from, the jump whole again */
    await rowOf(j.page, moved).dragTo(card(/^Jump 2, /))
    await expect
      .poll(() => cardsOf(j.page), { timeout: 15_000 })
      .toEqual([
        'Loose files, 1 video · 0 photos',
        'Jump 2, 6 September 2026 09:00, 2 videos · 1 photo',
        'Jump 1, 5 September 2026 14:30, 2 videos · 0 photos'
      ])
    expect(await j.page.getByText(/off the gap/).count()).toBe(0)
    await quiet()
  })
})

describe('selecting', () => {
  const NEWEST = 'DJI_20260905100520_0003_D.MP4'
  const MIDDLE = 'DJI_20260905100240_0002_D.MP4'
  const OLDEST = 'DJI_20260905100000_0001_D.MP4'
  const tick = (name: string) => rowOf(j.page, name).getByRole('button', { name: /^(Un)?[Pp]ick$/ })
  const ticked = (within = 'section[aria-label="Sion"]') =>
    j.page.locator(within).locator('[role=button][data-file][aria-selected=true]').count()
  const looked = (name: string) => rowOf(j.page, name).getAttribute('aria-current')

  test('only previews a file on a click: the file shows in the inspector and is marked as the one looked at, and nothing is picked, however many files are picked already', async () => {
    await sionLink(j.page).click()
    await pane('Sion').getByRole('heading', { name: '3 files need processing' }).waitFor()
    await showDetails(j.page)
    await rowOf(j.page, MIDDLE).click()
    await details(j.page).getByRole('heading', { name: MIDDLE }).waitFor()
    expect(await looked(MIDDLE)).toBe('true')
    expect(await ticked()).toBe(0)

    await tick(NEWEST).click()
    await rowOf(j.page, OLDEST).click()
    await details(j.page).getByRole('heading', { name: OLDEST }).waitFor()
    expect(await looked(OLDEST)).toBe('true')
    expect(await looked(MIDDLE)).toBeNull()
    expect(await ticked(), 'the one picked before is still the only one picked').toBe(1)
    await j.page.keyboard.press('Escape')
    await quiet()
  })

  test('picks a file by its tick or by ctrl-click, each of which also takes it back off', async () => {
    await tick(NEWEST).click()
    expect(await ticked()).toBe(1)
    await tick(NEWEST).click()
    expect(await ticked()).toBe(0)

    await rowOf(j.page, MIDDLE).click({ modifiers: ['Control'] })
    expect(await ticked()).toBe(1)
    expect(await rowOf(j.page, MIDDLE).getAttribute('aria-selected')).toBe('true')
    await rowOf(j.page, MIDDLE).click({ modifiers: ['Control'] })
    expect(await ticked()).toBe(0)
    await quiet()
  })

  test('takes a range with shift-click, and with no range started picks that file and starts one', async () => {
    await j.page.keyboard.press('Escape')
    await rowOf(j.page, OLDEST).click({ modifiers: ['Shift'] })
    expect(await ticked()).toBe(1)
    expect(await rowOf(j.page, OLDEST).getAttribute('aria-selected')).toBe('true')
    await rowOf(j.page, NEWEST).click({ modifiers: ['Shift'] })
    expect(await ticked()).toBe(3)
    await details(j.page).getByRole('heading', { name: '3 files' }).waitFor()
    await j.page.keyboard.press('Escape')
    expect(await ticked(), 'Escape clears').toBe(0)
    await details(j.page).getByText('Where its files go').waitFor()
    await quiet()
  })

  test('picks every file on screen that can move with Ctrl-A, and moves the preview with the arrows, adding to the picks with shift', async () => {
    await j.page.keyboard.press('Control+a')
    expect(await ticked()).toBe(3)
    await j.page.keyboard.press('Escape')

    await rowOf(j.page, NEWEST).click()
    await j.page.keyboard.press('ArrowDown')
    await eventually(() => looked(MIDDLE)).toBe('true')
    expect(await ticked(), 'the arrows only move the preview').toBe(0)
    await j.page.keyboard.press('Shift+ArrowDown')
    await eventually(() => rowOf(j.page, OLDEST).getAttribute('aria-selected')).toBe('true')
    await j.page.keyboard.press('Escape')
    await quiet()
  })

  test('shows a tick on every row, and a ring with a tick on what is picked', async () => {
    const tickOf = (name: string) =>
      tick(name).evaluate((button) => Number(getComputedStyle(button).opacity))
    expect(await tickOf(NEWEST)).toBe(1)
    expect(await tickOf(OLDEST)).toBe(1)

    await j.page.getByRole('button', { name: 'Thumbnails' }).click()
    const tiles = j.page.locator('section[aria-label="Sion"] [role=button][data-file]')
    await eventually(() => tiles.count()).toBe(3)
    await tiles.nth(1).getByRole('button', { name: 'Pick', exact: true }).click()
    await tiles.nth(1).getByRole('button', { name: 'Unpick', exact: true }).waitFor()
    expect(await tiles.nth(1).getAttribute('aria-selected')).toBe('true')
    expect(await ticked()).toBe(1)
    await j.page.keyboard.press('Escape')
    expect(await ticked()).toBe(0)
    await j.page.getByRole('button', { name: 'Rows' }).click()
    await quiet()
  })

  test('shows a thumbnail tick at once, as a row does, before anything is picked', async () => {
    await j.page.getByRole('button', { name: 'Thumbnails' }).click()
    const tile = j.page.locator('section[aria-label="Sion"] [role=button][data-file]').first()
    await j.page.mouse.move(0, 400)
    const opacity = await tile
      .getByRole('button', { name: 'Pick', exact: true })
      .evaluate((button) => Number(getComputedStyle(button).opacity))
    expect(opacity).toBe(1)
    await j.page.getByRole('button', { name: 'Rows' }).click()
  })

  test('asks the same question wherever picks are removed, Cancel leaves them where they were, and a file only being looked at is removed by Delete the same way', async () => {
    await tick(NEWEST).click()
    await tick(MIDDLE).click()
    await j.page.keyboard.press('Delete')
    const dialog = dialogNamed(j.page, 'Remove files')
    await dialog.getByRole('heading', { name: 'Remove 2 files from Sion?' }).waitFor()
    await dialog.getByRole('button', { name: 'Loose in Fresh files' }).waitFor()
    await dialog.getByRole('button', { name: 'Put in the bin' }).waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })
    expect(await namesListed(j.page)).toEqual([NEWEST, MIDDLE, OLDEST])
    await j.page.keyboard.press('Escape')

    /* nothing picked: the file being looked at */
    await rowOf(j.page, OLDEST).click()
    await j.page.keyboard.press('Delete')
    await dialog.getByRole('heading', { name: 'Remove 1 file from Sion?' }).waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    /* a file already loose in Fresh files has nowhere further back to go: only the bin is offered */
    await fresh(j.page).click()
    await rowOf(j.page, 'GX010001.MP4').getByRole('button', { name: 'Pick', exact: true }).click()
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await dialog.getByRole('button', { name: 'Put in the bin' }).waitFor()
    expect(await dialog.getByRole('button', { name: 'Loose in Fresh files' }).count()).toBe(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await j.page.keyboard.press('Escape')
    await quiet()
  })
})

describe('showing files', () => {
  const pressed = (name: string) =>
    j.page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')
  const tiles = (within = 'main') => j.page.locator(within).locator('[role=button][data-file]')

  test('shows every file as rows, or as a grid of thumbnails once chosen, for the whole board until the window is closed', async () => {
    await sionLink(j.page).click()
    await eventually(() => namesListed(j.page)).toHaveLength(3)
    expect(await pressed('Rows')).toBe('true')
    expect(await j.page.getByRole('slider', { name: 'Thumbnail size' }).count()).toBe(0)

    await j.page.getByRole('button', { name: 'Thumbnails' }).click()
    await eventually(() => namesListed(j.page)).toHaveLength(0)
    await eventually(() => tiles().count()).toBe(3)
    await j.page.getByRole('slider', { name: 'Thumbnail size' }).waitFor()

    /* the choice holds on every folder, and through a reload of the page */
    await fresh(j.page).click()
    await card(/^Jump 2, /).click()
    await eventually(() => tiles('section[aria-label="Jump 2"]').count()).toBe(3)
    await j.page.reload()
    await see('Jump 2')
    expect(await pressed('Thumbnails')).toBe('true')

    /* a window opened afterwards starts again with rows */
    const next = await j.context.newPage()
    await next.goto(j.app.url)
    await next.getByRole('button', { name: 'Rows', exact: true }).waitFor()
    expect(
      await next.getByRole('button', { name: 'Rows', exact: true }).getAttribute('aria-pressed')
    ).toBe('true')
    await next.close()
    await quiet()
  })

  test('draws thumbnails smaller or bigger with a slider on the toolbar or with Ctrl and the mouse wheel over them, and remembers the size on this machine', async () => {
    const slider = j.page.getByRole('slider', { name: 'Thumbnail size' })
    const width = async () => (await tiles().first().boundingBox())!.width
    const asked = async () =>
      Number(
        /width=(\d+)/.exec((await tiles().first().locator('img').getAttribute('src')) ?? '')?.[1]
      )
    const before = await width()
    const sharp = await asked()
    await slider.focus()
    for (let i = 0; i < 5; i++) await j.page.keyboard.press('ArrowRight')
    await eventually(width).toBeGreaterThan(before)
    /* a bigger thumbnail asks for a sharper picture */
    await eventually(asked).toBeGreaterThan(sharp)

    /* the wheel over the thumbnails with Ctrl held down turns the same size back down */
    const bigger = await width()
    await tiles().first().hover()
    await j.page.keyboard.down('Control')
    for (let i = 0; i < 12; i++) await j.page.mouse.wheel(0, 100)
    await j.page.keyboard.up('Control')
    await eventually(width).toBeLessThan(bigger)

    /* kept for next time, on this machine: another window opens with the size as it was left */
    const kept = await slider.inputValue()
    const next = await j.context.newPage()
    await next.goto(j.app.url)
    const there = next.getByRole('slider', { name: 'Thumbnail size' })
    /* a new window shows rows, so the thumbnails are asked for before the slider is there */
    await next.getByRole('button', { name: 'Thumbnails' }).click()
    expect(await there.inputValue()).toBe(kept)
    await next.close()
    await j.page.getByRole('button', { name: 'Rows' }).click()
    await quiet()
  })

  test('says on every day how many files it holds', async () => {
    await sionLink(j.page).click()
    await pane('Sion')
      .getByText(/Saturday 5 September 2026/)
      .waitFor()
    expect(await pane('Sion').innerText()).toMatch(/3 files/)
  })
})

describe('arranging and finding', () => {
  test('runs every list newest first, the latest shot at the top, and a jump has its own files the same way', async () => {
    await fresh(j.page).click()
    await card(/^Jump 2, /).click()
    await eventually(() => namesListed(j.page)).toEqual([
      'DJI_20260906090300_0007_D.MP4',
      'DJI_20260906090000_0006_D.MP4',
      'DJI_20260906090130_0008_D.JPG'
    ])
    await sionLink(j.page).click()
    await eventually(() => namesListed(j.page)).toEqual([
      'DJI_20260905100520_0003_D.MP4',
      'DJI_20260905100240_0002_D.MP4',
      'DJI_20260905100000_0001_D.MP4'
    ])
    await quiet()
  })

  test('narrows what is drawn by name, so a jump with nothing matching drops out of view, the jumps left keep their numbers, and the menu still counts everything', async () => {
    await fresh(j.page).click()
    await pane('Fresh files').getByRole('button', { name: 'Search' }).click()
    await pane('Fresh files').getByRole('textbox', { name: 'Find a file' }).fill('0006')
    await eventually(() => cardsOf(j.page)).toEqual([
      'Jump 2, 6 September 2026 09:00, 1 video · 0 photos'
    ])
    expect(await fresh(j.page).innerText()).toMatch(/3 to file/)

    await pane('Fresh files').getByRole('textbox', { name: 'Find a file' }).fill('0004')
    await eventually(() => cardsOf(j.page)).toEqual([
      'Jump 1, 5 September 2026 14:30, 1 video · 0 photos'
    ])
    expect(await fresh(j.page).innerText()).toMatch(/3 to file/)

    await pane('Fresh files').getByRole('textbox', { name: 'Find a file' }).fill('')
    await eventually(() => cardsOf(j.page).then((cards) => cards.length)).toBe(3)
    await quiet()
  })

  test('offers no button for the ways of arranging Fresh files, which opens arranged by jump and keeps another way in its address', async () => {
    await fresh(j.page).click()
    for (const way of ['By jump', 'By day', 'One list'])
      expect(await pane('Fresh files').getByRole('button', { name: way }).count()).toBe(0)
  })
})

describe('taking files out of where they are', () => {
  test('sends a file back loose in Fresh files when asked, on its camera time, with the original where it was', async () => {
    const name = 'DJI_20260905100240_0002_D.MP4'
    await sionLink(j.page).click()
    await rowOf(j.page, name).click()
    await j.page.keyboard.press('Delete')
    await j.page.getByRole('button', { name: 'Loose in Fresh files' }).click()
    await eventually(() => namesListed(j.page)).toHaveLength(2)
    expect(
      fs.existsSync(originalFile(j.world, '2026-09-05', name)),
      'copied out of nowhere, moved from nowhere'
    ).toBe(true)

    await fresh(j.page).click()
    await eventually(() => cardsOf(j.page)).toContain('Loose files, 2 videos · 0 photos')
    expect(await namesListed(j.page)).toEqual(['GX010001.MP4', name].sort().reverse())
    await quiet()
  })

  test('chooses no card to begin with when Fresh files has no loose file left, and a file put in the bin leaves the originals', async () => {
    const names = ['GX010001.MP4', 'DJI_20260905100240_0002_D.MP4']
    await card(/^Loose files, /).click()
    for (const name of names)
      await rowOf(j.page, name).getByRole('button', { name: 'Pick', exact: true }).click()
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await j.page.getByRole('button', { name: 'Put in the bin' }).click()
    await eventually(() => cardsOf(j.page).then((cards) => cards.length)).toBe(2)
    expect(
      fs.existsSync(originalFile(j.world, '2026-09-05', names[1]!)),
      'out of the originals'
    ).toBe(false)
    const binned = fs.readdirSync(j.world.trash, { recursive: true }).map(String)
    expect(
      binned.some((entry) => entry.endsWith(names[1]!)),
      'kept in the bin, not erased'
    ).toBe(true)

    await sionLink(j.page).click()
    await fresh(j.page).click()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    const states = await j.page
      .getByRole('button', { name: /^Jump \d+, / })
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-pressed')))
    expect(states, 'no card is chosen to begin with').toEqual(['false', 'false'])
    await quiet()
  })
})
