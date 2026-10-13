import { ensureNasSession, pastCancelling, planOf } from '@skydock/scripts'
import { uploadFiles } from '../../../../packages/skydock-scripts/src/uploadItems'
import { boardAnswer } from '../../helpers/manifest'
import { connectFirst } from './change'
import type { Intent } from './change'
import { reportedUpload } from './progress'
import type { UploadReport } from './progress'

/* Picked files go up as the plan says, the way a montage does, and leave nothing on the board but the
   transfers panel's line (RULES, Sending picked files). */
const sendFilesIntent: Intent = async ({ data, manifest, outputDir, refuse, latest }) => {
  const picked = new Set(data.fileIds ?? [])
  if (picked.size === 0) return refuse('Pick the files to send first.')
  const files = [
    ...new Map(
      [...manifest.files, ...manifest.groups.flatMap((g) => g.files)]
        .filter((f) => f.id && picked.has(f.id))
        .map((f) => [f.id, f])
    ).values()
  ]
  if (files.length === 0) return refuse('Those files are not on the board any more.')
  const session = await ensureNasSession()
  if (!session) return refuse(connectFirst())
  const name = data.name?.trim() || 'files'
  const send = async (report: UploadReport) => {
    const result = await uploadFiles({
      outputDir,
      manifest,
      files,
      name,
      session,
      plan: planOf(data.plan),
      onArchive: report.onArchive,
      onCheck: report.onCheck,
      onPlan: report.onPlan,
      onProgress: report.onProgress
    })
    report.done()
    return pastCancelling(async () => ({
      ...(await boardAnswer(await latest())),
      uploaded: result.uploaded,
      skipped: result.skipped,
      ...(result.originsProblem ? { storageProblem: result.originsProblem } : {})
    }))
  }
  return reportedUpload(
    { key: `files:${name}`, label: name, groupIds: [], outputDir, latest, refuse },
    send
  )
}

export { sendFilesIntent }
