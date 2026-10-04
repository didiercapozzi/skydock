type PassengerEmail = {
  subject: string
  body: string
  signature: string
  shareUrl: string
  kicker?: string
  editable?: boolean
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

const htmlOfText = (text: string) =>
  paragraphs(text)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

const asEmailHtml = (value: string) => (value.trim().startsWith('<') ? value : htmlOfText(value))

const unescapeHtml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

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

type EmailFacts = {
  firstname: string
  lastname: string
  day: string
  videos: number
  photos: number
  seconds?: number | null
}

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

type EmailTemplate = { subject: string; body: string; kicker?: string }

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

const fill = (text: string, values: Record<string, string>, as: (value: string) => string) =>
  text.replace(VARIABLE, (whole, name: string) =>
    Object.hasOwn(values, name.trim()) ? as(values[name.trim()] ?? '') : whole
  )

const saysNothing = (line: string, values: Record<string, string>) => {
  const names = [...line.matchAll(VARIABLE)].map((m) => (m[1] ?? '').trim())
  return (
    names.length > 0 && names.every((name) => Object.hasOwn(values, name) && values[name] === '')
  )
}

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

const defaultPassengerEmail = (facts: EmailFacts) => fillEmailTemplate(DEFAULT_TEMPLATE, facts)

const markVariables = (html: string) =>
  html.replace(
    VARIABLE,
    (whole) =>
      `<span style="background:#ffe5e5;color:${ACCENT};border-radius:4px;padding:0 2px;">${whole}</span>`
  )

const styled = (html: string, text: { size: number; line: number; color: string }) => {
  const type = `font-size:${text.size}px;line-height:${text.line};color:${text.color};`
  return html
    .replace(/<p>/g, `<p style="margin:0 0 16px;${type}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 16px;padding-left:22px;${type}">`)
    .replace(/<li>/g, '<li style="margin:0 0 4px;">')
    .replace(/<a href="/g, `<a style="color:${ACCENT};" href="`)
}

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
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
${fragment}
</body></html>`
  const text = [
    textOfEmailHtml(asEmailHtml(body)),
    `${words.button}${lang === 'fr' ? ' :' : ':'} ${shareUrl}`,
    textOfEmailHtml(asEmailHtml(signature))
  ]
    .filter(Boolean)
    .join('\n\n')
  return { html, fragment, text }
}

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
export type { EmailFacts, EmailLanguage, EmailTemplate }
