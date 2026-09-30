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
  /* the small line above the heading, plain text: the language's own until written otherwise */
  kicker?: string
  /* for the preview: the heading, the message and the signature can be written in, and are marked
     to be found */
  editable?: boolean
  /* the language of what the email says around the club's words */
  lang?: EmailLanguage
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

/* The language of whoever the montage is for: the email a Swiss club sends goes out in French,
   English or German as they speak it, and everything the email says around the club's own words follows —
   the day, what is ready, the button (RULES, Sending the link). The {variables} keep their French
   names in every language: they are what the person writing the template types. */
type EmailLanguage = 'fr' | 'en' | 'de'

const WORDS: Record<
  EmailLanguage,
  {
    months: string[]
    day: (d: number, month: string, y: number) => string
    what: { both: string; film: string; photos: string; none: string }
    ready: { one: string; many: string }
    kicker: string
    button: string
    fallback: string
  }
> = {
  fr: {
    months: MONTHS_FR,
    day: (d, month, y) => `${d === 1 ? '1er' : d} ${month} ${y}`,
    what: {
      both: 'Ta vidéo et tes photos',
      film: 'Ta vidéo',
      photos: 'Tes photos',
      none: 'Tes souvenirs'
    },
    ready: { one: 'est prête', many: 'sont prêtes' },
    kicker: 'Saut en montage',
    button: 'Voir et télécharger',
    fallback: 'Le bouton ne marche pas ? Copie ce lien :'
  },
  en: {
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ],
    day: (d, month, y) => `${d} ${month} ${y}`,
    what: {
      both: 'Your video and photos',
      film: 'Your video',
      photos: 'Your photos',
      none: 'Your memories'
    },
    ready: { one: 'is ready', many: 'are ready' },
    kicker: 'Your jump',
    button: 'Watch and download',
    fallback: 'Button not working? Copy this link:'
  },
  de: {
    months: [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember'
    ],
    day: (d, month, y) => `${d}. ${month} ${y}`,
    what: {
      both: 'Dein Video und deine Fotos',
      film: 'Dein Video',
      photos: 'Deine Fotos',
      none: 'Deine Erinnerungen'
    },
    ready: { one: 'ist bereit', many: 'sind bereit' },
    kicker: 'Dein Sprung',
    button: 'Ansehen und herunterladen',
    fallback: 'Der Knopf geht nicht? Kopiere diesen Link:'
  }
}

