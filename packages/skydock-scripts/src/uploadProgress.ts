import { z } from 'zod'

/* One thing an upload sends, as the corner's list of it shows it: a zip being made, then each file going
   to each folder up there — waiting, being sent, sent, already there and skipped, or in the way: a file
   of that name is up there already. `part` is how far the one under way has got. */
const uploadItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  size: z.number(),
  to: z.string().optional(),
  state: z.enum(['zipping', 'zipped', 'waiting', 'sending', 'sent', 'there', 'taken', 'failed']),
  part: z.number().optional()
})

/* one place both sides name a montage's upload, so a button can tell its own upload is the one going */
const montageUploadKey = (groupId: string) => `montage:${groupId}`
type UploadItem = z.infer<typeof uploadItemSchema>

export { montageUploadKey }
export type { UploadItem }
