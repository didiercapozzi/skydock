import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { mediaUnder } from '../../../packages/skydock-scripts/src/droppedMedia'

const actionArgs = z.object({ paths: z.array(z.string()) })

const droppedSchema = z.object({
  files: z.array(z.object({ path: z.string(), name: z.string(), size: z.number() }))
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data }) => ({ files: await mediaUnder(data.paths) })
})

export { action, actionArgs, droppedSchema }
