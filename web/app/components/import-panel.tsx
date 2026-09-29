import { t } from '@lingui/core/macro'
import { tokenFor } from '../helpers/import'
import type { Coming } from '../helpers/import'
import { useImporting } from '../hooks/liveStore'
import { ProgressPanel } from './progress-panel'
import { formatSize } from './utils'

/* What a drop from the computer is copying in, while it is: the whole list worked out before the
   first byte moved — a folder opened out to everything of ours inside it — and a bar across it, so
   a drop of a card's worth of clips is something to watch rather than something to wait out.

   It is not a question. The copy is already running; this says what it is doing, the way the
   proxies and a camera being copied off do. */
const ImportPanel = ({
  where,
  files,
  done,
  failed
}: {
  /* the folder they are going into, named as the board names it */
  where: string
  files: Coming[]
  /* how many are copied in, which is also which one is being copied now */
  done: number
  failed: number
}) => {
  /* How far through the one being copied, as the server says it while its bytes land — heard here,
     by the panel that shows it, so its ticks draw nothing else — and whether its bytes have landed
     and it is being read: its date, and the name it will be known by. Only ever the one this panel
     is counting. */
  const said = useImporting()
  const watching = said && said.token === tokenFor(done) ? said : null
  const part = watching && watching.total > 0 ? Math.min(1, watching.done / watching.total) : 0
  const reading = watching?.phase === 'reading'
  const total = files.length
  const bytes = files.reduce((sum, file) => sum + file.size, 0)
  const size = formatSize(bytes)
  return (
    <ProgressPanel
      label={t`Adding ${total} to ${where}`}
      icon='copying'
      title={t`Adding to ${where}`}
      barLabel={t`Copied into ${where}`}
      doing={t`Copying`}
      barTitle={t`${done} of ${total} copied into the originals — ${size} in all`}
      rows={files.map((file, at) => ({
        key: file.what instanceof File ? `${file.name}:${at}` : file.what,
        name: file.name,
        size: file.size,
        at: at < done ? 'done' : at === done ? 'now' : 'later',
        part: at === done ? part : undefined,
        note: at === done && reading ? t`reading it…` : undefined
      }))}
      summary={
        failed > 0 ? (
          <span className='text-local'>
            {t`${failed} could not be added — the board will say why when the drop is done.`}
          </span>
        ) : undefined
      }
    />
  )
}

export { ImportPanel }
