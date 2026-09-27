// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  defaultPassengerEmail,
  gmailComposeUrl,
  htmlOfText,
  mailtoUrl,
  renderPassengerEmail,
  textOfEmailHtml
} from '../src/passengerEmail'

/* The passenger email: written in French, laid out so it arrives the same in every mail program,
   and handed to Gmail as a new message already addressed and titled. */

const LINK = 'https://nas.example/sharing/AbC123'

describe('the passenger email', () => {
  it('greets the passenger by name and says what is ready, on the day of the jump', () => {
    const email = defaultPassengerEmail({
      firstname: 'Luc',
      day: '01.08.2026',
      hasFilm: true,
      photos: 12
    })
    expect(email.subject).toBe('Ta vidéo et tes photos de ton saut en montage')
    expect(email.body).toContain('Bonjour Luc,')
    expect(email.body).toContain('du 1er août 2026 sont prêtes')
  })

  it('puts the link behind one button, and again as text for a client that hides buttons', () => {
    const { html, text } = renderPassengerEmail({
      subject: 'Ta vidéo',
      body: 'Bonjour Luc,\n\nVoici ton film.',
      signature: 'L’équipe',
      shareUrl: LINK
    })
    expect(html.split(LINK)).toHaveLength(4)
    expect(html).toContain('Voir et télécharger')
    expect(text).toContain(`Voir et télécharger : ${LINK}`)
    expect(text).toContain('L’équipe')
  })

  /* pasted into a message, a whole page brings its <title> along as a stray first line */
  it('is copied as the email alone, with no page and no title around it', () => {
    const { fragment } = renderPassengerEmail({
      subject: 'Ta vidéo et tes photos de ton saut en montage',
      body: 'Bonjour Luc,',
      signature: '',
      shareUrl: LINK
    })
    expect(fragment.startsWith('<table')).toBe(true)
    expect(fragment).not.toMatch(/<title|<html|<head|<body/)
    /* the subject is still shown once, as the heading inside the email */
    expect(fragment.split('Ta vidéo et tes photos de ton saut en montage')).toHaveLength(2)
  })

  /* the subject and the link are plain text; the message comes cleaned by the page it is written on */
  it('never lets the subject or the link turn into markup', () => {
    const { html } = renderPassengerEmail({
      subject: '<b>x</b>',
      body: 'a < b',
      signature: '',
      shareUrl: `${LINK}"><img src=x>`
    })
    expect(html).not.toContain('<b>x</b>')
    expect(html).not.toContain('"><img')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('a &lt; b')
  })

  it('gives what was written the email’s own look, and keeps its bold, lists and links', () => {
    const { fragment } = renderPassengerEmail({
      subject: 's',
      body: '<p>Salut <strong>Luc</strong></p><ul><li>un</li></ul><p><a href="https://club.ch">le club</a></p>',
      signature: '<p>L’équipe</p>',
      shareUrl: LINK
    })
    expect(fragment).toContain('<p style="margin:0 0 16px;font-size:16px;')
    expect(fragment).toContain('<strong>Luc</strong>')
    expect(fragment).toMatch(/<ul style="[^"]*padding-left:22px/)
    expect(fragment).toMatch(/<a style="color:#0f6e62;" href="https:\/\/club\.ch">le club<\/a>/)
  })

  it('is written in only where the preview allows, and copied without that', () => {
    const shown = renderPassengerEmail({
      subject: 's',
      body: '<p>x</p>',
      signature: '',
      shareUrl: LINK,
      editable: true
    })
    const copied = renderPassengerEmail({
      subject: 's',
      body: '<p>x</p>',
      signature: '',
      shareUrl: LINK
    })
    expect(shown.fragment.match(/contenteditable/g)).toHaveLength(2)
    expect(copied.fragment).not.toContain('contenteditable')
    expect(copied.fragment).not.toContain('data-edit')
  })

  it('says the same in plain text, lists and links included', () => {
    expect(
      textOfEmailHtml(
        '<p>Salut <strong>Luc</strong>,<br>voici</p><ul><li>un</li><li>deux</li></ul><p><a href="https://club.ch">le club</a> &amp; nous</p>'
      )
    ).toBe('Salut Luc,\nvoici\n\n• un\n• deux\n\nle club (https://club.ch) & nous')
  })

  it('writes a plain draft as paragraphs and line breaks', () => {
    expect(htmlOfText('Bonjour,\n\nligne un\nligne deux')).toBe(
      '<p>Bonjour,</p><p>ligne un<br>ligne deux</p>'
    )
  })
})

describe('the new Gmail message', () => {
  it('is addressed and titled, accents and "+" intact, with the body left for the paste', () => {
    const url = new URL(gmailComposeUrl({ to: 'luc+saut@example.com', subject: 'Ta vidéo' }))
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/')
    expect(url.searchParams.get('view')).toBe('cm')
    expect(url.searchParams.get('to')).toBe('luc+saut@example.com')
    expect(url.searchParams.get('su')).toBe('Ta vidéo')
    expect(url.searchParams.has('body')).toBe(false)
  })

  it('leaves the address out while there is none, for it to be typed in Gmail', () => {
    expect(new URL(gmailComposeUrl({ to: ' ', subject: 's' })).searchParams.has('to')).toBe(false)
  })
})

describe("the new message in the computer's own mail program", () => {
  it('is addressed and titled, accents and spaces in the subject intact', () => {
    const url = mailtoUrl({ to: 'luc@example.com', subject: 'Ta vidéo & tes photos' })
    expect(url.startsWith('mailto:luc@example.com?subject=')).toBe(true)
    expect(decodeURIComponent(url.split('subject=')[1]!)).toBe('Ta vidéo & tes photos')
    /* no body: the laid-out email is pasted in */
    expect(url).not.toContain('body=')
  })

  it('opens unaddressed while there is no address yet', () => {
    expect(mailtoUrl({ to: ' ', subject: 's' })).toBe('mailto:?subject=s')
  })
})
