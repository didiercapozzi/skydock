import {
  createShareLink,
  ensureNasSession,
  getOutputDir,
  loadManifestAsync,
  removeShareLink,
  shareLinkFor,
  messageOf
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { withinStorage } from '../../../packages/skydock-scripts/src/storageFolder'

const actionArgs = z.object({
  intent: z.enum(['create', 'remove']),
  path: z.string()
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const session = await ensureNasSession()
    if (!session) {
      errors.addGlobalError('Connect the storage first.')
      return errors.toResponse(422)
    }
    const manifest = await loadManifestAsync(`${getOutputDir()}/manifest.json`)
    if (!manifest || !withinStorage(manifest, session, data.path)) {
      errors.addGlobalError('That file is not in a folder SkyDock delivers into.')
      return errors.toResponse(422)
    }
    try {
      const had = await shareLinkFor(session.hostname, session.sessionId, data.path)
      if (data.intent === 'remove') {
        if (had && !had.id) {
          errors.addGlobalError('The storage did not say which link that is.')
          return errors.toResponse(422)
        }
        if (had?.id && !(await removeShareLink(session.hostname, session.sessionId, had.id))) {
          errors.addGlobalError('The storage would not take that link away.')
          return errors.toResponse(422)
        }
        return { path: data.path, shareUrl: null }
      }
      const url =
        had?.url ?? (await createShareLink(session.hostname, session.sessionId, data.path))
      return { path: data.path, shareUrl: url }
    } catch (e) {
      errors.addGlobalError(messageOf(e))
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs }
