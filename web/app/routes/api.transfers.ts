import { clearTransfers, getOutputDir, readTransfers, removeTransfer } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

/* What was sent, copied in and copied off, the latest first, to be looked at after the panel that
   showed it going has gone (RULES, Transfers). */
const loader = () => Response.json({ transfers: readTransfers(getOutputDir()) })

/* all of them forgotten, or just the one named */
const actionArgs = z.object({ clear: z.literal(true).optional(), remove: z.string().optional() })

/* The history forgotten, all of it or one transfer of it. Only what is kept about what happened:
   nothing that was sent, copied or recorded anywhere else is touched. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: ({ data }) => {
    if (data.remove) removeTransfer(data.remove, getOutputDir())
    else clearTransfers(getOutputDir())
    return { transfers: readTransfers(getOutputDir()) }
  }
})

export { action, actionArgs, loader }
