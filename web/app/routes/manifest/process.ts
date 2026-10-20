import { busyWith, cancelProcessing, messageOf, processJumps } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

const processIntent: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  refuse,
  latest
}) => {
  const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
  const asked = { groupIds: requestedGroups, destination: data.destination }
  if (busyWith(asked, ['upload']))
    return refuse('It is being uploaded — process it again once the upload is done.')
  const touched =
    requestedGroups && requestedGroups.length > 0
      ? requestedGroups
      : manifest.groups
          .filter((g) => !data.destination || g.destination === data.destination)
          .map((g) => g.id)
  if (busyWith({ groupIds: touched }, ['render']))
    return refuse(
      'Its film is being rendered from these copies — process it again once the render is done, or cancel it.'
    )
  void processJumps({
    manifestPath,
    outputDir,
    groupIds: requestedGroups && requestedGroups.length > 0 ? requestedGroups : undefined,
    destination: data.destination,
    fileIds: data.fileIds
  }).catch((e) => console.warn(`[Process] ${messageOf(e)}`))
  return boardAnswer(await latest())
}

const cancelProcess: Intent = async ({ data, refuse, latest }) => {
  if (!cancelProcessing(data.jobId)) return refuse('Nothing is being processed.')
  return { ...(await boardAnswer(await latest())), processCancelled: true }
}

export { cancelProcess, processIntent }
