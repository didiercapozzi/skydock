import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { FileStatus } from '@skydock/scripts'
import { State } from './file-row'

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

const TONE: Record<ShownStatus, string> = {
  local: 'bg-local-soft text-local',
  changed: 'bg-changed-soft text-changed',
  processed: 'bg-proc-soft text-proc',
  uploaded: 'bg-up-soft text-up'
}

const statusName = (status: ShownStatus) => i18n._(LABELS[status])

const StatusChip = ({ status, prepared = false }: { status: ShownStatus; prepared?: boolean }) =>
  prepared && status === 'processed' ? (
    <State
      tone='bg-up-soft text-up'
      dot={false}
      title={i18n._(TITLES[status])}>
      {t`prepared`}
    </State>
  ) : (
    <State
      tone={TONE[status]}
      ring={status === 'changed'}
      title={i18n._(TITLES[status])}>
      {i18n._(LABELS[status])}
    </State>
  )

export { StatusChip, statusName }
export type { ShownStatus }
