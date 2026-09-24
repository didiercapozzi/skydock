import {
  ensureNasSession,
  groupsInScope,
  isTandem,
  listRemoteFiles,
  loadManifest,
  outputKeyOf,
  saveManifest,
  scopeKey,
  statProcessedOutputs,
  uploadGate,
  uploadScope
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { uploadReporter } from './progress'

/* A jump, several, or a whole place goes up to its folder on the storage, each file checked
   against what is already there before a byte moves (RULES, Network storage). */
const uploadGroup: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const scope = { groupId: data.groupId, groupIds: data.groupIds, destination: data.destination }
  const key = scopeKey(scope)
  if (key === 'group:' && !scope.destination)
    return refuse('Upload needs a group or a destination.')
  /* A tandem's files reach the storage by uploading the tandem, because they do not all go to the
     same folder. The board never offers this for one, so anything arriving here asked for it by
     name and is told why rather than left with an upload that quietly covered nothing. */
  const asked = groupsInScope(manifest, scope)
  if (asked.length > 0 && asked.every(isTandem))
    return refuse(
      'Upload a montage from its own card: its film and photos go to its folder and its original videos to the backup, which an upload of the whole folder cannot do.'
    )
  /* a stored session is only a session if DSM still takes it — this is also what lets an expired
     one refresh itself instead of failing the upload */
  const session = await ensureNasSession()
  if (!session) return refuse('Not connected to NAS. Please connect first.')
  /* the same rule the button uses, so the server never accepts what the board would refuse — and
     catches a file that changed between the click and the request */
  const outputs = statProcessedOutputs(manifest)
  const scopeFiles = [
    ...asked.flatMap((g) => g.files),
    ...(scope.destination ? manifest.files.filter((f) => f.destination === scope.destination) : [])
  ]
  const gate = uploadGate(scopeFiles, (file) => ({ output: outputs[outputKeyOf(file)] }))
  if (gate.blocked) return refuse(`${gate.message} — process before uploading.`)
  const report = uploadReporter({ scope: key, outputDir })
  try {
    const result = await uploadScope({
      outputDir,
      manifest,
      session,
      scope,
      onCheck: report.onCheck,
      onProgress: report.onProgress
    })
    /* it runs for minutes; anything saved meanwhile is on disk and must not be clobbered by the
       copy loaded before it started */
    const saved = loadManifest(manifestPath) ?? manifest
    /* every file now proved to be on the storage — sent or found identical there */
    const byOutput = new Map(
      saved.files.flatMap((f) => (f.processed ? [[f.processed.path, f] as const] : []))
    )
    for (const verdict of result.files) {
      const file = byOutput.get(verdict.localPath)
      if (file)
        file.uploaded = {
          remotePath: verdict.remotePath,
          md5: verdict.md5,
          size: verdict.size,
          localPath: verdict.localPath,
          at: verdict.at
        }
    }
    /* every group behind a target gets the link, and a place keeps its own so the board can hand
       out a dropzone folder without opening a group */
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
    report.done(result.skipped)
    saveManifest(manifestPath, saved)
    return {
      ...boardAnswer(saved),
      /* taken right after the upload, by the session that did it — the board gets the new truth
         without having to go and ask for it */
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

export { uploadGroup }
