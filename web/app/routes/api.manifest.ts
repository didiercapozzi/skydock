import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  getOutputDir,
  loadManifest,
  manifestJumpSchema,
  mergeJumps,
  saveManifest,
  shiftFiles
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['save-jumps', 'merge-jumps']),
  jumps: z.array(manifestJumpSchema).optional(),
  leftId: z.string().optional(),
  rightId: z.string().optional(),
  anchorEpoch: z.number().optional()
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
    if (data.intent === 'merge-jumps') {
      if (!data.leftId || !data.rightId) {
        errors.addGlobalError('Merge needs two jump ids.')
        return errors.toResponse(422)
      }
      manifest.jumps = mergeJumps(manifest.jumps, data.leftId, data.rightId)
      if (data.anchorEpoch !== undefined && Number.isFinite(data.anchorEpoch)) {
        const merged = manifest.jumps.find((j) => j.id === data.leftId)
        if (merged && merged.files.length > 0) {
          const min = Math.min(...merged.files.map((f) => f.mtime))
          const offset = Math.round(data.anchorEpoch) - min
          if (offset !== 0) {
            const ids = new Set<string>()
            for (const f of merged.files) if (f.id) ids.add(f.id)
            shiftFiles(manifest, ids, offset)
          }
        }
      }
      saveManifest(manifestPath, manifest)
      return { jumps: manifest.jumps }
    }
    if (!data.jumps) {
      errors.addGlobalError('Save needs jumps.')
      return errors.toResponse(422)
    }
    manifest.jumps = data.jumps
    saveManifest(manifestPath, manifest)
    return { ok: true as const }
  }
})

export { action, actionArgs }
