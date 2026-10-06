import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import { harness } from './harness'
import { sendAsUsual } from './i2-helpers'
import { connectStorage, counted, dialogNamed, PASSWORD, said, typed } from './steps'

/* Once the film is on the storage and has its link, whoever it is for is written to: the email drafted from the
   club's template in their language, the link as a QR code, and the mail opened from here, never sent by SkyDock. */

let storage: FakeStorage
const j = harness({
  name: 'i2-montage-link',
  state: 'i2-ready',
  prepare: async () => {
    storage = await startFakeStorage({ password: PASSWORD })
  }
})
afterAll(async () => storage?.stop())

const main = () => j.page.locator('main')
const email = () => dialogNamed(j.page, 'Email the link')
const preview = () => email().getByLabel('Email preview')
const subject = () => email().getByRole('textbox', { name: 'Subject', exact: true })
const language = (name: string) => email().getByRole('button', { name, exact: true })
const linkOf = async () => (await storage.admin.shareLinks())[0]!.url
const LIST = () => path.join(storage.root, 'club', 'skydock-montages.json')
const emailedInList = () => {
  const found = JSON.parse(fs.readFileSync(LIST(), 'utf8')) as {
    montages: { emailed?: { at: number; to?: string } }[]
  }
  return found.montages[0]?.emailed
}
const openEmail = async () => {
  await j.page
    .getByRole('button', { name: /^Email Luc/ })
    .first()
    .click()
  await email().waitFor()
}

