import { i18n } from '@lingui/core'
import { messages as de } from './locales/de/messages.po'
import { messages as en } from './locales/en/messages.po'
import { messages as fr } from './locales/fr/messages.po'
import type { Language } from './helpers/language'

i18n.load({ en, fr, de })
i18n.activate('en')

const speak = (language: Language) => {
  if (i18n.locale !== language) i18n.activate(language)
}

export { i18n, speak }
