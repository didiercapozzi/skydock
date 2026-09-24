import {
  createShareLink,
  ensureNasSession,
  getOutputDir,
  loadManifest,
  removeShareLink,
  shareLinkFor
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { withinStorage } from '../../../packages/skydock-scripts/src/storageFolder'
import { messageOf } from '@skydock/scripts'

/* One file on the storage, handed out by a link of its own — or that link taken away again.

   A link is a way in: anybody holding it can fetch that file without a password and without an
   account. So only a file inside the folders SkyDock delivers into can be given one, which is the
   same rule that decides what may be played from here — a path typed by anything else is refused
   before the storage is asked anything at all.

   Removing one takes nothing off the storage. The link goes and the file stays exactly where it
   was (RULES, Principles). */
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
    const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
    if (!manifest || !withinStorage(manifest, session, data.path)) {
      errors.addGlobalError('That file is not in a folder SkyDock delivers into.')
      return errors.toResponse(422)
    }
    try {
      const had = await shareLinkFor(session.hostname, session.sessionId, data.path)
      if (data.intent === 'remove') {
        /* no link is the state asked for: there is nothing to take away and nothing to report. A
           link the storage did not name cannot be asked for by its id, and a path is not something
           a link is removed by, so that one stands. */
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
      /* a link the storage already has is handed back rather than a second one made */
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
