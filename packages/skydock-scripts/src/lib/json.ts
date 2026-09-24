import { z } from 'zod'
import { messageOf } from './words'

/* Decoding the text inside the schema, so reading a file is one check instead of a parse and then a
   validation with a gap between them where the value is whatever JSON.parse happened to return. */
const jsonText = z.string().transform((text, ctx) => {
  try {
    return JSON.parse(text)
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: messageOf(e) })
    return z.NEVER
  }
})

export { jsonText }
