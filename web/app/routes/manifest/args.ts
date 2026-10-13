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
    /* the record changed outside this page: the board looks at it again, writing nothing */
    'look-at-board',
    'upload-group',
    /* a page that came back while something was being uploaded waits here for it to finish */
    'upload-wait',
    /* what is being uploaded, stopped */
    'cancel-upload',
    'montage',
    'upload-montage',
    /* picked files zipped as the plan says and sent to the destinations they were put in */
    'send-files',
    'shift-group-time',
    /* one file's time, corrected on its own */
    'retime-file',
    /* where the jump is in a clip: a mark moved by hand */
    'set-moment',
    /* the marks of a clip put back where the camera measured them */
    'reset-moments',
    /* development only: a clip's marks forgotten and found again */
    'redo-moments',
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
    /* a montage's folder on the storage given a link, or its link taken away */
    'montage-link',
    /* a destination's folder given a link by hand, or its link taken away */
    'destination-link',
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
  paths: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  targetGroupId: z.string().optional(),
  newGroup: z.boolean().optional(),
  montage: z.boolean().optional(),
  destination: z.string().optional(),
  template: z.string().optional(),
  groups: z.array(manifestGroupSchema).optional(),
  fileUpdates: z.array(manifestFileSchema).optional(),
  destinations: z.array(destinationSchema).optional(),
  leftId: z.string().optional(),
  rightId: z.string().optional(),
  anchorEpoch: z.number().optional(),
  moment: z
    .object({
      which: z.enum(['exit', 'opening', 'canopy', 'landing']),
      seconds: z.number().min(0)
    })
    .optional(),
  cameraCopied: z
    .object({
      camera: z.string(),
      state: z.enum(['done', 'gone', 'failed', 'copying', 'stopped']),
      copied: z.number(),
      skipped: z.number(),
      reason: z.string().optional()
    })
    .optional(),
  resetWhat: z.enum(['times', 'everything']).optional(),
  name: z.string().optional(),
  plan: sendPlanSchema.optional(),
  emailed: z
    .object({ folder: z.string(), to: z.string().optional(), sent: z.boolean() })
    .optional(),
  link: z.object({ folder: z.string(), make: z.boolean() }).optional(),
  imported: importOutcomeSchema.optional()
})

type ActionData = z.infer<typeof actionArgs>

export { actionArgs }
export type { ActionData }
