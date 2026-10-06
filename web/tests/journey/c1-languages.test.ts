import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { harness } from './harness'

/* SkyDock speaks English, French and German (RULES, Languages): the one chosen under Settings, kept on
   this machine, and the page drawn again in it at once, from the server as well. What it writes to the disk
   is never translated. Started from the work folder the story left sorted. */

const j = harness({ name: 'c1-languages', state: 'sorted' })
const { quiet } = j
beforeAll(() => j.page.setDefaultTimeout(10_000))
afterEach(() => j.page.keyboard.press('Escape'))

/* the menu of places, whichever language its name is in */
const places = () => j.page.locator('nav')

const settings = () => j.page.getByRole('button', { name: /^(Settings|Réglages|Einstellungen)$/ })
const speak = async (language: 'English' | 'Français' | 'Deutsch') => {
  await settings().click()
  await j.page.getByRole('button', { name: language, exact: true }).click()
  await j.page.waitForLoadState('load')
}
const originals = () =>
  fs
    .readdirSync(path.join(j.world.output, 'original_files'), { recursive: true })
    .map(String)
    .sort()

describe('the language of the app', () => {
  test('is French once chosen under Settings: the page is drawn again in it at once, the places, the cards and the dates with it, and the disk is as it was', async () => {
    await j.open()
    await j.page.getByRole('heading', { name: '2 jumps are waiting for a home' }).waitFor()
    const before = originals()
    await speak('Français')

    await j.page.getByRole('heading', { name: 'Nouveaux fichiers', level: 1 }).waitFor()
    await j.page.getByRole('heading', { name: '2 sauts attendent leur destination' }).waitFor()
    await places()
      .getByRole('link', { name: /Nouveaux fichiers/ })
      .waitFor()
    await places().getByRole('link', { name: 'Corbeille' }).waitFor()
    /* the dates follow the language, and the jump's name — it is the board's, by position — does not */
    const card = j.page.getByRole('button', { name: /^Jump 2, / })
    expect(await card.innerText()).toMatch(/dim\. 6 sept\./)
    expect(await card.getAttribute('aria-label')).toMatch(/6 septembre 2026/)
    expect(await j.page.locator('body').innerText()).not.toContain('waiting for a home')
    /* each language is named in its own language, whichever is spoken */
    await settings().click()
    for (const name of ['English', 'Français', 'Deutsch'])
      await j.page.getByRole('button', { name, exact: true }).waitFor()

    /* what lands on the disk is not translated: the originals, and the folder of the destination, are as they were */
    expect(originals()).toEqual(before)
    await places().getByRole('link', { name: /Sion/ }).waitFor()
    await quiet()
  })

  test('is German once chosen, and kept on this machine, so another window opens in it', async () => {
    await speak('Deutsch')
    await j.page.getByRole('heading', { name: 'Neue Dateien', level: 1 }).waitFor()
    await j.page.getByRole('heading', { name: '2 Sprünge warten auf ihr Ziel' }).waitFor()
    await places().getByRole('link', { name: 'Papierkorb' }).waitFor()

    const next = await j.context.newPage()
    await next.goto(j.app.url)
    await next.getByRole('heading', { name: 'Neue Dateien', level: 1 }).waitFor()
    await next.close()
    await quiet()
  })

  // BUG: RULES.md (Languages) says the page is drawn again in the language "from the server as well, so what
  // the server says comes back in it too", and that every sentence the app shows is there in each language.
  // With German (and French) spoken, adding a destination named "montages" is refused with the English
  // sentence "“montages” is where the montages are kept — give the dropzone another name." Suspect:
  // packages/skydock-scripts/src/workspace.ts, placeNameProblem (the sentences are plain English
  // strings, untranslated).
  test.skip('says what the server says in the language too, a name refused for a destination among it', async () => {
    await j.page.getByRole('button', { name: 'Ziel hinzufügen…' }).click()
    await j.page.getByPlaceholder(/./).last().fill('montages')
    await j.page.keyboard.press('Enter')
    const refusal = j.page.getByRole('alert').first()
    await refusal.waitFor()
    expect(await refusal.innerText(), 'not the sentence in English').not.toContain(
      'is where the montages are kept'
    )
    await quiet()
  })

  test('writes names to the disk in no language but their own: what is handed over is named alike in German', async () => {
    await j.page.getByRole('link', { name: /Sion/ }).click()
    await j.page
      .getByRole('button', { name: /Datei.* verarbeiten|3 Dateien/ })
      .first()
      .click()
    await j.page
      .getByRole('heading', { name: /3 Dateien (sind|können)/ })
      .waitFor({ timeout: 90_000 })
    expect(fs.readdirSync(path.join(j.world.output, 'processed')).sort()).toEqual(['Sion'])
    expect(fs.readdirSync(path.join(j.world.output, 'processed', 'Sion')).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4'
    ])
    await quiet()
  })

  test('is English again when asked, and is first chosen by what the machine asks for until one is chosen, else English', async () => {
    await speak('English')
    await places()
      .getByRole('link', { name: /Fresh files/ })
      .click()
    await j.page.getByRole('heading', { name: 'Fresh files', level: 1 }).waitFor()

    const browser = j.context.browser()!
    const asking = async (locale: string) => {
      const context = await browser.newContext({ locale })
      const tab = await context.newPage()
      await tab.goto(j.app.url)
      const heading = await tab.getByRole('heading', { level: 1 }).first().innerText()
      await context.close()
      return heading
    }
    expect(await asking('de-CH')).toBe('Neue Dateien')
    expect(await asking('fr-FR')).toBe('Nouveaux fichiers')
    /* a language it does not speak is English */
    expect(await asking('es-ES')).toBe('Fresh files')
    await quiet()
  })
})
