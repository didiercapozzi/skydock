import { t } from '@lingui/core/macro'
import { useJobs } from '../hooks/liveStore'
import { bytesPartOf, looksOf, partOf } from './jobs-panel'
import { Icon } from './icons'
import type { IconName } from './icons'

/* What is going right now, at the head of the transfers: each piece of work with how far it has got,
   so the whole of what the machine is doing is in one place — and stays there whatever page is open,
   since the work runs on the server and this only watches it. */

type Going = { key: string; icon: IconName; label: string; detail: string; part: number }

const Bar = ({ label, part }: { label: string; part: number }) => {
  const percent = Math.round(Math.min(1, Math.max(0, part)) * 100)
  return (
    <span
      role='progressbar'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className='block h-1.5 overflow-hidden rounded-full bg-line'>
      <span
        className='block h-full rounded-full bg-accent transition-[width] duration-150'
        style={{ width: `${percent}%` }}
      />
    </span>
  )
}

const RunningNow = () => {
  const going: Going[] = useJobs()
    .filter((job) => job.stage !== 'failed')
    .map((job) => {
      const part = job.type === 'upload' ? bytesPartOf(job) : partOf(job)
      return {
        key: job.id,
        icon: looksOf(job).icon,
        label: looksOf(job).title,
        detail: job.type === 'upload' ? `${Math.round(part * 100)}%` : `${job.done}/${job.total}`,
        part
      }
    })
  if (going.length === 0) return null
  return (
    <ul
      aria-label={t`Going now`}
      className='m-0 flex list-none flex-col gap-1.5 p-0'>
      {going.map((work) => (
        <li
          key={work.key}
          className='flex flex-col gap-1.5 rounded-control bg-accent-soft px-3 py-2'>
          <span className='flex items-center gap-2.5 text-body font-semibold text-accent-ink'>
            <Icon
              name={work.icon}
              size={14}
              className='flex-none'
            />
            <span className='min-w-0 flex-1 truncate'>{work.label}</span>
            <span className='flex-none text-micro tabular-nums'>{work.detail}</span>
          </span>
          <Bar
            label={work.label}
            part={work.part}
          />
        </li>
      ))}
    </ul>
  )
}

export { RunningNow }
