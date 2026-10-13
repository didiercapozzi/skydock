import { z } from 'zod'

const transferItemSchema = z.object({
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  result: z.enum(['done', 'skipped', 'failed', 'left']),
  note: z.string().optional()
})

const transferSchema = z.object({
  id: z.string(),
  kind: z.enum(['upload', 'import', 'camera', 'bring', 'delete']),
  label: z.string(),
  at: z.number(),
  state: z.enum(['done', 'failed', 'cancelled']),
  reason: z.string().optional(),
  items: z.array(transferItemSchema),
  passedOver: z.number().optional(),
  more: z.number().optional()
})

const transfersFileSchema = z.object({ transfers: z.array(transferSchema) })

type Transfer = z.infer<typeof transferSchema>
type TransferItem = z.infer<typeof transferItemSchema>

export { transfersFileSchema }
export type { Transfer, TransferItem }
