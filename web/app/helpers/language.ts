import { i18n } from '@lingui/core'
import { z } from 'zod'

const LANGUAGES = ['en', 'fr', 'de'] as const
const languageSchema = z.enum(LANGUAGES)
type Language = z.infer<typeof languageSchema>

const LANGUAGE_COOKIE = 'skydock.lang'

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

const keepLanguage = (language: Language) => {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`
}

const spokenNow = (): Language => languageSchema.safeParse(i18n.locale).data ?? 'en'

export { keepLanguage, languageOf, spokenNow }
export type { Language }
