import { t } from '@lingui/core/macro'
import { tokenFor } from '../helpers/import'
import type { Coming } from '../helpers/import'
import { useImporting } from '../hooks/liveStore'
import { ProgressPanel } from './progress-panel'
import { formatSize } from './utils'

const ImportPanel = ({
  where,
  files,
  done,
  failed
}: {
  where: string
  files: Coming[]
  done: number
  failed: number
}) => {
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
