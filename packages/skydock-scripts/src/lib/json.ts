import { z } from 'zod'
import { messageOf } from './words'

const jsonText = z.string().transform((text, ctx) => {
  try {
    return JSON.parse(text)
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: messageOf(e) })
    return z.NEVER
  }
})

export { jsonText }
