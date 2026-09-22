import { ensureNasSession, saveManifest } from '@skydock/scripts'
import { bringBack } from '../../../../packages/skydock-scripts/src/bringBack'
import { uploadAgain } from '../../../../packages/skydock-scripts/src/uploadAgain'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The two ways a file and the storage change places after it has already gone up.

   Fetching one back is for footage this machine no longer holds: freeing deleted the original once
   the storage was proved to have it, and this is the way back. Sending one again is for footage
   that was wrong up there — trimmed badly, turned the wrong way — and it moves what is there into
   the bin before a byte of the new one is sent (RULES, Network storage). */

const needsStorage = 'Connect the storage first.'

const bringBackIntent: Intent = async ({ data, manifest, manifestPath, refuse }) => {
  const fileId = data.fileIds?.[0]
  if (!fileId) return refuse('Nothing was asked for.')
  const session = await ensureNasSession()
  if (!session) return refuse(needsStorage)
  try {
    const back = await bringBack({ manifest, session, fileId })
    saveManifest(manifestPath, manifest)
    return { ...boardAnswer(manifest), broughtBack: back }
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}

const uploadAgainIntent: Intent = async ({ data, manifest, manifestPath, refuse }) => {
  const fileId = data.fileIds?.[0]
  if (!fileId) return refuse('Nothing was asked for.')
  const session = await ensureNasSession()
  if (!session) return refuse(needsStorage)
  try {
    const again = await uploadAgain({ manifest, session, fileId })
    saveManifest(manifestPath, manifest)
    return { ...boardAnswer(manifest), sentAgain: again }
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}

export { bringBackIntent, uploadAgainIntent }
