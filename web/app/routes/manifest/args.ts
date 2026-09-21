import {
  backupOptionsSchema,
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
    /* what is being processed, stopped */
    'cancel-process',
    'upload-group',
    'montage',
    'upload-tandem',
    'shift-group-time',
    /* one file's time, corrected on its own */
    'retime-file',
    /* where the jump is in a clip: a mark moved by hand */
    'set-moment',
    'move-files',
    /* the same files into another jump as well, staying where they are */
    'copy-files',
    /* a jump that should not exist: it goes, its files stay, loose in Unsorted */
    'delete-jump',
    'regroup-loose',
    /* everything still in Fresh files, back as a scan would first have left it */
    'reset-fresh',
    /* a camera plugged in was copied off: the board looks again, and hears what came off */
    'camera-copied',
    /* unsorted files nobody wants, out of the originals and into the bin */
    'trash-unsorted',
    /* back to before processing, keeping every decision — or undone altogether */
    'reset-tandem',
    'delete-tandem',
    /* delete it from this machine, once the storage is proved to hold it all */
    'free-tandem',
    /* what of a dropzone is proved on the storage, deleted from this machine */
    'free-dropzone',
    /* files were just added from the computer: the board looks again, and says how it went */
    'imported',
    /* the passenger was emailed — or, taken back, was not — said on the storage's list */
    'mark-emailed',
    /* tandems the storage's list names, put back on a board that has forgotten them */
    'restore-tandems'
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
  /* which of a clip's moments is being moved, and to when */
  moment: z
    .object({
      which: z.enum(['exit', 'opening', 'canopy', 'landing']),
      seconds: z.number().min(0)
    })
    .optional(),
  /* what came off a camera plugged in, and how its copy ended */
  cameraCopied: z
    .object({
      camera: z.string(),
      state: z.enum(['done', 'gone', 'failed', 'copying']),
      copied: z.number(),
      skipped: z.number(),
      reason: z.string().optional()
    })
    .optional(),
  /* how much of Fresh files to reset: the times alone, or everything decided about it */
  resetWhat: z.enum(['times', 'everything']).optional(),
  /* which of the storage's tandems to put back, by their folder up there; absent is every one */
  folders: z.array(z.string()).optional(),
  /* what a jump is called, when it is made or renamed */
  name: z.string().optional(),
  /* how a tandem's upload keeps the originals: one zip or plain files, with or without the film */
  backup: backupOptionsSchema.optional(),
  emailed: z
    .object({ folder: z.string(), to: z.string().optional(), sent: z.boolean() })
    .optional(),
  imported: importOutcomeSchema.optional()
})

type ActionData = z.infer<typeof actionArgs>

export { actionArgs }
export type { ActionData }
