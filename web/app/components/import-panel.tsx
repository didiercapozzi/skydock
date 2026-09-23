import type { Coming } from '../helpers/import'
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
    <aside
      aria-label={`Adding ${total} to ${where}`}
      className='fixed right-4 bottom-4 z-40 flex max-h-[min(420px,60vh)] w-[min(340px,calc(100vw-2rem))] flex-col rounded-lg border border-line bg-pane shadow-card'>
      <div className='flex items-baseline gap-2 border-b border-line px-3 py-2'>
        <span className='min-w-0 flex-1 truncate text-[12px] font-semibold text-ink'>
          Adding to {where}
        </span>
        <span className='flex-none font-mono text-[11px] text-ink-3 tabular-nums'>
          {Math.min(done + 1, total)}/{total}
        </span>
      </div>

      <div
        role='progressbar'
        aria-label={`Copied into ${where}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        title={`${done} of ${total} copied into the originals — ${formatSize(bytes)} in all`}
        className='mx-3 mt-2 flex h-[4px] flex-none overflow-hidden rounded-sm bg-line-2'>
        <i
          className='block h-full bg-local transition-[width] duration-200'
          style={{ width: `${Math.round(through * 100)}%` }}
        />
      </div>

      <ol className='mt-1 min-h-0 flex-1 overflow-y-auto px-3 py-1.5'>
        {files.map((file, at) => (
          <li
            key={file.what instanceof File ? `${file.name}:${at}` : file.what}
            className={`py-[2px] text-[12px] ${
              at < done ? 'text-ink-3' : at === done ? 'text-ink' : 'text-ink-3/70'
            }`}>
            <span className='flex items-baseline gap-2'>
              <span
                aria-hidden='true'
                className='w-3 flex-none text-center'>
                {at < done ? '✓' : at === done ? '›' : '·'}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${at === done ? 'font-semibold' : ''}`}
                title={file.name}>
                {file.name}
              </span>
              <span className='flex-none font-mono text-[10.5px] tabular-nums'>
                {at === done && reading
                  ? 'reading it…'
                  : at === done && part > 0
                    ? `${Math.round(part * 100)}% of ${formatSize(file.size)}`
                    : formatSize(file.size)}
              </span>
            </span>
            {/* The one being copied gets a bar of its own. The bar above is the whole drop, where a
                single file of fifty moves it by two hundredths and looks like nothing happening —
                this is the file itself, from nothing to full, however many are coming. */}
            {at === done && (
              <span
                role='progressbar'
                aria-label={`Copying ${file.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(part * 100)}
                className='mt-[3px] mb-[2px] ml-[20px] flex h-[3px] overflow-hidden rounded-sm bg-line-2'>
                <i
                  className='block h-full bg-accent transition-[width] duration-200'
                  style={{ width: `${Math.round(part * 100)}%` }}
                />
              </span>
            )}
          </li>
        ))}
      </ol>

      {failed > 0 && (
        <p className='flex-none border-t border-line px-3 py-1.5 text-[11px] text-local'>
          {failed} could not be added — the board will say why when the drop is done.
        </p>
      )}
    </aside>
  )
}

export { ImportPanel }
