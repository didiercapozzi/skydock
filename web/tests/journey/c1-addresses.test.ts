import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { eventually, folders, fresh, preview, rowOf, sionLink } from './steps'

/* Every folder of the board has its own address, and so has a file opened in it (RULES, The board): a page
   reloaded comes back where it was, the back button walks the folders and clips looked at, and how a
   folder is looked at travels with its address. The one address typed is the one the app starts on, and,
   in the last chapter, one nobody recognises. */

const j = harness({ name: 'c1-addresses', state: 'sorted' })
const { see, quiet } = j

const MIDDLE = 'DJI_20260905100240_0002_D.MP4'
const here = () => new URL(j.page.url())

describe('the address of a folder', () => {
  test('is a link in the menu, so picking one is going there, and a folder reloaded comes back as the same place', async () => {
    await j.open()
    await see('Jump 2')
    expect(await fresh(j.page).getAttribute('href')).toBe('/fresh')
    expect(await sionLink(j.page).getAttribute('href')).toBe('/dropzone/Sion')
    expect(await folders(j.page).getByRole('link', { name: 'Bin' }).getAttribute('href')).toBe(
      '/bin'
    )

    await sionLink(j.page).click()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    expect(here().pathname).toBe('/dropzone/Sion')
    await j.page.reload()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    expect(here().pathname).toBe('/dropzone/Sion')
    expect(await sionLink(j.page).getAttribute('aria-current')).toBe('page')
    await rowOf(j.page, MIDDLE).waitFor()

    await folders(j.page).getByRole('link', { name: 'Bin' }).click()
    await j.page.getByRole('heading', { name: 'Bin', level: 1 }).waitFor()
    await j.page.reload()
    await j.page.getByRole('heading', { name: 'Bin', level: 1 }).waitFor()
    expect(here().pathname).toBe('/bin')

    await fresh(j.page).click()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    await j.page.reload()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    expect(here().pathname).toBe('/fresh')
    await quiet()
  })

  test('is reached by the back button, which walks the folders and the clips looked at', async () => {
    await sionLink(j.page).click()
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    await rowOf(j.page, MIDDLE).dblclick()
    await preview(j.page).waitFor()
    expect(here().pathname).toMatch(/^\/dropzone\/Sion\/file\/./)

    await j.page.goBack()
    await preview(j.page).waitFor({ state: 'hidden' })
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
    await rowOf(j.page, MIDDLE).dblclick()
    await preview(j.page).waitFor()
    await preview(j.page).getByText(MIDDLE).first().waitFor()
    const address = here().pathname
    expect(address).toMatch(/^\/dropzone\/Sion\/file\/./)

    await j.page.reload()
    await preview(j.page).waitFor()
    await preview(j.page).getByText(MIDDLE).first().waitFor()
    expect(here().pathname, 'the same clip, in the same folder').toBe(address)
    await rowOf(j.page, MIDDLE).waitFor()

    await j.page.keyboard.press('Escape')
    await preview(j.page).waitFor({ state: 'hidden' })
    expect(here().pathname).toBe('/dropzone/Sion')
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    await quiet()
  })

  test('says nothing of a trim nobody saved, which is somewhere not worth coming back to', async () => {
    await rowOf(j.page, MIDDLE).dblclick()
    await preview(j.page).waitFor()
    const before = j.page.url()
    const bar = j.page.locator('[data-crop-bar]')
    await bar.click({ position: { x: (await bar.boundingBox())!.width / 2, y: 10 } })
    await preview(j.page).getByRole('button', { name: 'Start here' }).click()
    expect(j.page.url(), 'a trim being decided is in no address').toBe(before)

    await j.page.reload()
    await preview(j.page).waitFor()
    await j.page.keyboard.press('Escape')
    await preview(j.page).waitFor({ state: 'hidden' })
    expect(await rowOf(j.page, MIDDLE).textContent(), 'nothing was saved').not.toMatch(/trim/)
    await quiet()
  })
})

describe('how a folder is looked at', () => {
  test('travels with its address: what is typed in the box and which jump card is open come back from a reload', async () => {
    await fresh(j.page).click()
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
