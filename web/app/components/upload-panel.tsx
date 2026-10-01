import { plural, t } from '@lingui/core/macro'
import type { UploadItem, UploadProgressState } from '@skydock/scripts'
import { Mini } from './buttons'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'
import { dsmFolderUrl } from '../helpers/dsm'
import { formatSize } from './utils'

/* What an upload is sending, while it is (RULES, Uploading): every zip as it is made, then every
   file going to every folder up there, and where each has got to — shown from whatever page is open,
   in the same corner and the same shape as files being copied in. It can be stopped at any moment:
   nothing of it is recorded, and what already went up is found there next time. */

const base = (item: UploadItem, where: string, dsmHost?: string | null) => ({
  key: item.key,
  name: item.name,
  size: item.size,
  part: item.part,
  title: where,
  /* a file that is up there, or in the way — not one still waiting or going: its folder in the
     storage's own interface, once it is */
  ...(dsmHost &&
  item.to &&
  (item.state === 'sent' || item.state === 'there' || item.state === 'taken')
    ? { href: dsmFolderUrl(dsmHost, where) ?? undefined }
    : {})
})

const rowOf = (item: UploadItem, dsmHost?: string | null): ProgressRow => {
  const where = item.to ? `${item.to}/${item.name}` : item.name
  switch (item.state) {
    case 'zipping':
      return {
        ...base(item, where, dsmHost),
        at: 'now',
        doing: t`Zipping`,
        note: `${t`zipping`} · ${percent(item)}`
      }
    case 'zipped':
      return { ...base(item, where, dsmHost), at: 'done', note: t`zipped` }
    case 'sending':
      return { ...base(item, where, dsmHost), at: 'now', doing: t`Sending` }
    case 'sent':
      return { ...base(item, where, dsmHost), at: 'done' }
    case 'there':
      return {
        ...base(item, where, dsmHost),
        at: 'skipped',
        note: t`already uploaded — not sent again`
      }
    case 'taken':
      return {
        ...base(item, where, dsmHost),
        at: 'failed',
        note: t`already on the storage`,
        ...(dsmHost && item.to
          ? { href: dsmFolderUrl(dsmHost, `${item.to}/${item.name}`) ?? undefined }
          : {})
      }
    case 'failed':
      return { ...base(item, where, dsmHost), at: 'failed', note: t`not sent` }
    default:
      return { ...base(item, where, dsmHost), at: 'later' }
  }
}

const percent = (item: UploadItem) => `${Math.round((item.part ?? 0) * 100)}%`

/* said under the list while nothing, or not everything, is listed yet */
const phaseOf = (progress: UploadProgressState) => {
  const checked = progress.checked ?? 0
  const totalFiles = progress.totalFiles
  return progress.state === 'checking'
    ? totalFiles > 0
      ? t`Looking at what the storage holds — ${checked} of ${totalFiles}`
      : t`Looking at what the storage holds…`
    : progress.state === 'archiving'
      ? t`Making the zips…`
      : progress.state === 'cancelled'
        ? t`Cancelled — nothing was recorded`
        : progress.state === 'error'
          ? (progress.error ?? t`The upload stopped`)
          : progress.state === 'done'
            ? t`Done`
            : null
}

const UploadPanel = ({
  label,
  progress,
  cancelling,
  dsmHost,
  onCancel
}: {
  /* the storage's own address, to show a file that is in the way */
  dsmHost?: string | null
  /* what is being uploaded, named as the board names it */
  label: string
  progress: UploadProgressState | null
  cancelling: boolean
  onCancel: () => void
}) => {
  const items = progress?.items ?? []
  const rows = items.map((item) => rowOf(item, dsmHost))
  const finished = rows.filter((r) => r.at !== 'now' && r.at !== 'later').length
  const bytes = items.reduce((sum, item) => sum + item.size, 0)
  const phase = progress ? phaseOf(progress) : t`Starting…`
  const size = formatSize(bytes)
  const count = rows.length
  return (
    <ProgressPanel
      label={t`Uploading ${label}`}
      icon='upload'
      title={t`Uploading ${label}`}
      barLabel={t`Uploaded of ${label}`}
      doing={t`Sending`}
      barTitle={t`${finished} of ${plural(count, { one: '# item', other: '# items' })} on the storage — ${size} in all`}
      rows={rows}
      summary={phase}
      action={
        <Mini
          disabled={cancelling}
          title={t`Stop it now — nothing of it is recorded, and what already went up is found there next time`}
          onClick={onCancel}>
          {cancelling ? t`Cancelling…` : t`Cancel`}
        </Mini>
      }
    />
  )
}

export { UploadPanel }
