import { z } from 'zod'

/* What the board is told about the editing templates — kept apart, free of node, so the board can
   read the answer it is sent. */
const templateFactSchema = z.object({
  name: z.string(),
  /* the kdenlive that wrote the project, as the project says it; null when it does not */
  version: z.string().nullable(),
  assets: z.number(),
  /* the one a montage is made from without anybody being asked */
  byDefault: z.boolean(),
  /* files the project names that are not here */
  missing: z.array(z.string())
})

const templatesAnswerSchema = z.object({ templates: z.array(templateFactSchema) })

type TemplateFact = z.infer<typeof templateFactSchema>

export { templatesAnswerSchema }
export type { TemplateFact }
