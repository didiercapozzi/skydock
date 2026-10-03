import {
  earlierMontagesDirs,
  ensureNasSession,
  folderOfUpload,
  montagesRemoteDir,
  parentOf,
  saveManifest
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* The passenger was emailed — or, taken back, was not. It is kept on the board, so it stands whatever
   the storage does, and on the storage's list too where the montage has a row, so that any machine of
   the club can see it. */
const markEmailed: Intent = async ({ data, manifestPath, latest, refuse }) => {
  if (!data.emailed) return refuse('Say which montage was emailed.')
  const { folder, to, sent } = data.emailed
  const board = latest()
  const group = board.groups.find((g) => g.uploaded && folderOfUpload(g.uploaded) === folder)
  const at = Math.floor(Date.now() / 1000)
  if (group) {
    if (sent) group.emailed = { at, ...(to ? { to } : {}) }
    else delete group.emailed
    saveManifest(manifestPath, board)
  }
  /* the list is a courtesy beside it: a storage that is not connected, or a montage it does not name,
     does not stop the mark from being kept */
  const session = await ensureNasSession()
  let listing = {}
  if (session) {
    let known = false
    listing = await recordOnStorage(
      session,
      montagesRemoteDir(board, session) ?? parentOf(folder),
      (index) => {
        const entry = index.montages.find((t) => t.folder === folder)
        if (!entry) return
        known = true
        if (sent) entry.emailed = { at, ...(to ? { to } : {}) }
        else delete entry.emailed
      },
      earlierMontagesDirs(board)
    ).catch(() => ({}))
    if (!known && !group)
      return refuse('This montage is not on the board or on the storage’s list.')
  } else if (!group) return refuse('This montage is not on the board.')
  return { ...boardAnswer(board), ...listing }
}

export { markEmailed }
