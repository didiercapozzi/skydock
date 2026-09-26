import {
  destinationSchema,
  importOutcomeSchema,
  manifestFileSchema,
  manifestGroupSchema,
  sendPlanSchema
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
    /* a page that came back while something was being uploaded waits here for it to finish */
    'upload-wait',
    /* what is being uploaded, stopped */
    'cancel-upload',
    'montage',
    'upload-montage',
    'shift-group-time',
    /* one file's time, corrected on its own */
    'retime-file',
    /* where the jump is in a clip: a mark moved by hand */
    'set-moment',
    'move-files',
    /* the same files into another jump as well, staying where they are */
    'copy-files',
    /* picked files or a jump made a montage under one name: moved from Fresh files, copied otherwise */
    'make-montage',
    /* a jump that should not exist: it goes, its files stay, loose in Unsorted */
    'delete-jump',
    /* a place that should not exist: it goes, what was filed there is back in Fresh files */
    'remove-destination',
    'regroup-loose',
    /* everything still in Fresh files, back as a scan would first have left it */
    'reset-fresh',
    /* a camera plugged in was copied off: the board looks again, and hears what came off */
    'camera-copied',
    /* unsorted files nobody wants, out of the originals and into the bin */
    'trash-unsorted',
    /* back to before processing, keeping every decision — or undone altogether */
    'reset-montage',
    'delete-montage',
    /* delete it from this machine, once the storage is proved to hold it all */
    'free-montage',
    /* what of a dropzone is proved on the storage, deleted from this machine */
    'free-dropzone',
    /* files were just added from the computer: the board looks again, and says how it went */
    'imported',
    /* the passenger was emailed — or, taken back, was not — said on the storage's list */
    'mark-emailed',
    /* montages the storage's list names, put back on a board that has forgotten them */
    'restore-montages',
    /* a clip handed to the machine's own video player, to be watched at its full size */
    'play-file',
    /* files this machine gave back, copied off the camera again because they are wanted here */
    'copy-back',
    /* one file fetched back off the storage */
    'bring-back',
    /* files taken back out of the bin, into Fresh files */
    'from-bin'
  ]),
  groupId: z.string().optional(),
  /* files on a camera, by where they sit on its card — or in the bin */
  paths: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  targetGroupId: z.string().optional(),
  newGroup: z.boolean().optional(),
  /* the new jump is a montage, waiting for its name */
  montage: z.boolean().optional(),
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
  /* which of the storage's montages to put back, by their folder up there; absent is every one */
  folders: z.array(z.string()).optional(),
  /* what a jump is called, when it is made or renamed — and a montage's one name, when it is made */
  name: z.string().optional(),
  /* how a montage goes up: what is zipped, and which destinations each item goes to */
  plan: sendPlanSchema.optional(),
  emailed: z
    .object({ folder: z.string(), to: z.string().optional(), sent: z.boolean() })
    .optional(),
  imported: importOutcomeSchema.optional()
})

type ActionData = z.infer<typeof actionArgs>

export { actionArgs }
export type { ActionData }
