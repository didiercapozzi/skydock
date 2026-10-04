import { z } from 'zod'

const templateFactSchema = z.object({
  name: z.string(),
  version: z.string().nullable(),
  assets: z.number(),
  byDefault: z.boolean(),
  missing: z.array(z.string())
})

const templatesAnswerSchema = z.object({ templates: z.array(templateFactSchema) })

type TemplateFact = z.infer<typeof templateFactSchema>

export { templatesAnswerSchema }
export type { TemplateFact }
