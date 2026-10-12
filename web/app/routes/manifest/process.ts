import {
  cancelProcessing,
  processJumps,
  whenProcessed,
  busyWith,
  messageOf
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Process the jumps asked for — by id, by place, or all of them — and answer with the manifest as
   processing left it. */
const processIntent: Intent = async ({ data, manifestPath, outputDir, refuse, latest }) => {
  const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
  if (busyWith({ groupIds: requestedGroups, destination: data.destination }) === 'uploading')
    return refuse('It is being uploaded — process it again once the upload is done.')
  try {
    await processJumps({
      manifestPath,
      outputDir,
      groupIds: requestedGroups && requestedGroups.length > 0 ? requestedGroups : undefined,
      destination: data.destination,
      fileIds: data.fileIds
    })
  } catch (e) {
    return refuse(messageOf(e))
  }
  return boardAnswer(await latest())
}

/* a page that came back while something was being processed waits here for it to finish */
const processWait: Intent = async ({ latest }) => {
  await whenProcessed()
  return boardAnswer(await latest())
}

/* Stops what is being processed, and answers once it has stopped, with the board as the run left
   it: the copies already finished stay on the disk, and nothing of the run counts as processed. */
const cancelProcess: Intent = async ({ refuse, latest }) => {
  if (!cancelProcessing()) return refuse('Nothing is being processed.')
  await whenProcessed()
  return { ...boardAnswer(await latest()), processCancelled: true }
}

export { cancelProcess, processIntent, processWait }
