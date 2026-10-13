import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { EmailDialog } from '../../app/components/email-dialog'
import { cleanEmailHtml } from '../../app/helpers/emailHtml'
import { setEmailTemplate } from '../../app/hooks/useEmailTemplate'
import { setSignature } from '../../app/hooks/useSignature'
import { DEFAULT_TEMPLATE } from '@skydock/scripts'


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
  setEmailTemplate('fr', DEFAULT_TEMPLATE)
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
const part = (which: 'kicker' | 'subject' | 'body' | 'signature') =>
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

  test('keeps the button and the link out of reach', async () => {
    await open()
    const editable = [...preview().element().querySelectorAll('[contenteditable="true"]')]

    expect(editable.map((node) => node.getAttribute('data-edit'))).toEqual([
      'kicker',
      'subject',
      'body',
      'signature'
    ])
    await expect.element(preview().getByText('Voir et télécharger')).toBeVisible()
  })

  test('has its heading written in place, and the Subject field follows it', async () => {
    catchClipboard()
    await open()

    await userEvent.click(part('subject'))
    await userEvent.keyboard('{Control>}{End}{/Control} — pour toi')

    await expect
      .element(page.getByLabelText('Subject'))
      .toHaveValue('Ta vidéo et tes photos de ton saut en montage — pour toi')
    expect(await copyEmail()).toContain('Ta vidéo et tes photos de ton saut en montage — pour toi')
  })

  test('has the line above its heading written in place, and copied as written', async () => {
    catchClipboard()
    await open()
    await expect.poll(() => part('kicker').textContent).toBe('Saut en montage')

    await userEvent.click(part('kicker'))
    await userEvent.keyboard('{Control>}a{/Control}Colombier Skydive')

    expect(await copyEmail()).toContain('Colombier Skydive')
    expect(part('subject').textContent).toBe('Ta vidéo et tes photos de ton saut en montage')
  })

  test('has its heading follow the Subject field', async () => {
    await open()

    await userEvent.fill(page.getByLabelText('Subject'), 'Ton film')

    await expect.poll(() => part('subject').textContent).toBe('Ton film')
  })

  test('keeps its heading on one line, whatever is done to it', async () => {
    await open()

    await userEvent.click(part('subject'))
    await userEvent.keyboard('{Control>}{End}{/Control}{Enter}suite')

    expect(part('subject').querySelector('br, div, p')).toBeNull()
    expect(part('subject').textContent).toContain('montagesuite')
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

describe('the language of the email', () => {
  test('is French until another is picked, and the email is drafted again in the one picked', async () => {
    catchClipboard()
    await open()
    await expect.element(preview().getByText('Voir et télécharger')).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'English' }))

    await expect.element(preview().getByText('Watch and download')).toBeVisible()
    expect(await copyEmail()).toContain('Hello Luc,')
  })
})

describe('the greeting of the email', () => {
  test('is by the first word of the name until it is switched off, and the email is drafted again without it', async () => {
    await open()
    await expect.element(preview().getByText('Bonjour Luc,')).toBeVisible()

    await userEvent.click(page.getByRole('checkbox', { name: 'Greet by first name' }))
    expect(part('body').textContent).not.toContain('Bonjour')
    expect(part('body').textContent).toContain('du 1er août 2026 sont prêtes')

    await userEvent.click(page.getByRole('checkbox', { name: 'Greet by first name' }))
    await expect.element(preview().getByText('Bonjour Luc,')).toBeVisible()
  })
})

describe('the link as a QR code', () => {
  test('is shown when asked for, and is a picture of the link', async () => {
    await open()
    await expect.element(page.getByRole('img', { name: 'QR code of the link' })).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'QR code' }))

    await expect.element(page.getByRole('img', { name: 'QR code of the link' })).toBeVisible()
  })
})

describe('the email template', () => {
  test('is written with variables, and drafts the email from them', async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))
    await expect.element(preview().getByText('{prénom}')).toBeVisible()

    await userEvent.fill(page.getByLabelText('Subject — for every email'), 'Salut {prénom}, ton film dure {durée}')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(page.getByLabelText('Subject')).toHaveValue('Salut Luc, ton film dure 3 min 20')
    await expect.element(preview().getByText('Bonjour Luc,')).toBeVisible()
  })

  test('puts a variable in where the caret is', async () => {
    setEmailTemplate('fr', { subject: 's', body: '<p>Merci</p>' })
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))
    await userEvent.click(part('body'))
    await userEvent.keyboard('{Control>}{End}{/Control} ')

    await userEvent.selectOptions(page.getByLabelText('Put in a variable'), 'prénom')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(preview().getByText('Merci Luc')).toBeVisible()
  })

  test('goes back to the first template when asked', async () => {
    setEmailTemplate('fr', { subject: 'autre', body: '<p>autre</p>' })
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))

    await userEvent.click(page.getByRole('button', { name: 'Back to the first template' }))
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(page.getByLabelText('Subject')).toHaveValue('Ta vidéo et tes photos de ton saut en montage')
  })
})

describe('the heading of the template', () => {
  test('is written in place too, and drafts the email from it', async () => {
    await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))

    await userEvent.click(part('subject'))
    await userEvent.keyboard('{Control>}a{/Control}Salut {{prénom}')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))

    await expect.element(page.getByLabelText('Subject')).toHaveValue('Salut Luc')
  })
})

describe('the line above the heading of the template', () => {
  test('is written in the template, and every email is drafted with it', async () => {
    const first = await open()
    await userEvent.click(page.getByRole('button', { name: 'Edit the template…' }))
    await userEvent.click(part('kicker'))
    await userEvent.keyboard('{Control>}a{/Control}Le saut de {{prénom}')
    await userEvent.click(page.getByRole('button', { name: 'Done — back to this email' }))
    await expect.poll(() => part('kicker').textContent).toBe('Le saut de Luc')
    await first.unmount()

    await open()

    await expect.poll(() => part('kicker').textContent).toBe('Le saut de Luc')
  })

  test('is the language’s own when the template has no line above its heading', async () => {
    setEmailTemplate('fr', { subject: 's', body: '<p>Merci</p>' })
    await open()

    await expect.poll(() => part('kicker').textContent).toBe('Saut en montage')
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
