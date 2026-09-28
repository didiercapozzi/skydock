import {
  ensureNasSession,
  processingNow,
  saveManifest,
  earlierMontagesDirs,
  montagesRemoteDir,
  messageOf
} from '@skydock/scripts'
import { freeMontage, markFreed } from '../../../../packages/skydock-scripts/src/freeMontage'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* Delete a montage from this machine, once the storage is proved to hold all of it (RULES, Freeing
   space). The proof is the storage's own checksum, so it has to be reachable. */
const freeMontageIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  latest
}) => {
  const session = await ensureNasSession()
  if (!session)
    return refuse('Connect the storage first — freeing needs it to prove it holds the files.')
  if (processingNow()) return refuse('Something is being processed — wait for it to finish.')
  try {
    const result = await freeMontage({ manifest, outputDir, groupId: data.groupId ?? '', session })
    /* checking gigabytes takes a while; whatever was saved meanwhile is kept */
    const saved = latest()
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

export { freeMontageIntent }
