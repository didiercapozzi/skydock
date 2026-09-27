import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
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
  processed: msg`Processed, not on the NAS yet`,
  uploaded: msg`On the NAS`
}

/* Each state keeps its own colour and the tint made for it. Only `changed` is outlined, because it
   is the one that is asking to be dealt with rather than simply reporting where a file has got to. */
const CHIP: Record<ShownStatus, string> = {
  local: 'bg-local-soft text-local px-[7px]',
  changed: 'bg-changed-soft text-changed border border-dashed border-changed-line px-1.5',
  processed: 'bg-proc-soft text-proc px-[7px]',
  uploaded: 'bg-up-soft text-up px-[7px]'
}

const StatusChip = ({ status }: { status: ShownStatus }) => (
  <span
    title={i18n._(TITLES[status])}
    className={`rounded-full py-px text-[10px] font-semibold tracking-[0.04em] uppercase ${CHIP[status]}`}>
    {i18n._(LABELS[status])}
  </span>
)

export { StatusChip }
export type { ShownStatus }
