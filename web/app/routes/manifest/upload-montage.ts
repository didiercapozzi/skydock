import {
  ensureNasSession,
  listRemoteFiles,
  loadManifest,
  outputKeyOf,
  planOf,
  saveManifest,
  statProcessedOutputs,
  earlierMontagesDirs,
  montagesRemoteDir,
  montageUploadKey,
  uploadGate
} from '@skydock/scripts'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { uploadMontage } from '../../../../packages/skydock-scripts/src/uploadMontage'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { uploadReporter } from './progress'
import { recordOnStorage } from './storage'

/* A montage goes up as its plan says — each item built once and sent to every destination it was put
   in — and the storage's own list of montages follows (RULES, Uploading a montage). */
const uploadMontageIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('Group not found.')
  const session = await ensureNasSession()
  if (!session) return refuse('Not connected to NAS. Please connect first.')
  /* the same rule every upload uses: a film built from a copy that no longer matches its source is
     not this montage's film */
  const outputs = statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const report = uploadReporter({ scope: montageUploadKey(group.id), groupId: group.id, outputDir })
  try {
    const result = await uploadMontage({
      outputDir,
      manifest,
      group,
      session,
      plan: planOf(data.plan),
      onArchive: report.onArchive,
      onCheck: report.onCheck,
      onProgress: report.onProgress
    })
    /* it runs for minutes; anything saved meanwhile is on disk and must not be clobbered by the
       copy loaded before it started */
    const saved = loadManifest(manifestPath) ?? manifest
    const target = saved.groups.find((g) => g.id === group.id)
    if (target) {
      target.uploaded = result.record
      if (result.record.shareUrl) target.publish = { shareUrl: result.record.shareUrl }
    }
    report.done(result.skipped)
    saveManifest(manifestPath, saved)
    const listed = target ? entryOfMontage(target, montagesRemoteDir(saved, session)) : null
    const listing = listed
      ? await recordOnStorage(
          session,
          listed.dir,
          (index) => upsert(index, listed.entry),
          earlierMontagesDirs(saved)
        )
      : {}
    /* either list may not have followed; the upload stands, and the board says which */
    const problems = [
      result.originsProblem,
      'storageProblem' in listing ? listing.storageProblem : undefined
    ].filter(Boolean)
    return {
      ...boardAnswer(saved),
      ...listing,
      ...(problems.length > 0 ? { storageProblem: problems.join('; ') } : {}),
      remote: await listRemoteFiles(saved, session),
      uploaded: result.uploaded,
      skipped: result.skipped
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed.'
    report.failed(msg)
    return refuse(msg)
  }
}

export { uploadMontageIntent }
