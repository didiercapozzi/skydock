import {
  ensureNasSession,
  listRemoteFiles,
  outputKeyOf,
  passengerName,
  pastCancelling,
  runUpload,
  UploadCancelled,
  planOf,
  saveManifest,
  statProcessedOutputs,
  earlierMontagesDirs,
  montagesRemoteDir,
  montageUploadKey,
  UPLOAD_QUEUE_KEY,
  uploadGate,
  busyWith
} from '@skydock/scripts'
import { entryOfMontage, upsert } from '../../../../packages/skydock-scripts/src/montageIndex'
import { uploadMontage } from '../../../../packages/skydock-scripts/src/uploadMontage'
import { boardAnswer } from '../../helpers/manifest'
import type { Change, Intent, Refusal } from './change'
import { uploadReporter } from './progress'
import { recordOnStorage } from './storage'

/* A montage goes up as its plan says — each item built once and sent to every destination it was put
   in — and the storage's own list of montages follows (RULES, Uploading a montage). `scope` is what
   its progress is told under: its own, or the queue's it is one of. */
const sendMontage = async (
  { data, manifest, manifestPath, outputDir, refuse, latest }: Change,
  groupId: string | undefined,
  scope?: string
) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) return refuse('Group not found.')
  if (busyWith({ groupIds: [group.id] }) === 'processing')
    return refuse('This montage is being processed — upload it once that is done.')
  const session = await ensureNasSession()
  if (!session) return refuse('Not connected to the storage. Please connect first.')
  /* the same rule every upload uses: a film built from a copy that no longer matches its source is
     not this montage's film */
  const outputs = statProcessedOutputs(manifest)
  const gate = uploadGate(group.files, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const key = montageUploadKey(group.id)
  const label = passengerName(group.passenger)
  const send = async (report: ReturnType<typeof uploadReporter>) => {
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
    /* it runs for minutes; anything saved meanwhile is on disk and must not be clobbered by the
       copy loaded before it started */
    const saved = latest()
    const target = saved.groups.find((g) => g.id === group.id)
    if (target) {
      target.uploaded = result.record
      if (result.record.shareUrl) target.publish = { shareUrl: result.record.shareUrl }
    }
    report.done(result.skipped)
    saveManifest(manifestPath, saved)
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
    })
  }
  /* one upload at a time: a second is refused before it touches what the first is showing */
  try {
    return await runUpload({ key, label, groupIds: [group.id] }, async () => {
      const report = uploadReporter({ scope: scope ?? key, label, groupId: group.id, outputDir })
      try {
        return await send(report)
      } catch (err) {
        if (err instanceof UploadCancelled) report.cancelled()
        else report.failed(err instanceof Error ? err.message : 'Upload failed.')
        throw err
      }
    })
  } catch (err) {
    if (err instanceof UploadCancelled) return { ...boardAnswer(latest()), uploadCancelled: true }
    return refuse(err instanceof Error ? err.message : 'Upload failed.')
  }
}

const uploadMontageIntent: Intent = (change) => sendMontage(change, change.data.groupId)

/* Several montages, one after the other, each on the plan the upload dialog last used — the
   storage is sent one thing at a time. One that cannot go says why and the rest still go; one
   cancelled stops the queue there (RULES, Uploading a montage). */
const aside = (message: string): Refusal => ({
  success: false,
  status: 422,
  globalErrors: [message]
})

const uploadMontagesIntent: Intent = async (change) => {
  const ids = change.data.groupIds ?? []
  if (ids.length === 0) return change.refuse('Nothing to upload.')
  const refused: string[] = []
  let last: Awaited<ReturnType<typeof sendMontage>> | null = null
  for (const id of ids) {
    /* each one's refusal is kept to itself, and said with its name once the queue is through */
    const answer = await sendMontage(
      { ...change, manifest: change.latest(), refuse: aside },
      id,
      UPLOAD_QUEUE_KEY
    )
    if (!('success' in answer)) {
      last = answer
      if ('uploadCancelled' in answer) break
      continue
    }
    if (answer.success) continue
    const who = change.latest().groups.find((g) => g.id === id)
    refused.push(
      `${who ? passengerName(who.passenger) : id}: ${answer.globalErrors?.[0] ?? 'refused'}`
    )
  }
  if (!last) return change.refuse(refused.join('; '))
  const before = 'storageProblem' in last ? last.storageProblem : undefined
  return refused.length > 0
    ? { ...last, storageProblem: [before, ...refused].filter(Boolean).join('; ') }
    : last
}

export { uploadMontageIntent, uploadMontagesIntent }
