import {
  ensureNasSession,
  loadManifest,
  processingNow,
  saveManifest,
  earlierMontagesDirs,
  montagesRemoteDir
} from '@skydock/scripts'
import { freeTandem, markFreed } from '../../../../packages/skydock-scripts/src/freeTandem'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { recordOnStorage } from './storage'
import { messageOf } from '@skydock/scripts'

/* Delete a tandem from this machine, once the storage is proved to hold all of it (RULES, Freeing
   space). The proof is the storage's own checksum, so it has to be reachable. */
const freeTandemIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const session = await ensureNasSession()
  if (!session)
    return refuse('Connect the NAS first — freeing needs it to prove it holds the files.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  try {
    const result = await freeTandem({ manifest, outputDir, groupId: data.groupId ?? '', session })
    /* checking gigabytes takes a while; whatever was saved meanwhile is kept */
    const saved = loadManifest(manifestPath) ?? manifest
    markFreed(saved, result)
    saveManifest(manifestPath, saved)
    /* the storage's list says it is the only copy now */
    const freedGroup = saved.groups.find((g) => g.id === result.groupId)
    const listed = freedGroup ? entryOfMontage(freedGroup, montagesRemoteDir(saved, session)) : null
    const listing = listed
      ? await recordOnStorage(
          session,
          listed.dir,
          (index) => upsert(index, listed.entry),
          earlierMontagesDirs(saved)
        )
      : {}
    return {
      ...boardAnswer(saved),
      ...listing,
      freed: { bytes: result.bytes, files: result.fileIds.length, groupId: result.groupId }
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { freeTandemIntent }
