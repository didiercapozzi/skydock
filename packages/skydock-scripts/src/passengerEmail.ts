/* The email a passenger gets once their montage is on the storage: a few warm lines, one button that
   opens their folder, and nothing to figure out. The same function draws the preview and builds
   what is sent, so what is looked at is exactly what arrives.

   Deliberately free of node imports: the board draws the preview in the browser. */

/* The message and the signature are written in the email itself, and come here as HTML the page
   has already cleaned down to a few tags — p, br, strong, em, ul, ol, li and a with its href, and
   nothing else, no attribute but that href — so they are laid in as they are and only given the
   email's own styles. The subject and the link are plain text and escaped here. */
type PassengerEmail = {
  subject: string
  body: string
  signature: string
  shareUrl: string
  /* for the preview: the message and the signature can be written in, and are marked to be found */
  editable?: boolean
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
]

/* "01.08.2026" → "1er août 2026", the way the date is said in French */
const dayInFrench = (day: string) => {
  const [d, m, y] = day.split('.').map(Number)
  if (!d || !m || !y) return day
  return `${d === 1 ? '1er' : d} ${MONTHS_FR[m - 1]} ${y}`
}

const defaultPassengerEmail = ({
  firstname,
  day,
  hasFilm,
  photos
}: {
  firstname: string
  day: string
  hasFilm: boolean
  photos: number
}) => {
  const what = hasFilm
    ? photos > 0
      ? 'Ta vidéo et tes photos'
      : 'Ta vidéo'
    : photos > 0
      ? 'Tes photos'
      : 'Tes souvenirs'
  const ready = what.startsWith('Ta vidéo') && photos === 0 ? 'est prête' : 'sont prêtes'
  return {
    subject: `${what} de ton saut en montage`,
    body: htmlOfText(
      [
        `Bonjour ${firstname.trim()},`,
        `Merci d’avoir sauté avec nous ! ${what} du ${dayInFrench(day)} ${ready}.`,
        'Tu peux tout regarder et télécharger avec le bouton ci-dessous. Pense à enregistrer tes fichiers : le lien ne reste pas ouvert indéfiniment.',
        'À bientôt dans les airs !'
      ].join('\n\n')
    )
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

/* Plain text as the email's HTML: a paragraph per blank line, a line break per line — how a draft is
   first written, and how a signature kept from before the email could be written in is read. */
const htmlOfText = (text: string) =>
  paragraphs(text)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

/* Already HTML, or plain text still to be made so. */
const asEmailHtml = (value: string) => (value.trim().startsWith('<') ? value : htmlOfText(value))

const unescapeHtml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

/* The email's HTML as plain text, for a mail program that takes only that: paragraphs apart, a line
   per list item, and a link's address beside its words. Read off the few tags cleaned HTML has. */
const textOfEmailHtml = (html: string) =>
  unescapeHtml(
    html
      .replace(/<a href="([^"]*)">(.*?)<\/a>/g, (_, href: string, words: string) =>
        words.replace(/<[^>]+>/g, '') === href ? href : `${words} (${href})`
      )
      .replace(/<br>/g, '\n')
      .replace(/<li>/g, '• ')
      .replace(/<\/li>/g, '\n')
      .replace(/<\/(p|ul|ol)>/g, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const ACCENT = '#0f6e62'
const INK = '#171c22'
const INK_2 = '#545e6b'

/* The email's own look given to cleaned HTML, tag by tag: the only tags it has, and none styled yet. */
const styled = (html: string, text: { size: number; line: number; color: string }) => {
  const type = `font-size:${text.size}px;line-height:${text.line};color:${text.color};`
  return html
    .replace(/<p>/g, `<p style="margin:0 0 16px;${type}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 16px;padding-left:22px;${type}">`)
    .replace(/<li>/g, '<li style="margin:0 0 4px;">')
    .replace(/<a href="/g, `<a style="color:${ACCENT};" href="`)
}

/* Tables and inline styles, because that is what every mail client still draws the same way. */
const renderPassengerEmail = ({ subject, body, signature, shareUrl, editable }: PassengerEmail) => {
  const blocks = styled(asEmailHtml(body), { size: 16, line: 1.55, color: INK })
  const signed = styled(asEmailHtml(signature), { size: 15, line: 1.5, color: INK_2 })
  const writable = (part: string) =>
    editable ? ` data-edit="${part}" contenteditable="true" spellcheck="true"` : ''
  const link = escapeHtml(shareUrl)
  /* The email itself, with nothing around it: this is what is pasted into a message. A whole page
     pasted in brings its <title> along, and the mail program shows it as a stray first line. */
  const fragment = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:32px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(16,24,32,0.08);">
<tr><td style="background:${ACCENT};padding:34px 32px 30px;">
<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Saut en montage</div>
<div style="margin-top:8px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">${escapeHtml(subject)}</div>
</td></tr>
<tr><td style="padding:32px 32px 8px;outline:none;"${writable('body')}>${blocks}</td></tr>
<tr><td align="center" style="padding:8px 32px 28px;">
<a href="${link}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 30px;border-radius:10px;">Voir et télécharger</a>
<div style="margin-top:14px;font-size:12px;line-height:1.5;color:${INK_2};">Le bouton ne marche pas ? Copie ce lien :<br><a href="${link}" style="color:${ACCENT};word-break:break-all;">${link}</a></div>
</td></tr>
<tr><td style="padding:24px 32px 16px;outline:none;"${writable('signature')}>${signed}</td></tr>
</table>
</td></tr>
</table>`
  /* the same, as a page of its own, for the preview */
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
${fragment}
</body></html>`
  const text = [
    textOfEmailHtml(asEmailHtml(body)),
    `Voir et télécharger : ${shareUrl}`,
    textOfEmailHtml(asEmailHtml(signature))
  ]
    .filter(Boolean)
    .join('\n\n')
  return { html, fragment, text }
}

/* A new Gmail message with the address and the subject filled in. The email itself is pasted into
   it from the clipboard, laid out — a link can only carry plain text, and the layout and the button
   are the point. Encoded by hand: a "+" for a space is not read back as one. */
const gmailComposeUrl = ({ to, subject }: { to: string; subject: string }) => {
  const params: [string, string][] = [
    ['view', 'cm'],
    ['fs', '1'],
    ...(to.trim() ? ([['to', to.trim()]] as [string, string][]) : []),
    ['su', subject]
  ]
  return `https://mail.google.com/mail/?${params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`
}

/* The same new message in whatever mail program the computer uses — Outlook, Apple Mail,
   Thunderbird. A mailto link carries no layout either, so the email is pasted in the same way. */
const mailtoUrl = ({ to, subject }: { to: string; subject: string }) =>
  `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}`

export {
  asEmailHtml,
  dayInFrench,
  defaultPassengerEmail,
  gmailComposeUrl,
  htmlOfText,
  mailtoUrl,
  renderPassengerEmail,
  textOfEmailHtml
}
export type { PassengerEmail }
