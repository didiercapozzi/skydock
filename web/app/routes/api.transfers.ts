import { clearTransfers, getOutputDir, readTransfers } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

/* What was sent, copied in and copied off, the latest first, to be looked at after the panel that
   showed it going has gone (RULES, Transfers). */
const loader = () => Response.json({ transfers: readTransfers(getOutputDir()) })

const actionArgs = z.object({ clear: z.literal(true) })

/* The history forgotten. Only what is kept about what happened: nothing that was sent, copied or
   recorded anywhere else is touched. */
const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: () => {
    clearTransfers(getOutputDir())
    return { transfers: [] }
  }
})

export { action, actionArgs, loader }
