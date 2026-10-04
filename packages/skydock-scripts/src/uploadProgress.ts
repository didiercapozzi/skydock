import { z } from 'zod'

const uploadItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  state: z.enum(['zipping', 'zipped', 'waiting', 'sending', 'sent', 'there', 'taken', 'failed']),
  part: z.number().optional()
})

const montageUploadKey = (groupId: string) => `montage:${groupId}`
type UploadItem = z.infer<typeof uploadItemSchema>

export { montageUploadKey }
export type { UploadItem }
