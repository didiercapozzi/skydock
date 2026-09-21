import { cancelProcessing, loadManifest, processJumps, whenProcessed } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Process the jumps asked for — by id, by place, or all of them — and answer with the manifest as
   processing left it. */
const processIntent: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
  /* A tandem with an edit is prepared again like any other. Preparing writes the copies and nothing
     else: the project, the film and the archives sit beside them and are left where they are, and
     the copies keep the names the passenger and the clips' own times give them, which is what the
     project calls them by. What can change is what those copies hold — a clip trimmed differently
     comes out a different length — so the edit may want a look afterwards; that is the person's to
     judge, and losing an afternoon to a trim nobody can apply is worse (RULES, Montage). */
  try {
    await processJumps({
      manifestPath,
      outputDir,
      groupIds: requestedGroups && requestedGroups.length > 0 ? requestedGroups : undefined,
      destination: data.destination
    })
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
  return boardAnswer(loadManifest(manifestPath) ?? manifest)
}

/* a page that came back while something was being processed waits here for it to finish */
const processWait: Intent = async ({ manifest, manifestPath }) => {
  await whenProcessed()
  return boardAnswer(loadManifest(manifestPath) ?? manifest)
}

/* Stops what is being processed, and answers once it has stopped, with the board as the run left
   it: the copies already finished stay on the disk, and nothing of the run counts as processed. */
const cancelProcess: Intent = async ({ manifest, manifestPath, refuse }) => {
  if (!cancelProcessing()) return refuse('Nothing is being processed.')
  await whenProcessed()
  return { ...boardAnswer(loadManifest(manifestPath) ?? manifest), processCancelled: true }
}

export { cancelProcess, processIntent, processWait }
