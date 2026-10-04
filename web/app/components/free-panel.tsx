import { t } from '@lingui/core/macro'
import { liveFreeing, useFreeing } from '../hooks/liveStore'
import { Mini } from './buttons'
import { ProgressPanel } from './progress-panel'

/* A montage being freed from this machine, while it is (RULES, Freeing space): first the storage proved to
   hold every file that went up, one at a time, then what is here deleted, one file at a time — both can be
   gigabytes, and a bar that says nothing for minutes looks like a hang. If it is refused, the corner says
   why until it is put away. */
const FreePanel = () => {
  const freeing = useFreeing()
  if (!freeing) return null
  const { label, stage, done, total, name, reason } = freeing
  const failed = stage === 'failed'
  const doing = stage === 'checking' ? t`Checking the storage` : t`Deleting`
  return (
    <ProgressPanel
      label={t`Freeing ${label}`}
      icon='back'
      title={t`Freeing ${label}`}
      barLabel={t`Freed of ${label}`}
      barTitle={t`${done} of ${total} steps`}
      doing={doing}
      rows={
        name ? [{ key: name, name, size: 0, at: failed ? 'failed' : 'now', part: undefined }] : []
      }
      overall={total > 0 ? done / total : 0}
      counted={{ at: done, of: total }}
      summary={
        failed ? (
          <span className='text-local'>{reason}</span>
        ) : stage === 'checking' ? (
          t`Proving the storage holds every file that went up — nothing is deleted before that`
        ) : (
          t`Deleting what is here, and the whole of its folder`
        )
      }
      action={
        failed ? (
          <Mini onClick={() => liveFreeing.update(() => null)}>{t`Dismiss`}</Mini>
        ) : undefined
      }
    />
  )
}

export { FreePanel }
