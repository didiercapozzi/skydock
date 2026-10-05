import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import { formatSize } from './utils'

type Row = {
  key: string
  name: string
  size: number
  at: 'done' | 'now' | 'later' | 'skipped' | 'failed'
  part?: number
  note?: string
  title?: string
  href?: string
  doing?: string
  tint?: boolean
}

const TONE: Record<Row['at'], string> = {
  done: 'text-up',
  now: 'text-accent',
  later: 'text-ink-3',
  skipped: 'text-ink-3',
  failed: 'text-bin'
}

const stateOf = (at: Row['at']) =>
  at === 'done'
    ? t`done`
    : at === 'now'
      ? t`under way`
      : at === 'later'
        ? t`waiting`
        : at === 'skipped'
          ? t`already there`
          : t`failed`

const ofSize = (part: number, bytes: number) => {
  const percent = Math.round(part * 100)
  if (bytes <= 0) return `${percent}%`
  const size = formatSize(bytes)
  return t`${percent}% of ${size}`
}

const underWay = (doing: string, name: string) => t`${doing} ${name}`

const ProgressRows = ({ rows, doing, opened }: { rows: Row[]; doing: string; opened: boolean }) => (
  <ol className='m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto border-t border-line-2 p-0 pt-1.75 font-mono text-micro text-ink-2'>
    {rows.map((row) => (
      <li key={row.key}>
        <span className='flex items-baseline gap-3'>
          <span
            className={`min-w-0 flex-1 ${opened ? 'break-all' : 'truncate'} ${row.tint ? TONE[row.at] : row.at === 'now' ? 'text-ink' : row.at === 'later' ? 'text-ink-3' : ''}`}
            title={row.title ?? row.name}>
            {row.name}
          </span>
          {row.href && (
            <a
              href={row.href}
              target='_blank'
              rel='noreferrer'
              title={t`Show its folder in the storage’s own web interface, in a new tab`}
              className='inline-flex h-chip flex-none items-center rounded-full bg-accent px-2.5 font-sans text-micro font-bold whitespace-nowrap text-white no-underline hover:opacity-90'>
              {t`Open in DSM`}
            </a>
          )}
          {opened && row.note !== stateOf(row.at) && (
            <span
              className={`flex-none text-right font-sans text-micro ${row.at === 'skipped' && row.note ? '' : 'w-22'} ${TONE[row.at]}`}>
              {row.at === 'skipped' && row.note ? row.note : stateOf(row.at)}
            </span>
          )}
          <span
            className={`flex-none text-right tabular-nums ${opened ? 'w-18' : ''} ${TONE[row.at]}`}>
            {(opened && row.at === 'skipped' ? undefined : row.note) ??
              (row.at === 'now' && (row.part ?? 0) > 0
                ? ofSize(row.part ?? 0, row.size)
                : row.size > 0
                  ? formatSize(row.size)
                  : '')}
          </span>
        </span>
        {opened && row.title && row.title !== row.name && (
          <span className='block text-micro break-all text-ink-3'>{row.title}</span>
        )}
        {row.at === 'now' && (
          <span
            role='progressbar'
            aria-label={underWay(row.doing ?? doing, row.name)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((row.part ?? 0) * 100)}
            className='mt-0.75 mb-0.5 flex h-0.75 overflow-hidden rounded-bar bg-line'>
            <i
              className={`block h-full bg-accent transition-[width] duration-200`}
              style={{ width: `${Math.round((row.part ?? 0) * 100)}%` }}
            />
          </span>
        )}
      </li>
    ))}
  </ol>
)

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
  counted,
  overall
}: {
  label: string
  title: string
  icon: IconName
  rows: Row[]
  barLabel: string
  barTitle: string
  doing: string
  summary?: React.ReactNode
  action?: React.ReactNode
  counted?: { at: number; of: number; part?: number }
  overall?: number
}) => {
  const [folded, setFolded] = useState(false)
  const [opened, setOpened] = useState(false)
  const finished = rows.filter((r) => r.at === 'done' || r.at === 'skipped' || r.at === 'failed')
  const current = rows.findIndex((r) => r.at === 'now')
  const through =
    overall !== undefined
      ? Math.min(1, Math.max(0, overall))
      : rows.length > 0
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
      className={`flex flex-col gap-2 rounded-panel bg-pane px-4 py-3.5 text-ink shadow-float ${
        opened
          ? 'max-h-[min(78vh,720px)] w-[min(760px,calc(100vw-2rem))]'
          : 'max-h-[min(440px,60vh)] w-[min(330px,calc(100vw-2rem))]'
      }`}>
      <div className='flex items-center gap-2'>
        <Icon
          name={icon}
          size={15}
          className='text-accent'
        />
        <b
          title={title}
          className='min-w-0 flex-1 truncate font-display text-title font-bold tracking-title'>
          {title}
        </b>
        {folded && count && (
          <span className='flex-none font-mono text-micro text-ink-3 tabular-nums'>{count}</span>
        )}
        {action}
        <button
          type='button'
          aria-pressed={opened}
          aria-label={opened ? t`Make it small again` : t`Open it out to see more`}
          title={opened ? t`Make it small again` : t`Open it out to see more`}
          onClick={() => {
            setOpened(!opened)
            setFolded(false)
          }}
          className='tool-button'>
          <Icon
            name={opened ? 'restore' : 'maximise'}
            size={14}
          />
        </button>
        <button
          type='button'
          aria-expanded={!folded}
          aria-label={folded ? t`Show the list` : t`Hide the list`}
          title={folded ? t`Show the list` : t`Hide the list`}
          onClick={() => setFolded(!folded)}
          className='tool-button'>
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
            className='flex h-1 flex-none overflow-hidden rounded-bar bg-line'>
            <i
              className='block h-full bg-accent transition-[width] duration-200'
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className='flex items-baseline justify-between gap-3 text-micro font-medium text-ink-3'>
            <span className='min-w-0'>{summary ?? barTitle}</span>
            <span className='flex-none font-mono tabular-nums'>{percent}%</span>
          </div>

          {rows.length > 0 && (
            <ProgressRows
              rows={rows}
              doing={doing}
              opened={opened}
            />
          )}
        </>
      )}
    </aside>
  )
}

export { ProgressPanel, ProgressRows }
export type { Row as ProgressRow }
