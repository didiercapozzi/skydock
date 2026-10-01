import { t } from '@lingui/core/macro'
import { liveBringing, useBringing } from '../hooks/liveStore'
import { Mini } from './buttons'
import { ProgressPanel } from './progress-panel'
import { formatSize } from './utils'

/* A file being fetched back from the storage onto this machine, while it is: its name and how far through
   it is, as the server says it while the bytes land. It is not a question — the fetch is already
   running — and when it ends it is kept with the other transfers, to be opened there (RULES, Transfers).
   One that failed stays here, saying why, until the next one starts. */
const BringPanel = () => {
  const bringing = useBringing()
  if (!bringing) return null
  const { name, size, part, state, reason } = bringing
  const failed = state === 'failed'
  const bytes = formatSize(size)
  return (
    <ProgressPanel
      label={t`Bringing back ${name}`}
      icon='back'
      title={t`Bringing back from the storage`}
      barLabel={t`Brought back of ${name}`}
      doing={t`Fetching`}
      barTitle={t`${name} — ${bytes}`}
      rows={[
        {
          key: name,
          name,
          size,
          at: failed ? 'failed' : 'now',
          part: failed ? undefined : part,
          note: failed ? t`not brought back` : undefined
        }
      ]}
      summary={failed ? <span className='text-local'>{reason}</span> : undefined}
      action={
        failed ? (
          <Mini onClick={() => liveBringing.update(() => null)}>{t`Dismiss`}</Mini>
        ) : undefined
      }
    />
  )
}

export { BringPanel }
