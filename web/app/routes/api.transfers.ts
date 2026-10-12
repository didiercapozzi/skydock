import { clearTransfers, getOutputDir, readTransfers, removeTransfer } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const loader = async () => Response.json({ transfers: await readTransfers(getOutputDir()) })

const actionArgs = z.object({ clear: z.literal(true).optional(), remove: z.string().optional() })

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data }) => {
    if (data.remove) await removeTransfer(data.remove, getOutputDir())
    else await clearTransfers(getOutputDir())
    return { transfers: await readTransfers(getOutputDir()) }
  }
})

export { action, actionArgs, loader }
