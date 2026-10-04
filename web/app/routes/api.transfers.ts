import { clearTransfers, getOutputDir, readTransfers, removeTransfer } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const loader = () => Response.json({ transfers: readTransfers(getOutputDir()) })

const actionArgs = z.object({ clear: z.literal(true).optional(), remove: z.string().optional() })

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: ({ data }) => {
    if (data.remove) removeTransfer(data.remove, getOutputDir())
    else clearTransfers(getOutputDir())
    return { transfers: readTransfers(getOutputDir()) }
  }
})

export { action, actionArgs, loader }
