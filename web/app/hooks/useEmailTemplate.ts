import { DEFAULT_TEMPLATE, jsonText } from '@skydock/scripts'
import type { EmailTemplate } from '@skydock/scripts'
import { z } from 'zod'
import { remembered } from './remembered'

/* The club's passenger email, written once with its {variables} and remembered on this machine, as
   the signature is (RULES, Sending the link). Anything stored that does not read as one is the
   default rather than a guess. */
const emailTemplateSchema = z.object({ subject: z.string(), body: z.string() })

const template = remembered<EmailTemplate>({
  key: 'skydock.emailTemplate',
  fallback: DEFAULT_TEMPLATE,
  from: (stored) => jsonText.pipe(emailTemplateSchema).safeParse(stored).data ?? null,
  to: (written) => JSON.stringify(written)
})

const setEmailTemplate = template.set
const useEmailTemplate = template.use

export { setEmailTemplate, useEmailTemplate }
