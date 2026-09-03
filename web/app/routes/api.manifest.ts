import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import { getOutputDir, loadManifest, manifestJumpSchema, saveManifest } from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.literal('save-jumps'),
  jumps: z.array(manifestJumpSchema)
})

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const manifestPath = `${getOutputDir()}/manifest.json`
    const manifest = loadManifest(manifestPath)
    if (!manifest) {
      errors.addGlobalError('No manifest found. Run a scan first.')
      return errors.toResponse(422)
    }
    manifest.jumps = data.jumps
    saveManifest(manifestPath, manifest)
    return { ok: true as const }
  }
})

export { action, actionArgs }
