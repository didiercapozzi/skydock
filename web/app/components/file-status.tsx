import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { FileStatus } from '@skydock/scripts'

type ShownStatus = FileStatus | 'changed'

const LABELS: Record<ShownStatus, MessageDescriptor> = {
  local: msg`local`,
  changed: msg`changed`,
  processed: msg`processed`,
  uploaded: msg`uploaded`
}

const TITLES: Record<ShownStatus, MessageDescriptor> = {
  local: msg`Not processed yet`,
  changed: msg`Processed once and changed since — it needs processing again before it can go anywhere`,
  processed: msg`Processed, not on the storage yet`,
  uploaded: msg`On the storage`
}

const CHIP: Record<ShownStatus, string> = {
  local: 'bg-local-soft text-local before:bg-dot-local',
  changed: 'bg-changed-soft text-changed before:shadow-ring-current',
  processed: 'bg-proc-soft text-proc before:bg-current',
  uploaded: 'bg-up-soft text-up before:bg-current'
}

const statusName = (status: ShownStatus) => i18n._(LABELS[status])

const StatusChip = ({ status, prepared = false }: { status: ShownStatus; prepared?: boolean }) =>
  prepared && status === 'processed' ? (
    <span
      title={i18n._(TITLES[status])}
      className='inline-flex h-6 w-max items-center rounded-full bg-up-soft px-3 text-small font-semibold whitespace-nowrap text-up'>
      {t`prepared`}
    </span>
  ) : (
    <span
      title={i18n._(TITLES[status])}
      className={`inline-flex h-6 w-max items-center gap-1.5 rounded-full px-3 text-small font-semibold whitespace-nowrap capitalize before:size-1.5 before:rounded-full before:content-[''] ${CHIP[status]}`}>
      {i18n._(LABELS[status])}
    </span>
  )

export { StatusChip, statusName }
export type { ShownStatus }
