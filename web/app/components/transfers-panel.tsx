import { plural, t } from '@lingui/core/macro'
import type { Transfer } from '@skydock/scripts'
import { useState } from 'react'
import { dsmFolderUrl } from '../helpers/dsm'
import { routingEngine } from '../helpers/routing'
import { useTransfers } from '../hooks/useTransfers'
import { Mini } from './buttons'
import { Icon } from './icons'
import type { IconName } from './icons'
import { ProgressRows } from './progress-panel'
import type { ProgressRow } from './progress-panel'
import { dateLabel, hhmm } from './utils'

/* What was sent, copied in and copied off, after the panels that showed it going have gone (RULES,
   Transfers): every transfer the machine kept, the latest first, each saying what it was of, when it
   ended and how — and opened, every item it did something to, where it went and what became of it.
   The same panel shape and the same list of items as while it goes. */

const ICON: Record<Transfer['kind'], IconName> = {
  upload: 'upload',
  import: 'copying',
  camera: 'camera'
}

const rowsOf = (transfer: Transfer, dsmHost?: string | null): ProgressRow[] =>
  transfer.items.map((item, at) => ({
    key: `${item.to ?? ''}/${item.name}:${at}`,
    name: item.name,
    size: item.size,
    at:
      item.result === 'done'
        ? 'done'
        : item.result === 'skipped'
          ? 'skipped'
          : item.result === 'failed'
            ? 'failed'
            : 'later',
    /* a drop says where a file was before it was joined to a second jump; anything else, where it went */
    ...(item.to || item.note ? { title: item.to ? `${item.to}/${item.name}` : item.note } : {}),
    ...(item.result === 'left' ? { note: t`not reached` } : {}),
    /* every file an upload put or found up there, whatever became of it: its folder in the storage's own
       interface, the file chosen in it */
    ...(transfer.kind === 'upload' && dsmHost && item.to
      ? { href: dsmFolderUrl(dsmHost, `${item.to}/${item.name}`) ?? undefined }
      : {}),
    ...(item.note === 'taken' ? { note: t`already on the storage` } : {}),
    ...(item.result === 'skipped' && transfer.kind === 'upload'
      ? { note: t`already uploaded — not sent again` }
      : {})
  }))

