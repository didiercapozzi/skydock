import { z } from 'zod'

const boardViewSchema = z.object({
  kind: z.enum(['all', 'video', 'photo']).optional(),
  find: z.string().optional(),
  by: z.enum(['jump', 'day', 'none']).optional(),
  card: z.string().optional(),
  window: z.literal('preview').optional()
})

type BoardView = z.infer<typeof boardViewSchema>

export { boardViewSchema }
export type { BoardView }
