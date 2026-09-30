import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
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

/* where each has got to, in the colour the board gives it: done in green, the one under way in
   blue, the rest quiet until they are reached */
const TONE: Record<Row['at'], string> = {
  done: 'text-up',
  now: 'text-accent',
  later: 'text-ink-3',
  skipped: 'text-ink-3',
  failed: 'text-bin'
}

/* how far through one file, said of its size */
const ofSize = (part: number, bytes: number) => {
  const percent = Math.round(part * 100)
  const size = formatSize(bytes)
  return t`${percent}% of ${size}`
}

/* the one under way, read out: what is done to it, and its name */
const underWay = (doing: string, name: string) => t`${doing} ${name}`

const ProgressPanel = ({
  label,
  title,
  icon,
  rows,
  barLabel,
  barTitle,
  doing,
  summary,
  action,
  counted
}: {
  /* what the panel is, read out */
  label: string
  title: string
  /* what kind of work it is, drawn before the title */
  icon: IconName
  rows: Row[]
  barLabel: string
  barTitle: string
  /* what is done to each, said of the one under way: copying it, sending it */
  doing: string
  /* how it is going, in words, under the bar — what the bar says when pointed at, if nothing else */
  summary?: React.ReactNode
  /* the one thing that can be done to the work itself — stop it — kept in view even folded */
  action?: React.ReactNode
  /* how far, counted, when there is no list to count it from yet — `part` of the one under way */
  counted?: { at: number; of: number; part?: number }
}) => {
  /* folded down to its title and its count, for whoever wants the corner back while it runs */
  const [folded, setFolded] = useState(false)
  const finished = rows.filter((r) => r.at === 'done' || r.at === 'skipped' || r.at === 'failed')
  const current = rows.findIndex((r) => r.at === 'now')
  /* the whole, counting the one under way for as much of itself as is done — so one long file on
     its own is a bar that moves rather than a bar that waits */
  const through =
    rows.length > 0
      ? Math.min(1, (finished.length + (rows[current]?.part ?? 0)) / rows.length)
      : counted && counted.of > 0
        ? Math.min(1, (counted.at + (counted.part ?? 0)) / counted.of)
        : 0
  const percent = Math.round(through * 100)
  const count =
    rows.length > 0
      ? `${Math.min((current === -1 ? finished.length : current) + 1, rows.length)}/${rows.length}`
      : counted
        ? `${counted.at}/${counted.of}`
        : null
  return (
    <aside
      aria-label={label}
      className='flex max-h-[min(440px,60vh)] w-[min(330px,calc(100vw-2rem))] flex-col gap-2 rounded-[18px] bg-pane px-4 py-3.5 text-ink shadow-float'>
      <div className='flex items-center gap-2'>
        <Icon
          name={icon}
          size={15}
          className='text-accent'
        />
        <b
          title={title}
          className='min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-[-0.02em]'>
          {title}
        </b>
        {/* open, the bar and the list say how far; folded, this is all that does */}
        {folded && count && (
          <span className='flex-none font-mono text-[11px] text-ink-3 tabular-nums'>{count}</span>
        )}
        {action}
        <button
          type='button'
          aria-expanded={!folded}
          aria-label={folded ? t`Show the list` : t`Hide the list`}
          title={folded ? t`Show the list` : t`Hide the list`}
          onClick={() => setFolded(!folded)}
          className='grid size-7 flex-none place-items-center rounded-[9px] border-0 bg-well p-0 text-ink-2 hover:bg-line hover:text-ink'>
          <svg
            aria-hidden='true'
            viewBox='0 0 16 16'
            className={`h-3.5 w-3.5 transition-transform duration-150 ${folded ? 'rotate-180' : ''}`}
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'>
            <path d='M4 6l4 4 4-4' />
          </svg>
        </button>
      </div>
      {!folded && (
        <>
          <div
            role='progressbar'
            aria-label={barLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            title={barTitle}
            className='flex h-1 flex-none overflow-hidden rounded-[2px] bg-line'>
            <i
              className='block h-full bg-accent transition-[width] duration-200'
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className='flex items-baseline justify-between gap-3 text-[11.5px] font-medium text-ink-3'>
            <span className='min-w-0'>{summary ?? barTitle}</span>
            <span className='flex-none font-mono tabular-nums'>{percent}%</span>
          </div>

          {rows.length > 0 && (
            <ol className='m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto border-t border-line-2 p-0 pt-[7px] font-mono text-[11px] text-ink-2'>
              {rows.map((row) => (
                <li key={row.key}>
                  <span className='flex items-baseline justify-between gap-3'>
                    <span
                      className={`min-w-0 truncate ${row.at === 'now' ? 'text-ink' : row.at === 'later' ? 'text-ink-3' : ''}`}
                      title={row.title ?? row.name}>
                      {row.name}
                    </span>
                    <span className={`flex-none tabular-nums ${TONE[row.at]}`}>
                      {row.note ??
                        (row.at === 'now' && (row.part ?? 0) > 0
                          ? ofSize(row.part ?? 0, row.size)
                          : formatSize(row.size))}
                    </span>
                  </span>
                  {/* The one under way gets a bar of its own. The bar above is the whole, where a
                      single file of fifty moves it by two hundredths and looks like nothing
                      happening — this is the file itself, from nothing to full. */}
                  {row.at === 'now' && (
                    <span
                      role='progressbar'
                      aria-label={underWay(row.doing ?? doing, row.name)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((row.part ?? 0) * 100)}
                      className='mt-[3px] mb-[2px] flex h-[3px] overflow-hidden rounded-[2px] bg-line'>
                      <i
                        className='block h-full bg-accent transition-[width] duration-200'
                        style={{
                          width: `${Math.round((row.part ?? 0) * 100)}%`
                        }}
                      />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </aside>
  )
}

export { ProgressPanel }
export type { Row as ProgressRow }
