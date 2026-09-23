import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
/* server-only: it reads the machine's own disk, so it is imported here rather than through the
   barrel the browser evaluates */
import { mediaUnder } from '../../../packages/skydock-scripts/src/droppedMedia'

/* What a drop from the computer is about to copy in, asked before a byte moves — so the board can
   show what is coming and count it down as it arrives.

   A folder answers with every video and photo inside it, however deep. This only ever reads names
   and sizes: nothing here copies, moves or opens anything. The addresses are the ones the app around
   the page handed over for what was let go of on this very machine, which is the same machine the
   server runs on. */
const actionArgs = z.object({ paths: z.array(z.string()) })

const droppedSchema = z.object({
  files: z.array(z.object({ path: z.string(), name: z.string(), size: z.number() }))
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: ({ data }) => ({ files: mediaUnder(data.paths) })
})

export { action, actionArgs, droppedSchema }
