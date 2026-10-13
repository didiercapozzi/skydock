import {
  ensureNasSession,
  listRemoteFiles,
  outputKeyOf,
  passengerName,
  pastCancelling,
  planOf,
  saveManifest,
  statProcessedOutputs,
  earlierMontagesDirs,
  montagesRemoteDir,
  montageUploadKey,
  uploadGate,
  busyWith
} from '@skydock/scripts'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { uploadMontage } from '../../../../packages/skydock-scripts/src/uploadMontage'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Change, Intent } from './change'
import { reportedUpload } from './progress'
import type { UploadReport } from './progress'
import { recordOnStorage } from './storage'

/* A montage goes up as its plan says — each item built once and sent to every destination it was put
   in — and the storage's own list of montages follows (RULES, Uploading a montage). */
const sendMontage = async (
  { data, manifest, manifestPath, outputDir, refuse, latest }: Change,
  groupId: string | undefined
) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) return refuse('Group not found.')
  if (busyWith({ groupIds: [group.id] }) === 'processing')
    return refuse('This montage is being processed — upload it once that is done.')
  const session = await ensureNasSession()
  if (!session) return refuse(connectFirst())
  const outputs = await statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const key = montageUploadKey(group.id)
  const label = passengerName(group.passenger)
  const send = async (report: UploadReport) => {
    const result = await uploadMontage({
      outputDir,
      manifest,
      group,
      session,
      plan: planOf(data.plan),
      onArchive: report.onArchive,
      onCheck: report.onCheck,
      onPlan: report.onPlan,
      onProgress: report.onProgress
    })
    const saved = await latest()
    const target = saved.groups.find((g) => g.id === group.id)
    if (target) {
      target.uploaded = result.record
      if (result.record.shareUrl) target.publish = { shareUrl: result.record.shareUrl }
    }
    report.done()
    await saveManifest(manifestPath, saved)
    return pastCancelling(async () => {
      const listed = target ? entryOfMontage(target, montagesRemoteDir(saved, session)) : null
      const listing = listed
        ? await recordOnStorage(
            session,
            listed.dir,
            (index) => upsert(index, listed.entry),
            earlierMontagesDirs(saved)
          )
        : {}
      const problems = [
        result.originsProblem,
        'storageProblem' in listing ? listing.storageProblem : undefined
      ].filter(Boolean)
      return {
        ...(await boardAnswer(saved)),
        ...listing,
        ...(problems.length > 0 ? { storageProblem: problems.join('; ') } : {}),
        remote: await listRemoteFiles(saved, session),
        uploaded: result.uploaded,
        skipped: result.skipped
      }
    })
  }
  return reportedUpload({ key, label, groupIds: [group.id], outputDir, latest, refuse }, send)
}

const uploadMontageIntent: Intent = (change) => sendMontage(change, change.data.groupId)

export { uploadMontageIntent }
