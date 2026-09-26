import type { Coming } from '../helpers/import'
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
  failed,
  part,
  reading
}: {
  /* the folder they are going into, named as the board names it */
  where: string
  files: Coming[]
  /* how many are copied in, which is also which one is being copied now */
  done: number
  failed: number
  /* how far through the one being copied, between 0 and 1, where the server is saying */
  part: number
  /* its bytes have landed and it is being read — its date, and the name it will be known by */
  reading: boolean
}) => {
  const total = files.length
  const bytes = files.reduce((sum, file) => sum + file.size, 0)
  /* the whole drop, counting the file under way for as much of itself as has landed — so one long
     clip on its own is a bar that moves rather than a bar that waits */
  const through = total > 0 ? Math.min(1, (done + part) / total) : 0
  return (
    <ProgressPanel
      label={`Adding ${total} to ${where}`}
      title={`Adding to ${where}`}
      barLabel={`Copied into ${where}`}
      doing='Copying'
      barTitle={`${done} of ${total} copied into the originals — ${formatSize(bytes)} in all`}
      through={through}
      rows={files.map((file, at) => ({
        key: file.what instanceof File ? `${file.name}:${at}` : file.what,
        name: file.name,
        size: file.size,
        at: at < done ? 'done' : at === done ? 'now' : 'later',
        part: at === done ? part : undefined,
        note: at === done && reading ? 'reading it…' : undefined
      }))}
      footer={
        failed > 0 ? (
          <span className='text-local'>
            {failed} could not be added — the board will say why when the drop is done.
          </span>
        ) : undefined
      }
    />
  )
}

export { ImportPanel }
