import { plural, t } from '@lingui/core/macro'
import { useBringing, useCameraCopy, useDeletingAll, useLiveProxies } from '../hooks/liveStore'
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

const RunningNow = ({
  uploading,
  importing,
  proxies
}: {
  /* the upload going out, named as the board names it, and how far through its bytes */
  uploading: { label: string; part: number } | null
  /* files being copied in from the computer */
  importing: { where: string; done: number; total: number } | null
  /* the small copies of the clips, how many are made out of how many want one */
  proxies?: { ready: number; total: number; waiting: number }
}) => {
  const camera = useCameraCopy()
  const bringing = useBringing()
  const deleting = Object.values(useDeletingAll())
  const making = useLiveProxies()
  const going: Going[] = []
  if (uploading) {
    const label = uploading.label
    going.push({
      key: 'upload',
      icon: 'upload',
      label: t`Uploading ${label}`,
      detail: `${Math.round(uploading.part * 100)}%`,
      part: uploading.part
    })
  }
  if (importing) {
    const { where, done, total } = importing
    going.push({
      key: 'import',
      icon: 'copying',
      label: t`Copying in ${where}`,
      detail: t`${done} of ${plural(total, { one: '# file', other: '# files' })}`,
      part: total > 0 ? done / total : 0
    })
  }
  if (camera) {
    const name = camera.camera
    const { done, total } = camera
    going.push({
      key: 'camera',
      icon: 'camera',
      label: t`Copying ${name}`,
      detail: t`${done} of ${plural(total, { one: '# file', other: '# files' })}`,
      part: total > 0 ? (done + (camera.part ?? 0)) / total : 0
    })
  }
  if (bringing && bringing.state === 'going') {
    const name = bringing.name
    going.push({
      key: 'bring',
      icon: 'back',
      label: t`Bringing back ${name}`,
      detail: `${Math.round(bringing.part * 100)}%`,
      part: bringing.part
    })
  }
  const left = deleting.filter((d) => d.stage !== 'done' && d.stage !== 'failed')
  if (deleting.length > 0 && left.length > 0) {
    const all = deleting.length
    const part = deleting.reduce((n, d) => n + (d.stage === 'done' ? 1 : d.part), 0) / all
    going.push({
      key: 'delete',
      icon: 'camera',
      label: t`Deleting from the camera`,
      detail: plural(all, { one: '# file', other: '# files' }),
      part
    })
  }
  if (proxies && (proxies.waiting > 0 || making.length > 0)) {
    const { ready, total } = proxies
    going.push({
      key: 'proxies',
      icon: 'play',
      label: t`Making small copies`,
      detail: t`${ready} of ${total}`,
      part: total > 0 ? (ready + (making[0] ? making[0].percent / 100 : 0)) / total : 0
    })
  }
  if (going.length === 0) return null
  return (
    <ul
      aria-label={t`Going now`}
      className='m-0 flex list-none flex-col gap-1.5 p-0'>
      {going.map((work) => (
        <li
          key={work.key}
          className='flex flex-col gap-1.5 rounded-[12px] bg-accent-soft px-3 py-2'>
          <span className='flex items-center gap-2.5 text-[13px] font-semibold text-accent-ink'>
            <Icon
              name={work.icon}
              size={14}
              className='flex-none'
            />
            <span className='min-w-0 flex-1 truncate'>{work.label}</span>
            <span className='flex-none text-[11.5px] tabular-nums'>{work.detail}</span>
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