/* "01.08.2026" said in words, the way the language says a date */
const dayInWords = (day: string, lang: EmailLanguage) => {
  const [d, m, y] = day.split('.').map(Number)
  const words = WORDS[lang]
  const month = m ? words.months[m - 1] : undefined
  if (!d || !month || !y) return day
  return words.day(d, month, y)
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

const ACCENT = 'rgb(244, 74, 74)'
const INK = '#171c22'
const INK_2 = '#545e6b'

/* What is known of a montage when its email is written: who it is for, the day, and what was made. */
type EmailFacts = {
  firstname: string
  lastname: string
  day: string
  videos: number
  photos: number
  /* how long the film runs, when there is one and it has been measured */
  seconds?: number | null
}

/* A film's length said the way it is said: "3 min 20", or "45 s". */
const lengthInFrench = (seconds: number) => {
  const whole = Math.round(seconds)
  const min = Math.floor(whole / 60)
  const sec = whole % 60
  return min === 0
    ? `${sec} s`
    : sec === 0
      ? `${min} min`
      : `${min} min ${String(sec).padStart(2, '0')}`
}

/* The words a template can ask for, each worked out from the montage it is sent for. Named in French,
   as the email is written: they are what the person writing the template reads and types. One the
   montage has nothing for is empty. */
const EMAIL_VARIABLES = [
  { name: 'prénom', about: 'their first name' },
  { name: 'nom', about: 'their last name' },
  { name: 'montage', about: 'the montage’s name' },
  { name: 'date', about: 'the day of the jump, in words' },
  { name: 'contenu', about: '“Ta vidéo et tes photos”, as there are' },
  { name: 'prêt', about: '“est prête” or “sont prêtes”, agreeing with it' },
  { name: 'vidéos', about: 'how many clips, empty with none' },
  { name: 'photos', about: 'how many photos, empty with none' },
  { name: 'durée', about: 'how long the film runs, empty with no film' }
] as const

type EmailVariable = (typeof EMAIL_VARIABLES)[number]['name']

const variablesOf = (
  facts: EmailFacts,
  lang: EmailLanguage = 'fr'
): Record<EmailVariable, string> => {
  const film = facts.videos > 0
  const words = WORDS[lang]
  const what = film
    ? facts.photos > 0
      ? words.what.both
      : words.what.film
    : facts.photos > 0
      ? words.what.photos
      : words.what.none
  return {
    prénom: facts.firstname.trim(),
    nom: facts.lastname.trim(),
    montage: `${facts.firstname.trim()} ${facts.lastname.trim()}`.trim(),
    date: dayInWords(facts.day, lang),
    contenu: what,
    prêt: film && facts.photos === 0 ? words.ready.one : words.ready.many,
    vidéos: facts.videos > 0 ? String(facts.videos) : '',
    photos: facts.photos > 0 ? String(facts.photos) : '',
    durée: film && facts.seconds ? lengthInFrench(facts.seconds) : ''
  }
}

/* The club's email, written once with the words that change left as {variables}. The message is
   cleaned HTML, as anything written in the email is. The line above the heading is the language's
   own when the template says none — which is how a template written before it could be changed
   still reads. */
type EmailTemplate = { subject: string; body: string; kicker?: string }

/* the line above the heading a template says, or its language's own */
const kickerOf = (template: EmailTemplate, lang: EmailLanguage) =>
  template.kicker ?? WORDS[lang].kicker

const DEFAULT_TEMPLATES: Record<EmailLanguage, EmailTemplate> = {
  fr: {
    kicker: WORDS.fr.kicker,
    subject: '{contenu} de ton saut en montage',
    body: htmlOfText(
      [
        'Bonjour {prénom},',
        'Merci d’avoir sauté avec nous ! {contenu} du {date} {prêt}.',
        'Tu peux tout regarder et télécharger avec le bouton ci-dessous. Pense à enregistrer tes fichiers : le lien ne reste pas ouvert indéfiniment.',
        'À bientôt dans les airs !'
      ].join('\n\n')
    )
  },
  en: {
    kicker: WORDS.en.kicker,
    subject: '{contenu} from your jump',
    body: htmlOfText(
      [
        'Hello {prénom},',
        'Thank you for jumping with us! {contenu} from {date} {prêt}.',
        'You can watch and download everything with the button below. Remember to save your files: the link does not stay open forever.',
        'See you in the sky!'
      ].join('\n\n')
    )
  },
  de: {
    kicker: WORDS.de.kicker,
    subject: '{contenu} von deinem Sprung',
    body: htmlOfText(
      [
        'Hallo {prénom},',
        'Danke, dass du mit uns gesprungen bist! {contenu} vom {date} {prêt}.',
        'Mit dem Knopf unten kannst du alles ansehen und herunterladen. Denk daran, deine Dateien zu speichern: Der Link bleibt nicht für immer offen.',
        'Bis bald in der Luft!'
      ].join('\n\n')
    )
  }
}

const DEFAULT_TEMPLATE = DEFAULT_TEMPLATES.fr

const VARIABLE = /\{([^{}<>]+)\}/g

/* Each {variable} put in, as the montage has it. A name that is no variable is left as it was typed,
   braces and all, so a slip shows in the email rather than vanishing from it. */
const fill = (text: string, values: Record<string, string>, as: (value: string) => string) =>
  text.replace(VARIABLE, (whole, name: string) =>
    Object.hasOwn(values, name.trim()) ? as(values[name.trim()] ?? '') : whole
  )

/* A line only there to say something this montage does not have — every variable in it empty, like
   "Ton film dure {durée}." for photos alone — is left out rather than sent half said. */
const saysNothing = (line: string, values: Record<string, string>) => {
  const names = [...line.matchAll(VARIABLE)].map((m) => (m[1] ?? '').trim())
  return (
    names.length > 0 && names.every((name) => Object.hasOwn(values, name) && values[name] === '')
  )
}

/* The email for one montage, from the template: the line above the heading, the subject and the
   message with every variable put in, and the lines that would say nothing left out. */
const fillEmailTemplate = (
  template: EmailTemplate,
  facts: EmailFacts,
  lang: EmailLanguage = 'fr'
) => {
  const values = variablesOf(facts, lang)
  const body = template.body
    .replace(/<(p|li)>(.*?)<\/\1>/g, (line: string) => (saysNothing(line, values) ? '' : line))
    .replace(/<(ul|ol)><\/\1>/g, '')
  const oneLine = (text: string) =>
    fill(text, values, (v) => v)
      .replace(/\s+/g, ' ')
      .trim()
  return {
    kicker: oneLine(kickerOf(template, lang)),
    subject: oneLine(template.subject),
    body: fill(body, values, escapeHtml)
  }
}

/* the email as it is written for a montage when nobody has written the club's own */
const defaultPassengerEmail = (facts: EmailFacts) => fillEmailTemplate(DEFAULT_TEMPLATE, facts)

/* The variables of a template drawn apart from the words around them, for the template being
   written: there, a {variable} is shown as one, not yet put in. */
const markVariables = (html: string) =>
  html.replace(
    VARIABLE,
    (whole) =>
      `<span style="background:#ffe5e5;color:${ACCENT};border-radius:4px;padding:0 2px;">${whole}</span>`
  )

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
const renderPassengerEmail = ({
  subject,
  body,
  signature,
  shareUrl,
  kicker,
  editable,
  lang = 'fr'
}: PassengerEmail) => {
  const words = WORDS[lang]
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
<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.72);${editable ? 'outline:none;min-height:1.25em;' : ''}"${writable('kicker')}>${escapeHtml(kicker ?? words.kicker)}</div>
<div style="margin-top:8px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;${editable ? 'outline:none;min-height:1.25em;' : ''}"${writable('subject')}>${escapeHtml(subject)}</div>
</td></tr>
<tr><td style="padding:32px 32px 8px;outline:none;"${writable('body')}>${blocks}</td></tr>
<tr><td align="center" style="padding:8px 32px 28px;">
<a href="${link}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 30px;border-radius:10px;">${words.button}</a>
<div style="margin-top:14px;font-size:12px;line-height:1.5;color:${INK_2};">${words.fallback}<br><a href="${link}" style="color:${ACCENT};word-break:break-all;">${link}</a></div>
</td></tr>
<tr><td style="padding:24px 32px 16px;outline:none;"${writable('signature')}>${signed}</td></tr>
</table>
</td></tr>
</table>`
  /* the same, as a page of its own, for the preview */
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
${fragment}
</body></html>`
  const text = [
    textOfEmailHtml(asEmailHtml(body)),
    /* French puts a space before a colon */
    `${words.button}${lang === 'fr' ? ' :' : ':'} ${shareUrl}`,
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
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATES,
  defaultPassengerEmail,
  EMAIL_VARIABLES,
  fillEmailTemplate,
  kickerOf,
  markVariables,
  variablesOf,
  gmailComposeUrl,
  htmlOfText,
  mailtoUrl,
  renderPassengerEmail,
  textOfEmailHtml
}
export type { EmailFacts, EmailLanguage, EmailTemplate, EmailVariable, PassengerEmail }
