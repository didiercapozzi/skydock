// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEMPLATES,
  defaultPassengerEmail,
  fillEmailTemplate,
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
      lastname: 'Favre',
      day: '01.08.2026',
      videos: 2,
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
    expect(fragment).toContain(
      '<a style="color:rgb(244, 74, 74);" href="https://club.ch">le club</a>'
    )
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
    expect(shown.fragment.match(/contenteditable/g)).toHaveLength(4)
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

/* The club's email is written once, with {variables} filled from each montage (RULES, Sending the
   link). */
describe('the email template', () => {
  const luc = {
    firstname: 'Luc',
    lastname: 'Favre',
    day: '01.08.2026',
    videos: 2,
    photos: 0,
    seconds: 200
  }

  it('fills every variable from the montage', () => {
    const email = fillEmailTemplate(
      {
        subject: 'Ton saut du {date}',
        body: '<p>{prénom} {nom} — {montage}, {contenu} {prêt}, {vidéos} clips, {durée}</p>'
      },
      luc
    )
    expect(email.subject).toBe('Ton saut du 1er août 2026')
    expect(email.body).toBe('<p>Luc Favre — Luc Favre, Ta vidéo est prête, 2 clips, 3 min 20</p>')
  })

  it('leaves out a line whose variables are all empty for this montage', () => {
    const email = fillEmailTemplate(
      {
        subject: 's',
        body: '<p>Bonjour {prénom},</p><p>Et {photos} photos en plus !</p><ul><li>{photos} photos</li></ul>'
      },
      luc
    )
    expect(email.body).toBe('<p>Bonjour Luc,</p>')
  })

  it('leaves a name that is no variable as it was typed, so the slip shows', () => {
    expect(fillEmailTemplate({ subject: '{prenom}', body: '<p>{prenom}</p>' }, luc)).toMatchObject({
      subject: '{prenom}',
      body: '<p>{prenom}</p>'
    })
  })

  it('never lets a name turn into markup', () => {
    const email = fillEmailTemplate(
      { subject: 's', body: '<p>Bonjour {prénom}</p>' },
      { ...luc, firstname: '<b>Luc</b>' }
    )
    expect(email.body).toBe('<p>Bonjour &lt;b&gt;Luc&lt;/b&gt;</p>')
  })
})

/* The small line above the heading is the club's to write, like the subject, and the language's own
   until it does (RULES, Sending the link). */
describe('the line above the heading', () => {
  const luc = {
    firstname: 'Luc',
    lastname: 'Favre',
    day: '01.08.2026',
    videos: 2,
    photos: 0,
    seconds: 200
  }

  it('is the language’s own until the template says otherwise', () => {
    expect(fillEmailTemplate({ subject: 's', body: '<p>x</p>' }, luc, 'fr').kicker).toBe(
      'Saut en montage'
    )
    expect(fillEmailTemplate({ subject: 's', body: '<p>x</p>' }, luc, 'de').kicker).toBe(
      'Dein Sprung'
    )
  })

  it('is what the template says, its variables filled from the montage', () => {
    const email = fillEmailTemplate(
      { subject: 's', body: '<p>x</p>', kicker: 'Le saut de {prénom}' },
      luc
    )
    expect(email.kicker).toBe('Le saut de Luc')
  })

  it('is drawn above the heading, as written, and never as markup', () => {
    const { fragment } = renderPassengerEmail({
      subject: 's',
      kicker: '<b>Club</b>',
      body: '',
      signature: '',
      shareUrl: LINK
    })
    expect(fragment).toContain('&lt;b&gt;Club&lt;/b&gt;')
    expect(fragment).not.toContain('Saut en montage')
  })

  it('is left empty when the template says none', () => {
    expect(fillEmailTemplate({ subject: 's', body: '<p>x</p>', kicker: '' }, luc).kicker).toBe('')
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

/* The email goes out in the passenger's language — French, English or German — and what it says
   around the club's own words follows (RULES, Sending the link). */
describe('an email in the passenger’s language', () => {
  const facts = { firstname: 'Luc', lastname: 'Favre', day: '01.08.2026', videos: 1, photos: 3 }

  it('says the day, and what is ready, in English', () => {
    const email = fillEmailTemplate(DEFAULT_TEMPLATES.en, facts, 'en')

    expect(email.subject).toBe('Your video and photos from your jump')
    expect(email.body).toContain('Your video and photos from 1 August 2026 are ready.')
  })

  it('says them in German', () => {
    const email = fillEmailTemplate(DEFAULT_TEMPLATES.de, facts, 'de')

    expect(email.body).toContain('vom 1. August 2026 sind bereit.')
  })

  it('draws its button in the language too', () => {
    const { fragment, text } = renderPassengerEmail({
      subject: 's',
      body: '<p>b</p>',
      signature: '',
      shareUrl: 'https://x.test/s',
      lang: 'de'
    })

    expect(fragment).toContain('Ansehen und herunterladen')
    expect(text).toContain('Ansehen und herunterladen: https://x.test/s')
  })
})
