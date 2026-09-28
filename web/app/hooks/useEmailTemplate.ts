import { DEFAULT_TEMPLATES, jsonText } from '@skydock/scripts'
import type { EmailLanguage, EmailTemplate } from '@skydock/scripts'
import { z } from 'zod'
import { remembered } from './remembered'

/* The club's email, written once per language with its {variables} and remembered on this
   machine, as the signature is (RULES, Sending the link). Anything stored that does not read as one
   is the default rather than a guess. The French one keeps the name it always had. */
const emailTemplateSchema = z.object({ subject: z.string(), body: z.string() })

const templateIn = (lang: EmailLanguage) =>
  remembered<EmailTemplate>({
    key: lang === 'fr' ? 'skydock.emailTemplate' : `skydock.emailTemplate.${lang}`,
    fallback: DEFAULT_TEMPLATES[lang],
    from: (stored) => jsonText.pipe(emailTemplateSchema).safeParse(stored).data ?? null,
    to: (written) => JSON.stringify(written)
  })

const TEMPLATES = { fr: templateIn('fr'), en: templateIn('en'), de: templateIn('de') }

/* read outside a render, for a language just switched to */
const readEmailTemplate = (lang: EmailLanguage) => TEMPLATES[lang].read()

const setEmailTemplate = (lang: EmailLanguage, written: EmailTemplate) =>
  TEMPLATES[lang].set(written)

/* all three are read on every render, so switching language never changes how many hooks run */
const useEmailTemplate = (lang: EmailLanguage) => {
  const all = { fr: TEMPLATES.fr.use(), en: TEMPLATES.en.use(), de: TEMPLATES.de.use() }
  return all[lang]
}

export { readEmailTemplate, setEmailTemplate, useEmailTemplate }
