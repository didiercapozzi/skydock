import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { EmailDialog } from '../../app/components/email-dialog'
import { cleanEmailHtml } from '../../app/helpers/emailHtml'
import { setEmailTemplate } from '../../app/hooks/useEmailTemplate'
import { setSignature } from '../../app/hooks/useSignature'
import { DEFAULT_TEMPLATE } from '@skydock/scripts'

/* The passenger email is written in the email itself, as it will arrive (RULES, Sending the link):
   typed in place, with bold, italic, lists and links, and whatever is pasted or typed kept to what an
   email carries well. What is copied is what was seen. */

const LINK = 'https://nas.example/sharing/AbC123'
const about = {
  firstname: 'Luc',
  lastname: 'Favre',
  day: '01.08.2026',
  videos: 2,
  photos: 3,
  seconds: 200,
  shareUrl: LINK
}

/* what the copy buttons put on the clipboard, as the laid-out email */
const copied: string[] = []
const catchClipboard = () => {
  copied.length = 0
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: {
      write: async (items: ClipboardItem[]) => {
        for (const item of items) copied.push(await (await item.getType('text/html')).text())
      },
      writeText: async () => undefined
    }
  })
}

beforeEach(() => {
  setEmailTemplate(DEFAULT_TEMPLATE)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const open = () =>
  render(
    createElement(EmailDialog, {
      about,
      canRecord: false,
      onRecord: () => {},
      onClose: () => {}
    })
  )

const preview = () => page.getByLabelText('Email preview')
const part = (which: 'body' | 'signature') =>
  preview().element().querySelector<HTMLElement>(`[data-edit="${which}"]`)!

const copyEmail = async () => {
  await userEvent.click(page.getByRole('button', { name: 'Copy email' }))
  await expect.poll(() => copied.length).toBe(1)
  return copied[0]!
}

describe('writing the passenger email', () => {
  test('is done in the email itself, and what is copied is what was written', async () => {
    catchClipboard()
    await open()

    await userEvent.click(part('body'))
    await userEvent.keyboard('{Control>}{End}{/Control} Et merci encore')

    expect(await copyEmail()).toContain('Et merci encore')
  })

  test('makes the words picked bold', async () => {
    catchClipboard()
    await open()
    const greeting = part('body').querySelector('p')!
    await userEvent.tripleClick(greeting)

    await userEvent.click(page.getByRole('button', { name: 'Bold' }))

    expect(await copyEmail()).toMatch(/<strong>Bonjour Luc,/)
  })

  test('keeps the heading, the button and the link out of reach', async () => {
    await open()
    const editable = [...preview().element().querySelectorAll('[contenteditable="true"]')]

    expect(editable.map((node) => node.getAttribute('data-edit'))).toEqual(['body', 'signature'])
    await expect.element(preview().getByText('Voir et télécharger')).toBeVisible()
    await page.screenshot({ path: './playwright-screenshots/email-editor.png' })
  })

  test('remembers the signature for the next email', async () => {
    setSignature('<p>L’équipe</p>')
    const first = await open()
    await userEvent.click(part('signature'))
    await userEvent.keyboard('{Control>}{End}{/Control} de Colombier')
    await first.unmount()

    await open()

    expect(part('signature').textContent).toContain('L’équipe de Colombier')
  })
})

/* The club's email, written once with its {variables}, drafts every passenger's (RULES, Sending the
   link). */
describe('the email template', () => {
  test('is written with variables, and drafts the email from them', async () => {
    setEmailTemplate(DEFAULT_TEMPLATE)
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))
    await expect.element(preview().getByText('{prénom}')).toBeVisible()

    await userEvent.fill(page.getByLabelText('Subject — for every email'), 'Salut {prénom}, ton film dure {durée}')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(page.getByLabelText('Subject')).toHaveValue('Salut Luc, ton film dure 3 min 20')
    await expect.element(preview().getByText('Bonjour Luc,')).toBeVisible()
  })

  test('puts a variable in where the caret is', async () => {
    setEmailTemplate({ subject: 's', body: '<p>Merci</p>' })
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))
    await userEvent.click(part('body'))
    await userEvent.keyboard('{Control>}{End}{/Control} ')

    await userEvent.selectOptions(page.getByLabelText('Put in a variable'), 'prénom')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(preview().getByText('Merci Luc')).toBeVisible()
  })

  test('goes back to the first template when asked', async () => {
    setEmailTemplate({ subject: 'autre', body: '<p>autre</p>' })
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))

    await userEvent.click(page.getByRole('button', { name: 'Back to the first template' }))
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(page.getByLabelText('Subject')).toHaveValue('Ta vidéo et tes photos de ton saut en montage')
  })
})

describe('what an email keeps of what is pasted or typed', () => {
  test('keeps paragraphs, bold, italic, lists and links, and nothing else', () => {
    expect(
      cleanEmailHtml(
        '<div class="x" style="font-family:Comic"><h1>Titre</h1><span style="color:red">du <b>gras</b> et <i>de l’italique</i></span></div><ul><li>un</li></ul><p><a href="https://club.ch" onclick="x()">le club</a></p>'
      )
    ).toBe(
      '<p>Titre</p><p>du <strong>gras</strong> et <em>de l’italique</em></p><ul><li>un</li></ul><p><a href="https://club.ch">le club</a></p>'
    )
  })

  test('drops a script, and a link that would run something', () => {
    expect(
      cleanEmailHtml('<p>ok<script>alert(1)</script> <a href="javascript:alert(1)">ici</a></p>')
    ).toBe('<p>ok ici</p>')
  })

  test('makes loose text and line breaks paragraphs, leaving out the empty ones', () => {
    expect(cleanEmailHtml('Bonjour<br><p><br></p><div>ligne</div>')).toBe(
      '<p>Bonjour</p><p>ligne</p>'
    )
  })
})
