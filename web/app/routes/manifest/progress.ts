import { job, runUpload, UploadCancelled } from '@skydock/scripts'
import type { UploadItem } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Change } from './change'
import type { ArchiveProgress } from '../../../../packages/skydock-scripts/src/archive'
import type {
  CheckProgress,
  PlanProgress,
  UploadProgress
} from '../../../../packages/skydock-scripts/src/publish'

/* where each of them is, as a row says it: a zip being made, a file waiting, being sent, sent, already
   up there and skipped, or in the way — a file of that name is up there already */
const rowOf = (item: UploadItem) => ({
  key: item.key,
  name: item.name,
  size: item.size,
  at:
    item.state === 'zipping' || item.state === 'sending'
      ? ('now' as const)
      : item.state === 'zipped' || item.state === 'sent'
        ? ('done' as const)
        : item.state === 'there'
          ? ('skipped' as const)
          : item.state === 'taken' || item.state === 'failed'
            ? ('failed' as const)
            : ('later' as const),
  phase: item.state,
  ...(item.part !== undefined ? { part: item.part } : {}),
  ...(item.to ? { to: item.to } : {}),
  ...(item.state === 'taken' ? { note: 'taken' } : {})
})

const uploadReporter = ({
  label,
  outputDir,
  groupIds = [],
  destinations = []
}: {
  label: string
  outputDir: string
  groupIds?: string[]
  destinations?: string[]
}) => {
  const sending = job({
    type: 'upload',
    label,
    total: 0,
    record: { kind: 'upload', outputDir },
    scope: { groupIds, destinations }
  })
  sending.phase('checking')
  const items = new Map<string, UploadItem>()
  const put = (item: UploadItem) => {
    const now = { ...items.get(item.key), ...item }
    items.set(item.key, now)
    sending.row(rowOf(now))
  }
  const settle = (from: UploadItem['state'], to: UploadItem['state'], but?: string) => {
    for (const item of items.values())
      if (item.state === from && item.key !== but) put({ ...item, state: to, part: undefined })
  }
  return {
    onArchive: (archive: ArchiveProgress & { name: string }) => {
      const key = `zip:${archive.name}`
      settle('zipping', 'zipped', key)
      sending.phase('archiving', archive.name)
      put({
        key,
        name: archive.name,
        size: archive.totalBytes,
        state: 'zipping',
        part: archive.totalBytes > 0 ? archive.bytes / archive.totalBytes : 0
      })
    },
    onCheck: (check: CheckProgress) => {
      settle('zipping', 'zipped')
      sending.expect(check.total)
      sending.at(check.checked)
      sending.phase('checking', check.filename)
    },
    onPlan: (plan: PlanProgress) => {
      for (const key of [...items.keys()]) if (key.startsWith('zip:')) items.delete(key)
      const listed = (state: UploadItem['state'], files: PlanProgress['send']) => {
        for (const file of files)
          items.set(`${file.to}/${file.name}`, {
            key: `${file.to}/${file.name}`,
            name: file.name,
            size: file.size,
            to: file.to,
            state
          })
      }
      listed('waiting', plan.send)
      listed('taken', plan.taken)
      listed('there', plan.there)
      sending.rows([...items.values()].map(rowOf))
      sending.phase('checking')
    },
    onProgress: (p: UploadProgress & { groupIds: string[] }) => {
      const key = `${p.to ?? ''}/${p.filename}`
      settle('sending', 'sent', key)
      const whole = p.totalBytes > 0 && p.bytesUploaded >= p.totalBytes
      sending.expect(p.totalFiles ?? 0)
      sending.at(p.fileIndex ?? 0)
      sending.phase('uploading', p.filename)
      put({
        key,
        name: p.filename,
        size: p.totalBytes,
        to: p.to,
        state: whole ? 'sent' : 'sending',
        part: whole ? undefined : p.totalBytes > 0 ? p.bytesUploaded / p.totalBytes : 0
      })
    },
    done: () => {
      settle('sending', 'sent')
      sending.finish()
    },
    failed: (error: string) => {
      settle('sending', 'failed')
      sending.fail(error)
    },
    cancelled: () => {
      settle('sending', 'waiting')
      settle('zipping', 'waiting')
      sending.finish({ outcome: { state: 'stopped', copied: 0, skipped: 0 } })
    }
  }
}

type UploadReport = ReturnType<typeof uploadReporter>

const reportedUpload = async <T>(
  {
    key,
    label,
    groupIds,
    outputDir,
    latest,
    refuse
  }: { key: string; label: string; groupIds: string[] } & Pick<
    Change,
    'outputDir' | 'latest' | 'refuse'
  >,
  send: (report: UploadReport) => Promise<T>
) => {
  try {
    return await runUpload({ key, label, groupIds }, async () => {
      const report = uploadReporter({ label, outputDir, groupIds })
      try {
        return await send(report)
      } catch (err) {
        if (err instanceof UploadCancelled) report.cancelled()
        else report.failed(err instanceof Error ? err.message : 'Upload failed.')
        throw err
      }
    })
  } catch (err) {
    if (err instanceof UploadCancelled)
      return { ...(await boardAnswer(await latest())), uploadCancelled: true }
    return refuse(err instanceof Error ? err.message : 'Upload failed.')
  }
}

export { reportedUpload, uploadReporter }
export type { UploadReport }