describe('sending the link', () => {
  test('is offered once the montage is on the storage with a link, which is the one the upload recorded', async () => {
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.see('Upload…')
    await connectStorage(j.page, storage)
    await sendAsUsual(j.page)
    await j.see('Send Luc the link', 60_000)
    const link = await linkOf()
    await said(j.page.getByRole('complementary')).toContain(link.replace(/^https?:\/\/[^/]+/, '…'))
    await j.quiet()
  })

  test('writes the email already, in French, greeting the first word of the name and saying what is ready and from which day', async () => {
    await openEmail()
    await said(email()).toContain('Luc Favre')
    await typed(subject()).toBe('Ta vidéo et tes photos de ton saut en montage')
    const text = ((await preview().textContent()) ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Saut en montage')
    expect(text).toContain('Bonjour Luc,')
    expect(text).toContain('Ta vidéo et tes photos du 6 septembre 2026 sont prêtes.')
    /* one button to the folder, with the link repeated as text */
    const link = await linkOf()
    expect(
      await preview().getByRole('link', { name: 'Voir et télécharger' }).getAttribute('href')
    ).toBe(link)
    await counted(preview().getByRole('link', { name: link })).toBe(1)
    await j.quiet()
  })

  test("is written in French until another language is picked for it, and is then drafted again from that language's own template", async () => {
    const words = async () => ((await preview().textContent()) ?? '').replace(/\s+/g, ' ')
    await language('English').click()
    await typed(subject()).toMatch(/from your jump$/)
    expect(await words()).toContain('Hello Luc,')
    expect(await words()).toContain('Your jump')
    expect(await words()).toContain('6 September 2026')
    await language('Deutsch').click()
    await typed(subject()).toMatch(/von deinem Sprung$/)
    expect(await words()).toContain('Hallo Luc,')
    expect(await words()).toContain('Dein Sprung')
    await language('Français').click()
    await typed(subject()).toBe('Ta vidéo et tes photos de ton saut en montage')
    await j.quiet()
  })

  test('shows the link as a QR code on request, and puts it away again', async () => {
    const code = email().getByRole('img', { name: 'QR code of the link' })
    await counted(code).toBe(0)
    await email().getByRole('button', { name: 'QR code' }).click()
    await counted(code).toBe(1)
    /* drawn square by square: a code with something in it */
    expect(((await code.locator('path').getAttribute('d')) ?? '').length).toBeGreaterThan(200)
    await said(email()).toContain((await linkOf()).replace(/^https?:\/\//, ''))
    await email().getByRole('button', { name: 'QR code' }).click()
    await counted(code).toBe(0)
    await j.quiet()
  })

  test('takes what is typed in the heading for the Subject field, and the other way round', async () => {
    const heading = preview().locator('[data-edit="subject"]')
    await heading.click()
    await j.page.keyboard.press('End')
    await j.page.keyboard.type(' !')
    await typed(subject()).toBe('Ta vidéo et tes photos de ton saut en montage !')
    await subject().fill('Voici ton film')
    await said(heading).toContain('Voici ton film')
    await j.quiet()
  })

  test("is drafted from the club's template, whose variables are shown as such while it is written and can be put in from a list that says what each would be here", async () => {
    await email().getByRole('button', { name: 'Edit the template…' }).click()
    /* the variables keep their French names in every language */
    await said(preview()).toContain('{prénom}')
    await language('English').click()
    await said(preview()).toContain('{prénom}')
    await language('Français').click()

    /* put in where the caret is, from the list, which says what it would be for this montage */
    const variable = email().getByLabel('Put in a variable')
    const options = await variable.locator('option').allInnerTexts()
    const duration = options.find((option) => option.startsWith('{durée}'))!
    const here = /“(.+)”/.exec(duration)?.[1]
    expect(here).toBeTruthy()
    const lastLine = preview().locator('[data-edit="body"] p').last()
    await lastLine.click()
    await j.page.keyboard.press('End')
    await j.page.keyboard.type(' Ton film dure ')
    await variable.selectOption('durée')
    await said(preview()).toContain('Ton film dure {durée}')

    /* leaving the template drafts this email afresh from it */
    await email().getByRole('button', { name: 'Done — back to this email' }).click()
    const text = ((await preview().textContent()) ?? '').replace(/\s+/g, ' ')
    expect(text).toContain(`Ton film dure ${here}`)
    expect(text).not.toContain('{durée}')
    await j.quiet()
  })

  test('keeps the template on this machine, once per language, and a change to one email never changes it', async () => {
    /* one email written over, then put away: the next is drafted from the template again */
    await preview().locator('[data-edit="body"] p').first().click()
    await j.page.keyboard.press('Home')
    await j.page.keyboard.type('Salut ')
    await said(preview()).toContain('Salut Bonjour Luc,')
    await email().getByRole('button', { name: 'Close' }).click()
    await j.page.reload()
    await openEmail()
    const text = async () => ((await preview().textContent()) ?? '').replace(/\s+/g, ' ')
    expect(await text()).toContain('Bonjour Luc,')
    expect(await text()).not.toContain('Salut')
    expect(await text()).toContain('Ton film dure')

    /* English was never written: it has its own template, as it was first written */
    await language('English').click()
    expect(await text()).not.toContain('Ton film dure')

    /* the first template can be put back at any time */
    await language('Français').click()
    await email().getByRole('button', { name: 'Edit the template…' }).click()
    await email().getByRole('button', { name: 'Back to the first template' }).click()
    await email().getByRole('button', { name: 'Done — back to this email' }).click()
    expect(await text()).not.toContain('Ton film dure')
    await j.quiet()
  })

  test('copies the email laid out and opens a new Gmail message with the address and subject filled in, and sends nothing itself', async () => {
    await j.context.grantPermissions(['clipboard-read', 'clipboard-write'])
    /* the mail site itself is not reached from a test: only where the new window was sent is read */
    await j.context.route('https://mail.google.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>mail</title>' })
    )
    await email().getByRole('textbox', { name: 'To' }).fill('luc@example.com')
    const opened = j.context.waitForEvent('page')
    await email()
      .getByRole('button', { name: /Copy & open Gmail/ })
      .click()
    const popup = await opened
    const address = new URL(popup.url())
    expect(address.origin + address.pathname).toBe('https://mail.google.com/mail/')
    expect(address.searchParams.get('to')).toBe('luc@example.com')
    expect(address.searchParams.get('su')).toBe(await subject().inputValue())
    await popup.close()

    const copied = await j.page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      const read = async (type: string) =>
        item?.types.includes(type) ? await (await item.getType(type)).text() : ''
      return { html: await read('text/html'), text: await read('text/plain') }
    })
    const link = await linkOf()
    expect(copied.html).toContain('Bonjour Luc,')
    expect(copied.html).toContain(`href="${link}"`)
    expect(copied.text).toContain('Bonjour Luc,')
    expect(copied.text).toContain(link)
    /* nothing was sent from here: the storage was not asked for anything of the kind */
    expect((await storage.admin.calls()).filter((call) => /mail|smtp/i.test(call.api))).toEqual([])
    await j.quiet()
  })

  test("asks whether the email was sent in a dialog that cannot be put away, and records Yes on the board and on the storage's list", async () => {
    const asking = dialogNamed(j.page, 'Was the email sent?')
    await asking.waitFor()
    await j.page.keyboard.press('Escape')
    await j.page.mouse.click(4, 4)
    await counted(asking).toBe(1)
    expect(emailedInList()).toBeUndefined()

    await asking.getByRole('button', { name: 'Yes — it was sent' }).click()
    await counted(asking).toBe(0)
    await said(email()).toContain('Sent')
    await said(email()).toContain('to luc@example.com')
    await expect.poll(() => emailedInList()?.to, { timeout: 20_000 }).toBe('luc@example.com')
    await j.quiet()
  })

  test('shows the montage as emailed once it was, and the mark can be undone', async () => {
    await email().getByRole('button', { name: 'Undo' }).click()
    await email()
      .getByRole('button', { name: /mark as sent/i })
      .waitFor()
    await expect.poll(() => emailedInList(), { timeout: 20_000 }).toBeUndefined()
    await email()
      .getByRole('button', { name: /mark as sent/i })
      .click()
    await expect.poll(() => emailedInList()?.to, { timeout: 20_000 }).toBe('luc@example.com')
    await email().getByRole('button', { name: 'Close' }).click()
    await said(main()).toContain('Every step done')
    await j.quiet()
  })

  test('asks nothing more when the montage is marked already, and when it is not, Not sent leaves the montage to email', async () => {
    const asking = dialogNamed(j.page, 'Was the email sent?')
    /* marked already: Copy & open asks nothing */
    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: /Emailed · again/ }).click()
    await email().waitFor()
    await email()
      .getByRole('group', { name: 'Open the message in' })
      .getByRole('button', { name: 'Mail program' })
      .click()
    await email()
      .getByRole('button', { name: /Copy & open my mail app/ })
      .click()
    await counted(asking).toBe(0)
    /* taken back, it is asked again, and Not sent changes nothing */
    await email().getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => emailedInList(), { timeout: 20_000 }).toBeUndefined()
    await email()
      .getByRole('button', { name: /Copy & open my mail app/ })
      .click()
    await asking.waitFor()
    await asking.getByRole('button', { name: 'Not sent' }).click()
    await counted(asking).toBe(0)
    expect(emailedInList()).toBeUndefined()
    await email().getByRole('button', { name: 'Close' }).click()
    await j.see('Send Luc the link')
    await j.quiet()
  })
})
