import { i18n } from '@lingui/core'
import { z } from 'zod'

/* Which language the app speaks (RULES, Languages): the one chosen in the header, kept in a cookie so
   the server draws the page in it from the first paint; else the first the machine asks for that the
   app speaks — the desktop window asks in the system's language by itself; else English. */

const LANGUAGES = ['en', 'fr', 'de'] as const
const languageSchema = z.enum(LANGUAGES)
type Language = z.infer<typeof languageSchema>

const LANGUAGE_COOKIE = 'skydock.lang'

/* "fr-CH,fr;q=0.9,en;q=0.8" read in the order asked, each by its language alone */
const askedFor = (header: string) =>
  header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().slice(0, 2).toLowerCase() ?? '')
    .flatMap((code) => {
      const known = languageSchema.safeParse(code)
      return known.success ? [known.data] : []
    })

const chosenIn = (cookie: string) => {
  const kept = cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === LANGUAGE_COOKIE)?.[1]
  const known = languageSchema.safeParse(kept)
  return known.success ? known.data : null
}

const languageOf = (request: Request): Language =>
  chosenIn(request.headers.get('Cookie') ?? '') ??
  askedFor(request.headers.get('Accept-Language') ?? '')[0] ??
  'en'

/* chosen by hand, for a year, and sent with every request so the server speaks it too */
const keepLanguage = (language: Language) => {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`
}

/* the language the app speaks right now */
const spokenNow = (): Language => languageSchema.safeParse(i18n.locale).data ?? 'en'

export { keepLanguage, languageOf, spokenNow }
export type { Language }
