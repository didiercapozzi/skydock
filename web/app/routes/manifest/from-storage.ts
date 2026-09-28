import { ensureNasSession, saveManifest, messageOf } from '@skydock/scripts'
import { bringBack } from '../../../../packages/skydock-scripts/src/bringBack'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* One file fetched back off the storage, for footage this machine no longer holds: freeing deleted
   the original once the storage was proved to have it, and this is the way back (RULES, Freeing
   space). */

const needsStorage = 'Connect the storage first.'

const bringBackIntent: Intent = async ({ data, manifest, manifestPath, refuse, latest }) => {
  const fileId = data.fileIds?.[0]
  if (!fileId) return refuse('Nothing was asked for.')
  const session = await ensureNasSession()
  if (!session) return refuse(needsStorage)
  try {
    const { board, ...back } = await bringBack({ manifest, session, fileId, latest })
    saveManifest(manifestPath, board)
    return { ...boardAnswer(board), broughtBack: back }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { bringBackIntent }
