import {
  ensureNasSession,
  groupsInScope,
  isNamedMontage,
  listRemoteFiles,
  outputKeyOf,
  pastCancelling,
  runUpload,
  saveManifest,
  scopeKey,
  statProcessedOutputs,
  UploadCancelled,
  uploadGate,
  uploadScope,
  busyWith,
  idsOf
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Change, Intent } from './change'
import { uploadReporter } from './progress'

/* A jump, several, or a whole place goes up to its folder on the storage, each file checked
   against what is already there before a byte moves (RULES, Network storage). */
const uploadGroup: Intent = async ({ data, manifest, manifestPath, outputDir, refuse, latest }) => {
  const scope = { groupId: data.groupId, groupIds: data.groupIds, destination: data.destination }
  const key = scopeKey(scope)
  if (key === 'group:' && !scope.destination)
    return refuse('Upload needs a group or a destination.')
  const asked = groupsInScope(manifest, scope)
  if (asked.length > 0 && asked.every(isNamedMontage))
    return refuse(
      'Upload a montage from its own card: its film and photos go to its folder and its original videos to the backup, which an upload of the whole folder cannot do.'
    )
  const busy = busyWith({ groupIds: idsOf(asked), destination: scope.destination }, [
    'process',
    'render'
  ])
  if (busy === 'processing') return refuse('It is being processed — upload it once that is done.')
  if (busy === 'rendering')
    return refuse('A film there is being rendered — upload it once the render is done.')
  const session = await ensureNasSession()
  if (!session) return refuse(connectFirst())
  const outputs = await statProcessedOutputs(manifest)
  const scopeFiles = [
    ...asked.flatMap((g) => g.files),
    ...(scope.destination ? manifest.files.filter((f) => f.destination === scope.destination) : [])
  ]
  const gate = uploadGate(scopeFiles, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const label = scope.destination ?? asked.map((g) => g.label).join(', ')
  try {
    return await runUpload({ key, label, groupIds: asked.map((g) => g.id) }, () =>
      send({ scope, label, manifest, manifestPath, outputDir, session, latest })
    )
  } catch (err) {
    if (err instanceof UploadCancelled)
      return { ...(await boardAnswer(await latest())), uploadCancelled: true }
    return refuse(err instanceof Error ? err.message : 'Upload failed.')
  }
}

const send = async ({
  scope,
  label,
  manifest,
  manifestPath,
  outputDir,
  session,
  latest
}: {
  scope: Parameters<typeof uploadScope>[0]['scope']
  label: string
  manifest: Parameters<typeof uploadScope>[0]['manifest']
  manifestPath: string
  outputDir: string
  session: NonNullable<Awaited<ReturnType<typeof ensureNasSession>>>
  latest: Change['latest']
}) => {
  const report = uploadReporter({
    label,
    outputDir,
    groupIds: idsOf(groupsInScope(manifest, scope)),
    destinations: scope.destination ? [scope.destination] : []
  })
  try {
    const result = await uploadScope({
      outputDir,
      manifest,
      session,
      scope,
      onCheck: report.onCheck,
      onPlan: report.onPlan,
      onProgress: report.onProgress
    })
    const saved = await latest()
    const proved = new Map(result.files.map((verdict) => [verdict.localPath, verdict] as const))
    for (const file of [...saved.files, ...saved.groups.flatMap((g) => g.files)]) {
      const verdict = file.processed ? proved.get(file.processed.path) : undefined
      if (verdict)
        file.uploaded = {
          remotePath: verdict.remotePath,
          md5: verdict.md5,
          size: verdict.size,
          localPath: verdict.localPath,
          at: verdict.at
        }
    }
    const destinations = saved.destinations ?? []
    for (const { target, shareUrl } of result.shareUrls) {
      for (const id of target.groupIds) {
        const group = saved.groups.find((g) => g.id === id)
        if (group) group.publish = { shareUrl }
      }
      if (target.destination) {
        const dest = destinations.find((d) => d.name === target.destination)
        if (dest) dest.shareUrl = shareUrl
      }
    }
    saved.destinations = destinations
    report.done()
    await saveManifest(manifestPath, saved)
    return {
      ...(await boardAnswer(saved)),
      remote: await pastCancelling(() => listRemoteFiles(saved, session)),
      uploaded: result.uploaded,
      skipped: result.skipped,
      ...(result.originsProblem ? { storageProblem: result.originsProblem } : {})
    }
  } catch (err) {
    if (err instanceof UploadCancelled) report.cancelled()
    else report.failed(err instanceof Error ? err.message : 'Upload failed.')
    throw err
  }
}

export { uploadGroup }
