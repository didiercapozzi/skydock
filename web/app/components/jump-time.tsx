import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Go } from './buttons'
import { dateLabel, hhmm, pad } from './utils'

const toLocalInput = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const fromLocalInput = (value: string) => {
  const [date, time] = value.split('T')
  const [year, month, day] = (date ?? '').split('-').map(Number)
  const [hours, minutes, seconds] = (time ?? '').split(':').map(Number)
  if (!year || !month || !day || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const at = new Date(year, month - 1, day, hours, minutes, Number.isFinite(seconds) ? seconds : 0)
  return Math.floor(at.getTime() / 1000)
}

const JumpSpan = ({
  from,
  to,
  withDate,
  big = false,
  disabled,
  onShift,
  hint = t`every file in the jump moves with it`,
  tip = t`Wrong camera clock? Set when this jump really started — every file in it moves with it`
}: {
  from: number
  to: number
  withDate?: boolean
  big?: boolean
  disabled: boolean
  onShift: (anchorEpoch: number) => void
  hint?: string
  tip?: string
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const show = (at: number) => (withDate ? `${dateLabel(at)} ${hhmm(at)}` : hhmm(at))

  const start = show(from)
  const end = show(to)
  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(toLocalInput(from))
  }
  if (draft === null && big)
    return (
      <button
        type='button'
        disabled={disabled}
        onClick={open}
        title={`${tip}\n${t`This jump runs from ${start} to ${end}`}`}
        className='flex items-center gap-2.5 rounded-[10px] border border-line bg-transparent px-2.5 py-1.5 text-left text-ink hover:border-line-strong hover:bg-well disabled:opacity-60'>
        <b className='text-[20px] font-semibold tracking-[-0.02em] tabular-nums'>{hhmm(from)}</b>
        <span className='text-[11.5px] leading-normal text-ink-3'>
          {dateLabel(from)}
          <br />
          {t`click to correct`}
        </span>
      </button>
    )
  if (draft === null)
    return (
      <span
        className='inline-flex flex-wrap items-center gap-1.5'
        title={t`This jump runs from ${start} to ${end}`}>
        <button
          type='button'
          disabled={disabled}
          onClick={open}
          title={tip}
          className='cursor-text border-0 bg-transparent p-0 text-[12.5px] font-medium text-ink underline decoration-dotted underline-offset-[3px] tabular-nums hover:text-accent disabled:opacity-60'>
          {start}
        </button>
      </span>
    )

  const commit = () => {
    const anchor = fromLocalInput(draft)
    setDraft(null)
    if (anchor !== null && anchor !== from) onShift(anchor)
  }
  const [day = '', time = ''] = draft.split('T')
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setDraft(null)
  }
  const field =
    'h-[30px] min-w-0 rounded-[10px] border border-accent bg-pane px-2 text-[12.5px] text-ink tabular-nums'
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='flex flex-wrap items-center gap-1.5'>
      <input
        type='date'
        aria-label={t`Day`}
        autoFocus
        value={day}
        onChange={(e) => setDraft(`${e.target.value}T${time}`)}
        onKeyDown={key}
        className={`${field} min-w-[9.5rem] flex-1`}
      />
      <input
        type='time'
        step='1'
        aria-label={t`Time`}
        value={time}
        onChange={(e) => setDraft(`${day}T${e.target.value}`)}
        onKeyDown={key}
        className={`${field} min-w-[8rem] flex-1`}
      />
      <span className='flex basis-full items-center gap-2'>
        <Go onClick={commit}>{t`Set`}</Go>
        <button
          type='button'
          onClick={() => setDraft(null)}
          className='border-0 bg-transparent p-0 text-[11.5px] text-ink-3 underline hover:text-ink'>
          {t`cancel`}
        </button>
      </span>
      <span className='basis-full text-[11.5px] leading-normal text-ink-3'>{hint}</span>
    </span>
  )
}

export { JumpSpan, fromLocalInput, toLocalInput }
