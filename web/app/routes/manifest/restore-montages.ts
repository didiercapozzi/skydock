import {
  earlierMontagesDirs,
  ensureNasSession,
  saveManifest,
  montagesRemoteDir
} from '@skydock/scripts'
import { restoreMontages } from '../../../../packages/skydock-scripts/src/restoreMontages'
import { readMontageIndex } from '../../../../packages/skydock-scripts/src/montageIndex'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { messageOf } from '@skydock/scripts'

/* Montages the storage's list names are put back on a board that has forgotten them: their files
   gathered again under the passenger's name, at the times they had (RULES, The storage's list of
   montages). The list is read off the storage here rather than taken from the board, so what is
   restored is what the storage says and nothing a page could have made up. */
const restoreMontagesIntent: Intent = async ({ data, manifest, manifestPath, refuse }) => {
  const session = await ensureNasSession()
  if (!session) return refuse('Connect the NAS first — the list of montages is kept there.')
  const dir = montagesRemoteDir(manifest, session)
  if (!dir) return refuse('Choose where montages go on the storage first.')
  let listed
  try {
    listed = (await readMontageIndex(session, dir, earlierMontagesDirs(manifest))).montages
  } catch (e) {
    return refuse(messageOf(e))
  }
  const asked = data.folders ? listed.filter((t) => data.folders?.includes(t.folder)) : listed
  const restored = restoreMontages(manifest, asked)
  if (restored.length === 0)
    return refuse('None of those montages’ files are waiting to be sorted here.')
  saveManifest(manifestPath, manifest)
  return { ...boardAnswer(manifest), restored }
}

export { restoreMontagesIntent }
