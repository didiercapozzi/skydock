import {
  ensureNasSession,
  jumpsOfMontage,
  saveManifest,
  earlierMontagesDirs,
  montagesRemoteDir,
  messageOf
} from '@skydock/scripts'
import { freeMontage, markFreed } from '../../../../packages/skydock-scripts/src/freeMontage'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* Delete a montage from this machine, once the storage is proved to hold all of it (RULES, Freeing
   space). The proof is the storage's own checksum, so it has to be reachable. Not while any of its
   jumps is being processed, uploaded or rendered. */
const freeMontageIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  refuseBusy,
  latest
}) => {
  const busy = refuseBusy({ groupIds: jumpsOfMontage(manifest, outputDir, data.groupId ?? '') })
  if (busy) return busy
  const session = await ensureNasSession()
  if (!session) return refuse(connectFirst('freeing needs it to prove it holds the files'))
  try {
    const result = await freeMontage({ manifest, outputDir, groupId: data.groupId ?? '', session })
    const saved = await latest()
    markFreed(saved, result)
    await saveManifest(manifestPath, saved)
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
      ...(await boardAnswer(saved)),
      ...listing,
      freed: { bytes: result.bytes, files: result.fileIds.length, groupId: result.groupId }
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { freeMontageIntent }
