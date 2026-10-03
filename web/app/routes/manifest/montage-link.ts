import {
  createShareLink,
  folderOfUpload,
  earlierMontagesDirs,
  ensureNasSession,
  messageOf,
  montagesRemoteDir,
  parentOf,
  removeShareLink,
  saveManifest,
  shareLinkFor
} from '@skydock/scripts'
import { withinStorage } from '../../../../packages/skydock-scripts/src/storageFolder'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* A montage's folder on the storage, handed out by a link — made, or taken away — and the storage's
   list told which, so that any machine of the club sees it. A link taken away takes nothing off the
   storage: the folder stays exactly where it was (RULES, Principles). A link the storage already has
   is handed back rather than a second one made. */
const montageLink: Intent = async ({ data, manifest, manifestPath, latest, refuse }) => {
  const session = await ensureNasSession()
  if (!session || !data.link) return refuse(connectFirst('the list of montages is kept there'))
  const { folder, make } = data.link
  if (!withinStorage(manifest, session, `${folder}/x`))
    return refuse('That folder is not one SkyDock delivers into.')
  let shareUrl: string | null = null
  try {
    const had = await shareLinkFor(session.hostname, session.sessionId, folder)
    if (make) {
      shareUrl = had?.url ?? (await createShareLink(session.hostname, session.sessionId, folder))
    } else if (had) {
      if (!had.id) return refuse('The storage did not say which link that is.')
      if (!(await removeShareLink(session.hostname, session.sessionId, had.id)))
        return refuse('The storage would not take that link away.')
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
  /* the board's own record of the upload says the same, read after the wait */
  const board = latest()
  for (const group of board.groups) {
    if (!group.uploaded || folderOfUpload(group.uploaded) !== folder) continue
    if (shareUrl) {
      group.uploaded.shareUrl = shareUrl
      group.publish = { shareUrl }
    } else {
      delete group.uploaded.shareUrl
      delete group.publish
    }
  }
  saveManifest(manifestPath, board)
  let known = true
  const listing = await recordOnStorage(
    session,
    montagesRemoteDir(manifest, session) ?? parentOf(folder),
    (index) => {
      const entry = index.montages.find((t) => t.folder === folder)
      if (!entry) known = false
      else if (shareUrl) entry.shareUrl = shareUrl
      else delete entry.shareUrl
    },
    earlierMontagesDirs(manifest)
  )
  if (!known) return refuse('This montage is not on the storage’s list — upload it first.')
  return { ...boardAnswer(board), ...listing }
}

export { montageLink }
