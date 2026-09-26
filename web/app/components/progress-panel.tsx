import { formatSize } from './utils'

/* The panel in the corner that says what is on its way and how far it has got — files being copied
   in, an upload going out. One look for both, so either is recognised before it is read: a title and
   a count, a bar across the whole, then every item with a mark for where it is, and the one under way
   with a bar of its own. It is not a question; the work is already running. */

type Row = {
  key: string
  name: string
  size: number
  /* done, under way, or still to come — and within done, skipped as already there, or failed */
  at: 'done' | 'now' | 'later' | 'skipped' | 'failed'
  /* how far the one under way has got, between 0 and 1 */
  part?: number
  /* said in place of its size, when there is more to say */
  note?: string
  /* shown when the name is pointed at */
  title?: string
  /* what is being done to the one under way, when it is not what the panel does to all of them */
  doing?: string
}

const MARK: Record<Row['at'], string> = {
  done: '✓',
  now: '›',
  later: '·',
  skipped: '=',
  failed: '✕'
}

const ProgressPanel = ({
  label,
  title,
  rows,
  through,
  barLabel,
  barTitle,
  doing,
  footer
}: {
  /* what the panel is, read out */
  label: string
  title: string
  rows: Row[]
  /* the whole, between 0 and 1, counting the one under way for as much of itself as is done */
  through: number
  barLabel: string
  barTitle: string
  /* what is done to each, said of the one under way: copying it, sending it */
  doing: string
  footer?: React.ReactNode
}) => {
  const finished = rows.filter((r) => r.at === 'done' || r.at === 'skipped' || r.at === 'failed')
  const current = rows.findIndex((r) => r.at === 'now')
  return (
    <aside
      aria-label={label}
      className='flex max-h-[min(420px,60vh)] w-[min(340px,calc(100vw-2rem))] flex-col rounded-lg border border-line bg-pane shadow-card'>
      <div className='flex items-baseline gap-2 border-b border-line px-3 py-2'>
        <span className='min-w-0 flex-1 truncate text-[12px] font-semibold text-ink'>{title}</span>
        {rows.length > 0 && (
          <span className='flex-none font-mono text-[11px] text-ink-3 tabular-nums'>
            {Math.min((current === -1 ? finished.length : current) + 1, rows.length)}/{rows.length}
          </span>
        )}
      </div>

      <div
        role='progressbar'
        aria-label={barLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(through * 100)}
        title={barTitle}
        className='mx-3 mt-2 flex h-[4px] flex-none overflow-hidden rounded-sm bg-line-2'>
        <i
          className='block h-full bg-local transition-[width] duration-200'
          style={{ width: `${Math.round(through * 100)}%` }}
        />
      </div>

      <ol className='mt-1 min-h-0 flex-1 overflow-y-auto px-3 py-1.5'>
        {rows.map((row) => (
          <li
            key={row.key}
            className={`py-[2px] text-[12px] ${
              row.at === 'now'
                ? 'text-ink'
                : row.at === 'later'
                  ? 'text-ink-3/70'
                  : row.at === 'failed'
                    ? 'text-local'
                    : 'text-ink-3'
            }`}>
            <span className='flex items-baseline gap-2'>
              <span
                aria-hidden='true'
                className='w-3 flex-none text-center'>
                {MARK[row.at]}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${row.at === 'now' ? 'font-semibold' : ''}`}
                title={row.title ?? row.name}>
                {row.name}
              </span>
              <span className='flex-none font-mono text-[10.5px] tabular-nums'>
                {row.note ??
                  (row.at === 'now' && (row.part ?? 0) > 0
                    ? `${Math.round((row.part ?? 0) * 100)}% of ${formatSize(row.size)}`
                    : formatSize(row.size))}
              </span>
            </span>
            {/* The one under way gets a bar of its own. The bar above is the whole, where a single
                file of fifty moves it by two hundredths and looks like nothing happening — this is
                the file itself, from nothing to full. */}
            {row.at === 'now' && (
              <span
                role='progressbar'
                aria-label={`${row.doing ?? doing} ${row.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((row.part ?? 0) * 100)}
                className='mt-[3px] mb-[2px] ml-[20px] flex h-[3px] overflow-hidden rounded-sm bg-line-2'>
                <i
                  className='block h-full bg-accent transition-[width] duration-200'
                  style={{ width: `${Math.round((row.part ?? 0) * 100)}%` }}
                />
              </span>
            )}
          </li>
        ))}
      </ol>

      {footer && (
        <div className='flex flex-none items-center gap-2 border-t border-line px-3 py-1.5 text-[11px]'>
          {footer}
        </div>
      )}
    </aside>
  )
}

export { ProgressPanel }
export type { Row as ProgressRow }
