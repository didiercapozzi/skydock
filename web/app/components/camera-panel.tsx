import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import type { CameraCopy } from '../hooks/useLiveProgress'
import { Mini } from './buttons'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'
import { formatSize } from './utils'

/* A camera plugged in and copied off by itself, while it is (RULES, Copying a camera off): in the
   same corner and the same shape as files dropped in and an upload going out — every file on the
   card, which ones are copied, which were here already, and the one under way, filling as its bytes
   land. */
const CameraPanel = ({ copy, onStop }: { copy: CameraCopy; onStop: () => void }) => {
  const [stopping, setStopping] = useState(false)
  const { camera, done, total, copied, skipped } = copy
  const outcomes = copy.outcomes ?? []
  const rows: ProgressRow[] = (copy.files ?? []).map((file, at) => ({
    key: `${file.name}:${at}`,
    name: file.name,
    size: file.size,
    ...(at < done
      ? outcomes[at] === 'skipped'
        ? { at: 'skipped' as const, note: t`already here` }
        : outcomes[at] === 'failed'
          ? { at: 'failed' as const, note: t`could not be read` }
          : { at: 'done' as const }
      : at === done
        ? { at: 'now' as const, part: copy.part ?? 0 }
        : { at: 'later' as const }),
    /* a camera handing its files over says how big each is only when asked */
    ...(file.size === 0 && at >= done ? { note: '' } : {})
  }))
  const bytes = (copy.files ?? []).reduce((n, f) => n + f.size, 0)
  const size = formatSize(bytes)
  return (
    <ProgressPanel
      label={t`Copying ${camera}`}
      title={t`Copying the camera ${camera}`}
      barLabel={t`Copied off ${camera}`}
      doing={t`Copying`}
      barTitle={
        bytes > 0
          ? t`${done} of ${total} gone over — ${size} on the card`
          : t`${done} of ${total} gone over`
      }
      rows={rows}
      counted={{ at: done, of: total, part: copy.part }}
      footer={
        <>
          <span className='min-w-0 flex-1 truncate text-ink-2'>
            {plural(copied, { one: '# new file copied', other: '# new files copied' })}
            {skipped > 0
              ? ` · ${plural(skipped, { one: '# already here', other: '# already here' })}`
              : ''}
            {' · '}
            {t`scanned when done`}
          </span>
          <Mini
            disabled={stopping}
            title={t`Stop after the file under way — what came across stays, the rest stays on the card`}
            onClick={() => {
              setStopping(true)
              onStop()
            }}>
            {stopping ? t`Stopping…` : t`Stop`}
          </Mini>
        </>
      }
    />
  )
}

export { CameraPanel }
