import {
  ensureNasSession,
  listRemoteFiles,
  loadManifest,
  outputKeyOf,
  saveManifest,
  statProcessedOutputs,
  tandemUploadKey,
  uploadGate
} from '@skydock/scripts'
import { entryOfTandem, upsert } from '../../../../packages/skydock-scripts/src/tandemIndex'
import { uploadTandem } from '../../../../packages/skydock-scripts/src/uploadTandem'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { uploadReporter } from './progress'
import { recordOnStorage } from './storage'

/* A tandem's film and photos go to the passenger's folder and its originals to the backup, and the
   storage's own list of tandems follows (RULES, Uploading a tandem). */
const uploadTandemIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('Group not found.')
  const session = await ensureNasSession()
  if (!session) return refuse('Not connected to NAS. Please connect first.')
  /* the same rule every upload uses: a film built from a copy that no longer matches its source is
     not this tandem's film */
  const outputs = statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const report = uploadReporter({ scope: tandemUploadKey(group.id), groupId: group.id, outputDir })
  try {
    const result = await uploadTandem({
      outputDir,
      manifest,
      group,
      session,
      backup: data.backup,
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
    const listed = target ? entryOfTandem(target) : null
    const listing = listed
      ? await recordOnStorage(session, listed.dir, (index) => upsert(index, listed.entry))
      : {}
    return {
      ...boardAnswer(saved),
      ...listing,
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

export { uploadTandemIntent }
