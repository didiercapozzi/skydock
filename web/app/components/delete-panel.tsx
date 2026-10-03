import { plural, t } from '@lingui/core/macro'
import { useDeletingAll } from '../hooks/liveStore'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'

/* Files being deleted off a camera, while they are: each with how far it has got, first read through to
   be proved and then moved into the bin. It is in the corner, whatever page is open, so the camera's
   page can be left while it runs — and when it ends it is kept with the other transfers (RULES,
   Transfers). */
const DeletePanel = () => {
  const deleting = useDeletingAll()
  const entries = Object.entries(deleting)
  if (entries.length === 0) return null
  const made: ProgressRow[] = entries.map(([path, d]) => ({
    key: path,
    name: path.split('/').pop() ?? path,
    size: d.size ?? 0,
    /* waiting its turn to be read is quiet; anything read, proved or moving is under way */
    at:
      d.stage === 'done'
        ? 'done'
        : d.stage === 'failed'
          ? 'failed'
          : d.part > 0 || d.stage !== 'checking'
            ? 'now'
            : 'later',
    part: d.stage === 'done' || d.stage === 'failed' ? undefined : d.part,
    /* what has gone is green, and at the top, so that what is left to go is read from below it */
    tint: d.stage === 'done',
    note:
      d.stage === 'done'
        ? t`moved to the bin`
        : d.stage === 'moving'
          ? t`moving to the bin`
          : d.stage === 'checked'
            ? t`checked — waiting to move`
            : d.stage === 'failed'
              ? t`not deleted`
              : undefined
  }))
  const rows = [...made.filter((r) => r.at === 'done'), ...made.filter((r) => r.at !== 'done')]
  const finished = rows.filter((r) => r.at === 'done').length
  const count = rows.length
  return (
    <ProgressPanel
      label={t`Deleting from the camera`}
      icon='camera'
      title={t`Deleting from the camera`}
      barLabel={t`Deleted from the camera`}
      doing={t`Checking`}
      barTitle={t`${finished} of ${plural(count, { one: '# file', other: '# files' })} deleted`}
      rows={rows}
      overall={entries.reduce((n, [, d]) => n + (d.stage === 'done' ? 1 : d.part), 0) / count}
      counted={{ at: finished, of: count }}
    />
  )
}

export { DeletePanel }
