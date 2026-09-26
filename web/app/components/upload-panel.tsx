import type { UploadItem, UploadProgressState } from '@skydock/scripts'
import { Mini } from './buttons'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'
import { formatSize, plural } from './utils'

/* What an upload is sending, while it is (RULES, Uploading): every zip as it is made, then every
   file going to every folder up there, and where each has got to — shown from whatever page is open,
   in the same corner and the same shape as files being copied in. It can be stopped at any moment:
   nothing of it is recorded, and what already went up is found there next time. */

const base = (item: UploadItem, where: string) => ({
  key: item.key,
  name: item.name,
  size: item.size,
  part: item.part,
  title: where
})

const rowOf = (item: UploadItem): ProgressRow => {
  const where = item.to ? `${item.to}/${item.name}` : item.name
  switch (item.state) {
    case 'zipping':
      return {
        ...base(item, where),
        at: 'now',
        doing: 'Zipping',
        note: `zipping · ${percent(item)}`
      }
    case 'zipped':
      return { ...base(item, where), at: 'done', note: 'zipped' }
    case 'sending':
      return { ...base(item, where), at: 'now', doing: 'Sending' }
    case 'sent':
      return { ...base(item, where), at: 'done' }
    case 'there':
      return { ...base(item, where), at: 'skipped', note: 'already there' }
    case 'failed':
      return { ...base(item, where), at: 'failed', note: 'not sent' }
    default:
      return { ...base(item, where), at: 'later' }
  }
}

const percent = (item: UploadItem) => `${Math.round((item.part ?? 0) * 100)}%`

/* said under the list while nothing, or not everything, is listed yet */
const phaseOf = (progress: UploadProgressState) =>
  progress.state === 'checking'
    ? progress.totalFiles > 0
      ? `Looking at what the storage holds — ${progress.checked ?? 0} of ${progress.totalFiles}`
      : 'Looking at what the storage holds…'
    : progress.state === 'archiving'
      ? 'Making the zips…'
      : progress.state === 'cancelled'
        ? 'Cancelled — nothing was recorded'
        : progress.state === 'error'
          ? (progress.error ?? 'The upload stopped')
          : progress.state === 'done'
            ? 'Done'
            : null

const UploadPanel = ({
  label,
  progress,
  cancelling,
  onCancel
}: {
  /* what is being uploaded, named as the board names it */
  label: string
  progress: UploadProgressState | null
  cancelling: boolean
  onCancel: () => void
}) => {
  const items = progress?.items ?? []
  const rows = items.map(rowOf)
  const finished = rows.filter((r) => r.at !== 'now' && r.at !== 'later').length
  const underWay = rows.find((r) => r.at === 'now')?.part ?? 0
  const through = rows.length > 0 ? Math.min(1, (finished + underWay) / rows.length) : 0
  const bytes = items.reduce((sum, item) => sum + item.size, 0)
  const phase = progress ? phaseOf(progress) : 'Starting…'
  return (
    <ProgressPanel
      label={`Uploading ${label}`}
      title={`Uploading ${label}`}
      barLabel={`Uploaded of ${label}`}
      doing='Sending'
      barTitle={`${finished} of ${plural(rows.length, 'item')} on the storage — ${formatSize(bytes)} in all`}
      through={through}
      rows={rows}
      footer={
        <>
          <span className='min-w-0 flex-1 truncate text-ink-2'>{phase}</span>
          <Mini
            disabled={cancelling}
            title='Stop it now — nothing of it is recorded, and what already went up is found there next time'
            onClick={onCancel}>
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Mini>
        </>
      }
    />
  )
}

export { UploadPanel }
