import { DEFAULT_TEMPLATES, jsonText } from '@skydock/scripts/client'
import type { EmailLanguage, EmailTemplate } from '@skydock/scripts'
import { z } from 'zod'
import { remembered } from './remembered'

const emailTemplateSchema = z.object({
  subject: z.string(),
  body: z.string(),
  kicker: z.string().optional()
})

const templateIn = (lang: EmailLanguage) =>
  remembered<EmailTemplate>({
    key: lang === 'fr' ? 'skydock.emailTemplate' : `skydock.emailTemplate.${lang}`,
    fallback: DEFAULT_TEMPLATES[lang],
    from: (stored) => jsonText.pipe(emailTemplateSchema).safeParse(stored).data ?? null,
    to: (written) => JSON.stringify(written)
  })

const TEMPLATES = { fr: templateIn('fr'), en: templateIn('en'), de: templateIn('de') }

const readEmailTemplate = (lang: EmailLanguage) => TEMPLATES[lang].read()

const setEmailTemplate = (lang: EmailLanguage, written: EmailTemplate) =>
  TEMPLATES[lang].set(written)

const useEmailTemplate = (lang: EmailLanguage) => {
  const all = { fr: TEMPLATES.fr.use(), en: TEMPLATES.en.use(), de: TEMPLATES.de.use() }
  return all[lang]
}

export { readEmailTemplate, setEmailTemplate, useEmailTemplate }
