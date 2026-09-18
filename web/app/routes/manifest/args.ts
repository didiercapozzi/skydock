import {
  destinationSchema,
  importOutcomeSchema,
  manifestFileSchema,
  manifestGroupSchema
} from '@skydock/scripts'
import { z } from 'zod'

/* Every change the board can ask for, by intent, with the fields the intents read. */
const actionArgs = z.object({
  intent: z.enum([
    'save-groups',
    'merge-groups',
    'open-montage',
    'process',
    /* a page that came back while something was being processed waits here for it to finish */
    'process-wait',
    'upload-group',
    'montage',
    'upload-tandem',
    'shift-group-time',
    'move-files',
    'regroup-loose',
    /* back to before processing, keeping every decision — or undone altogether */
    'reset-tandem',
    'delete-tandem',
    /* delete it from this machine, once the storage is proved to hold it all */
    'free-tandem',
    /* files were just added from the computer: the board looks again, and says how it went */
    'imported',
    /* the passenger was emailed — or, taken back, was not — said on the storage's list */
    'mark-emailed'
  ]),
  groupId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  targetGroupId: z.string().optional(),
  newGroup: z.boolean().optional(),
  destination: z.string().optional(),
  template: z.string().optional(),
  groups: z.array(manifestGroupSchema).optional(),
  fileUpdates: z.array(manifestFileSchema).optional(),
  destinations: z.array(destinationSchema).optional(),
  leftId: z.string().optional(),
  rightId: z.string().optional(),
  anchorEpoch: z.number().optional(),
  /* how a tandem's upload keeps the originals: one zip or plain files, with or without the film */
  backup: z.object({ backupAs: z.enum(['zip', 'folder']), filmToBackup: z.boolean() }).optional(),
  emailed: z
    .object({ folder: z.string(), to: z.string().optional(), sent: z.boolean() })
    .optional(),
  imported: importOutcomeSchema.optional()
})

type ActionData = z.infer<typeof actionArgs>

export { actionArgs }
export type { ActionData }
