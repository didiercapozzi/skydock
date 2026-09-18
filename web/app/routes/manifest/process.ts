import { loadManifest, processJumps, whenProcessed } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Process the jumps asked for — by id, by place, or all of them — and answer with the manifest as
   processing left it. */
const processIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  frozen,
  refuse,
  refuseFrozen
}) => {
  const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
  /* the same choice of jumps processing makes, so one with an edit is never written over */
  const targets = manifest.groups.filter((g) =>
    requestedGroups && requestedGroups.length > 0
      ? requestedGroups.includes(g.id)
      : !data.destination || g.destination === data.destination
  )
  if (targets.some((g) => frozen.has(g.id))) return refuseFrozen()
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

export { processIntent, processWait }
