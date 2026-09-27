import { i18n } from '@lingui/core'
import { messages as de } from './locales/de/messages.po'
import { messages as en } from './locales/en/messages.po'
import { messages as fr } from './locales/fr/messages.po'
import type { Language } from './helpers/language'

/* Every language's sentences, loaded once: they are small, and a language switched to is then there
   at once, on the server as in the page. */
i18n.load({ en, fr, de })
i18n.activate('en')

/* the language the app speaks from now on; nothing to do when it already does */
const speak = (language: Language) => {
  if (i18n.locale !== language) i18n.activate(language)
}

export { i18n, speak }
