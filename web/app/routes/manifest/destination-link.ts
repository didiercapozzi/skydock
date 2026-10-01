import {
  createShareLink,
  ensureNasSession,
  messageOf,
  removeShareLink,
  saveManifest,
  shareLinkFor
} from '@skydock/scripts'
import { normalizeNasPath } from '../../../../packages/skydock-scripts/src/nas'
import { withinStorage } from '../../../../packages/skydock-scripts/src/storageFolder'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A destination's folder on the storage handed out by a link — made, or taken away — by hand: uploading
   into a destination gives it none. Taking one away leaves the folder and its files where they were
   (RULES, Principles). A link the storage already has is handed back rather than a second one made. */
const destinationLink: Intent = async ({ data, manifestPath, latest, refuse }) => {
  const session = await ensureNasSession()
  if (!session || !data.link) return refuse('Connect the storage first.')
  const { folder, make } = data.link
  const board = latest()
  const place = (board.destinations ?? []).find(
    (d) => d.path && normalizeNasPath(d.path) === normalizeNasPath(folder)
  )
  if (!place) return refuse('That is not a destination of this board.')
  if (!withinStorage(board, session, `${folder}/x`))
    return refuse('That folder is not one SkyDock delivers into.')
  try {
    const had = await shareLinkFor(session.hostname, session.sessionId, folder)
    if (make) {
      place.shareUrl =
        had?.url ?? (await createShareLink(session.hostname, session.sessionId, folder))
    } else {
      if (had) {
        if (!had.id) return refuse('The storage did not say which link that is.')
        if (!(await removeShareLink(session.hostname, session.sessionId, had.id)))
          return refuse('The storage would not take that link away.')
      }
      delete place.shareUrl
      /* what its jumps recorded of it when they were uploaded, before a destination had none by default */
      for (const group of board.groups) if (group.destination === place.name) delete group.publish
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
  saveManifest(manifestPath, board)
  return boardAnswer(board)
}

export { destinationLink }