/* how it ended, counted: what was done, what was there already, what went wrong or was never reached */
const tally = (transfer: Transfer) => {
  const done = transfer.items.filter((item) => item.result === 'done').length
  const there =
    transfer.items.filter((item) => item.result === 'skipped').length + (transfer.passedOver ?? 0)
  const wrong = transfer.items.filter(
    (item) => item.result === 'failed' || item.result === 'left'
  ).length
  return [
    done > 0 ? t`${done} done` : null,
    there > 0 ? t`${there} already there` : null,
    wrong > 0 ? t`${wrong} not done` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

const outcomeOf = (transfer: Transfer) =>
  transfer.state === 'done'
    ? { word: t`done`, tone: 'text-up' }
    : transfer.state === 'cancelled'
      ? { word: t`cancelled`, tone: 'text-ink-3' }
      : { word: t`failed`, tone: 'text-bin' }

const kindOf = (transfer: Transfer) =>
  transfer.kind === 'upload'
    ? t`Uploaded`
    : transfer.kind === 'import'
      ? t`Copied in`
      : t`Copied off`

const Entry = ({
  transfer,
  dsmHost,
  open,
  onToggle,
  onForget
}: {
  transfer: Transfer
  dsmHost?: string | null
  open: boolean
  onToggle: () => void
  /* this one forgotten, and not the others */
  onForget: () => void
}) => {
  const { word, tone } = outcomeOf(transfer)
  const what = kindOf(transfer)
  const label = transfer.label
  const when = `${dateLabel(transfer.at)} ${hhmm(transfer.at)}`
  const counts = tally(transfer)
  const reason = transfer.reason ?? ''
  const more = transfer.more ?? 0
  return (
    <li className='rounded-[12px] bg-well'>
      <div className='flex items-center'>
        <button
          type='button'
          aria-expanded={open}
          onClick={onToggle}
          className='flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[12px] border-0 bg-transparent px-3 py-2 text-left text-ink'>
          <Icon
            name={ICON[transfer.kind]}
            size={14}
            className='flex-none text-accent'
          />
          <span className='min-w-0 flex-1'>
            <b className='block truncate text-[13px] font-semibold'>
              {what} · {label}
            </b>
            <span className='block truncate text-[11.5px] text-ink-3'>
              {when}
              {counts ? ` · ${counts}` : ''}
            </span>
          </span>
          <span className={`flex-none text-[11.5px] font-semibold ${tone}`}>{word}</span>
          <svg
            aria-hidden='true'
            viewBox='0 0 16 16'
            className={`h-3.5 w-3.5 flex-none text-ink-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'>
            <path d='M4 6l4 4 4-4' />
          </svg>
        </button>
        {/* a button of its own, beside the row and not inside it */}
        <button
          type='button'
          aria-label={t`Forget ${what} · ${label}`}
          title={t`Forget this one — nothing that was sent or copied is touched`}
          onClick={onForget}
          className='mr-1.5 grid size-7 flex-none place-items-center rounded-[9px] border-0 bg-transparent p-0 text-ink-3 hover:bg-line hover:text-ink'>
          <Icon
            name='close'
            size={13}
          />
        </button>
      </div>
      {open && (
        <div className='flex flex-col gap-1.5 px-3 pb-3'>
          {reason && (
            <div className='flex flex-col gap-1'>
              <p className='m-0 text-[12px] text-bin'>{reason.split('\n')[0]}</p>
              {/* what the storage itself said, apart and quiet: for whoever has to look into it */}
              {reason.includes('\n') && (
                <p className='m-0 font-mono text-[10.5px] break-all text-ink-3'>
                  {reason.slice(reason.indexOf('\n') + 1)}
                </p>
              )}
            </div>
          )}
          {transfer.items.length > 0 ? (
            <ProgressRows
              rows={rowsOf(transfer, dsmHost)}
              doing={t`Sending`}
              opened
            />
          ) : (
            <p className='m-0 text-[12px] text-ink-3'>
              {plural(transfer.passedOver ?? 0, {
                one: 'Nothing was done: # was there already.',
                other: 'Nothing was done: # were there already.'
              })}
            </p>
          )}
          {more > 0 && (
            <p className='m-0 text-[11.5px] text-ink-3'>
              {plural(more, {
                one: '… and # more, not listed here.',
                other: '… and # more, not listed here.'
              })}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

const TransfersPanel = ({
  stamp,
  dsmHost,
  onClose
}: {
  stamp: string
  /* the storage's own address, to show a file that was in the way */
  dsmHost?: string | null
  onClose: () => void
}) => {
  const { transfers, forget, forgetOne } = useTransfers(stamp)
  /* the latest is open, for whoever came to see what just happened */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)
  const first = transfers?.[0]?.id ?? null
  const opened = chosen === undefined ? first : chosen
  const forgetThis = async (id: string) => {
    await routingEngine
      .action({ url: '/api/transfers', actionArgs: { remove: id } })
      .catch(() => null)
    forgetOne(id)
  }
  const clear = async () => {
    await routingEngine
      .action({ url: '/api/transfers', actionArgs: { clear: true } })
      .catch(() => null)
    forget()
  }
  return (
    <aside
      aria-label={t`Transfers`}
      className='flex max-h-[min(78vh,720px)] w-[min(560px,calc(100vw-2rem))] flex-col gap-2 rounded-[18px] bg-pane px-4 py-3.5 text-ink shadow-float'>
      <div className='flex items-center gap-2'>
        <Icon
          name='upload'
          size={15}
          className='text-accent'
        />
        <b className='min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-[-0.02em]'>
          {t`Transfers`}
        </b>
        {transfers && transfers.length > 0 && (
          <Mini
            title={t`Forget what is listed here — nothing that was sent or copied is touched`}
            onClick={() => void clear()}>
            {t`Clear`}
          </Mini>
        )}
        <button
          type='button'
          aria-label={t`Close`}
          title={t`Close`}
          onClick={onClose}
          className='grid size-7 flex-none place-items-center rounded-[9px] border-0 bg-well p-0 text-ink-2 hover:bg-line hover:text-ink'>
          <Icon
            name='close'
            size={13}
          />
        </button>
      </div>
      {transfers === null ? (
        <p className='m-0 text-[12.5px] text-ink-3'>{t`Looking…`}</p>
      ) : transfers.length === 0 ? (
        <p className='m-0 rounded-[12px] border border-dashed border-line-strong px-3 py-4 text-center text-[12.5px] text-ink-3'>
          {t`Nothing has been sent or copied yet — each upload, drop and camera copy is listed here once it is done.`}
        </p>
      ) : (
        <ol className='m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-0'>
          {transfers.map((transfer) => (
            <Entry
              key={transfer.id}
              transfer={transfer}
              dsmHost={dsmHost}
              open={opened === transfer.id}
              onToggle={() => setChosen(opened === transfer.id ? null : transfer.id)}
              onForget={() => void forgetThis(transfer.id)}
            />
          ))}
        </ol>
      )}
    </aside>
  )
}

export { TransfersPanel }
