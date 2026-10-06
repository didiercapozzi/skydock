import { describe, expect, test } from 'vitest'
import { eventually, folders, rowOf } from './c1-helpers'
import { harness } from './harness'

/* Every folder of the board has its own address, and so has a file opened in it (RULES, The board): a page
   reloaded comes back where it was, the back button walks the folders and clips looked at, and how a
   folder is looked at travels with its address. The one address typed is the one the app starts on, and,
   in the last chapter, one nobody recognises. */

const j = harness({ name: 'c1-addresses', state: 'sorted' })
const { see, quiet } = j

const MIDDLE = 'DJI_20260905100240_0002_D.MP4'
const fresh = () => folders(j).getByRole('link', { name: /Fresh files/ })
const sion = () => folders(j).getByRole('link', { name: /Sion/ })
const preview = () => j.page.getByRole('dialog', { name: 'Preview' })
const here = () => new URL(j.page.url())

describe('the address of a folder', () => {
  test('is a link in the menu, so picking one is going there, and a folder reloaded comes back as the same place', async () => {
    await j.open()
    await see('Jump 2')
    expect(await fresh().getAttribute('href')).toBe('/fresh')
    expect(await sion().getAttribute('href')).toBe('/dropzone/Sion')
    expect(await folders(j).getByRole('link', { name: 'Bin' }).getAttribute('href')).toBe('/bin')

    await sion().click()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    expect(here().pathname).toBe('/dropzone/Sion')
    await j.page.reload()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    expect(here().pathname).toBe('/dropzone/Sion')
    expect(await sion().getAttribute('aria-current')).toBe('page')
    await rowOf(j, MIDDLE).waitFor()

    await folders(j).getByRole('link', { name: 'Bin' }).click()
    await j.page.getByRole('heading', { name: 'Bin', level: 1 }).waitFor()
    await j.page.reload()
    await j.page.getByRole('heading', { name: 'Bin', level: 1 }).waitFor()
    expect(here().pathname).toBe('/bin')

    await fresh().click()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    await j.page.reload()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    expect(here().pathname).toBe('/fresh')
    await quiet()
  })

  test('is reached by the back button, which walks the folders and the clips looked at', async () => {
    await sion().click()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    await rowOf(j, MIDDLE).dblclick()
    await preview().waitFor()
    expect(here().pathname).toMatch(/^\/dropzone\/Sion\/file\/./)

    await j.page.goBack()
    await preview().waitFor({ state: 'hidden' })
    expect(here().pathname).toBe('/dropzone/Sion')
    await j.page.goBack()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    expect(here().pathname).toBe('/fresh')
    await j.page.goForward()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    await quiet()
  })
})

describe('the address of a file opened in a folder', () => {
  test('is that clip open in its folder, which comes back from a reload, and which Escape closes, leaving the folder open', async () => {
    await rowOf(j, MIDDLE).dblclick()
    await preview().waitFor()
    await preview().getByText(MIDDLE).first().waitFor()
    const address = here().pathname
    expect(address).toMatch(/^\/dropzone\/Sion\/file\/./)

    await j.page.reload()
    await preview().waitFor()
    await preview().getByText(MIDDLE).first().waitFor()
    expect(here().pathname, 'the same clip, in the same folder').toBe(address)
    await rowOf(j, MIDDLE).waitFor()

    await j.page.keyboard.press('Escape')
    await preview().waitFor({ state: 'hidden' })
    expect(here().pathname).toBe('/dropzone/Sion')
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    await quiet()
  })

  test('says nothing of a trim nobody saved, which is somewhere not worth coming back to', async () => {
    await rowOf(j, MIDDLE).dblclick()
    await preview().waitFor()
    const before = j.page.url()
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await preview().getByRole('button', { name: 'Start here' }).click()
    expect(j.page.url(), 'a trim being decided is in no address').toBe(before)

    await j.page.reload()
    await preview().waitFor()
    await j.page.keyboard.press('Escape')
    await preview().waitFor({ state: 'hidden' })
    expect(await rowOf(j, MIDDLE).textContent(), 'nothing was saved').not.toMatch(/trim/)
    await quiet()
  })
})

describe('how a folder is looked at', () => {
  test('travels with its address: what is typed in the box and which jump card is open come back from a reload', async () => {
    await fresh().click()
    await j.page.getByRole('button', { name: /^Jump 1, / }).click()
    await j.page.getByRole('region', { name: 'Jump 1' }).waitFor()
    await j.page.reload()
    await j.page.getByRole('region', { name: 'Jump 1' }).waitFor()
    expect(
      await j.page.getByRole('button', { name: /^Jump 1, / }).getAttribute('aria-pressed')
    ).toBe('true')

    await j.page.getByRole('button', { name: 'Search' }).click()
    await j.page.getByRole('textbox', { name: 'Find a file' }).fill('0006')
    await eventually(() => decodeURIComponent(here().search)).toContain('0006')
    await j.page.reload()
    expect(await j.page.getByRole('textbox', { name: 'Find a file' }).inputValue()).toBe('0006')
    await j.page.getByRole('button', { name: /^Jump 2, / }).waitFor()
    expect(
      await j.page.getByRole('button', { name: /^Jump 1, / }).count(),
      'only what matches is drawn, as before the reload'
    ).toBe(0)
    await j.page.getByRole('textbox', { name: 'Find a file' }).fill('')
    await quiet()
  })

  test('opens the fresh files for an address nobody recognises, rather than nothing', async () => {
    await j.open('/nowhere/at-all')
    await j.page.getByRole('heading', { name: 'Fresh files', level: 1 }).waitFor()
    await j.page.getByRole('button', { name: /^Jump 2, / }).waitFor()
    await quiet()
  })
})
