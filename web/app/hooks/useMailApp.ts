import { z } from 'zod'
import { remembered } from './remembered'

const mailAppSchema = z.enum(['gmail', 'mailto'])
type MailApp = z.infer<typeof mailAppSchema>

/* Which one opened the last email is which one opens the next: a club uses one or the other, and
   being asked every time is being asked about somebody else's habit. */
const app = remembered<MailApp>({
  key: 'skydock.mailApp',
  fallback: 'gmail',
  from: (stored) => mailAppSchema.safeParse(stored).data ?? null
})

const setMailApp = app.set
const useMailApp = app.use

export { setMailApp, useMailApp }
export type { MailApp }
