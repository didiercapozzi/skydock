import type { FileStatus } from '@skydock/scripts'

/* local — only the original exists; nothing has been made from it yet, or what was made is out of
   date because the file was cropped, retimed or replaced since.
   processed — a renamed copy of the current file exists in output/processed.
   uploaded — that copy is on the NAS, proved by a matching md5 (§14.5). */
const LABELS: Record<FileStatus, string> = {
  local: 'local',
  processed: 'processed',
  uploaded: 'uploaded'
}

const TITLES: Record<FileStatus, string> = {
  local: 'Not processed yet — or changed since it was',
  processed: 'Processed, not on the NAS yet',
  uploaded: 'On the NAS'
}

const CHIP: Record<FileStatus, string> = {
  local: 'border-gray-300 bg-gray-100 text-gray-600',
  processed: 'border-amber-300 bg-amber-50 text-amber-800',
  uploaded: 'border-green-300 bg-green-50 text-green-800'
}

const DOT: Record<FileStatus, string> = {
  local: 'bg-gray-400',
  processed: 'bg-amber-500',
  uploaded: 'bg-green-600'
}

const StatusChip = ({ status }: { status: FileStatus }) => (
  <span
    title={TITLES[status]}
    className={`rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium ${CHIP[status]}`}>
    {LABELS[status]}
  </span>
)

const StatusDot = ({ status }: { status: FileStatus }) => (
  <span
    title={TITLES[status]}
    className={`pointer-events-none absolute -top-1 -right-1 h-3 w-3 rounded-full border border-white ${DOT[status]}`}
  />
)

const StatusLegend = () => (
  <span className='flex items-center gap-2 text-[11px] text-gray-500'>
    {(['local', 'processed', 'uploaded'] as const).map((status) => (
      <span
        key={status}
        className='flex items-center gap-1'>
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
        {LABELS[status]}
      </span>
    ))}
  </span>
)

export { StatusChip, StatusDot, StatusLegend }
