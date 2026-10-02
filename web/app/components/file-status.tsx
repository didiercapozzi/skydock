import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { FileStatus } from '@skydock/scripts'

/* local — only the original exists; nothing has been made from it yet.
   changed — a copy was made and the file has been cropped, retimed or replaced since, so the copy
   is stale. It is not a fourth stored state: it is `local` with a copy already on disk (RULES).
   processed — a renamed copy of the current file exists in output/processed.
   uploaded — that copy is on the NAS, proved by a matching md5 (RULES, File status). */
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

/* Each state a colour on its own tint, with a dot of it before the word, so a column of files reads
   like a report. Only `changed` is outlined — the dot drawn as a ring — because it is the one asking
   to be dealt with rather than simply saying where a file has got to. */
const CHIP: Record<ShownStatus, string> = {
  local: 'bg-local-soft text-local before:bg-current',
  changed: 'bg-changed-soft text-changed before:shadow-[inset_0_0_0_2px_currentColor]',
  processed: 'bg-proc-soft text-proc before:bg-current',
  uploaded: 'bg-up-soft text-up before:bg-current'
}

/* the state in words, for where there is no room for the chip */
const statusName = (status: ShownStatus) => i18n._(LABELS[status])

/* `prepared` is what a montage's copies are called: processed, and nothing is left to do with them but
   go on, so they read as done rather than as waiting to be uploaded */
const StatusChip = ({ status, prepared = false }: { status: ShownStatus; prepared?: boolean }) =>
  prepared && status === 'processed' ? (
    <span
      title={i18n._(TITLES[status])}
      className='inline-flex h-6 w-max items-center rounded-full bg-up-soft px-2.5 text-[12px] font-bold whitespace-nowrap text-up'>
      {t`prepared`}
    </span>
  ) : (
    <span
      title={i18n._(TITLES[status])}
      className={`inline-flex h-[22px] w-max items-center gap-1.5 rounded-full px-[9px] text-[11.5px] font-bold whitespace-nowrap capitalize before:size-1.5 before:rounded-full before:content-[''] ${CHIP[status]}`}>
      {i18n._(LABELS[status])}
    </span>
  )

export { StatusChip, statusName }
export type { ShownStatus }
