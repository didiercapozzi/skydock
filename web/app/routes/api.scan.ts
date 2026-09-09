import { getOutputDir, scanMedia } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async () => {
    const result = await scanMedia({ outputDir: getOutputDir() })
    return { ok: true as const, ...result }
  }
})

export { action, actionArgs }
