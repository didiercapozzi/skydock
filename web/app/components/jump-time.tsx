import { t } from '@lingui/core/macro'
import { useState } from 'react'
import { Go } from './buttons'
import { dateLabel, hhmm, pad } from './utils'

/* what a datetime-local field wants, in the reader's own timezone */
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

/* When a jump started, and nothing else. Anything more beside a jump's name reads as a second
   answer to the same question; the files below already say where the jump gets to. The full span
   is in the tooltip for the rare time it is wanted.

   The start is what can be corrected — cameras run on their own clocks and some of them are wrong —
   and setting it moves every file in the jump by the same amount, so the order inside it is never
   disturbed (RULES, Times and dates). */
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
  /* a jump whose ends fall on different days has to date them, or the figures mean nothing and the
     editor opening on another date looks like a fault */
  withDate?: boolean
  /* drawn as the one figure its part is about: the time large, the day and what a click does under
     it — where it stands alone rather than in a line of facts */
  big?: boolean
  disabled: boolean
  onShift: (anchorEpoch: number) => void
  /* what setting it does — the same editor corrects one file, which moves nothing else */
  hint?: string
  tip?: string
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  /* the full date, year and all: a camera clock that is wrong is as often wrong by a year */
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
        className='flex items-center gap-2.5 rounded-control border border-line-2 bg-transparent px-2.5 py-1.5 text-left text-ink hover:border-line-strong hover:bg-well disabled:opacity-60'>
        <b className='text-heading font-semibold tracking-title tabular-nums'>{hhmm(from)}</b>
        <span className='text-micro leading-normal text-ink-3'>
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
          className='cursor-text border-0 bg-transparent p-0 text-body font-medium text-ink underline decoration-dotted underline-offset-3 tabular-nums hover:text-accent disabled:opacity-60'>
          {start}
        </button>
      </span>
    )

  const commit = () => {
    const anchor = fromLocalInput(draft)
    setDraft(null)
    if (anchor !== null && anchor !== from) onShift(anchor)
  }
  /* the day and the time are two fields, side by side where there is room and one above the other
     where there is not: a single date-and-time field is too wide for the right-hand panel, and its
     time — the part being corrected — was cut off. The time is the one place seconds are asked for:
     two files a second apart are why the order inside a jump is worth setting right. */
  const [day = '', time = ''] = draft.split('T')
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setDraft(null)
  }
  const field =
    'h-control-sm min-w-0 rounded-control border border-accent bg-pane px-2 text-body text-ink tabular-nums'
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
        className={`${field} min-w-38 flex-1`}
      />
      <input
        type='time'
        step='1'
        aria-label={t`Time`}
        value={time}
        onChange={(e) => setDraft(`${day}T${e.target.value}`)}
        onKeyDown={key}
        className={`${field} min-w-32 flex-1`}
      />
      <span className='flex basis-full items-center gap-2'>
        <Go onClick={commit}>{t`Set`}</Go>
        <button
          type='button'
          onClick={() => setDraft(null)}
          className='border-0 bg-transparent p-0 text-micro text-ink-3 underline hover:text-ink'>
          {t`cancel`}
        </button>
      </span>
      <span className='basis-full text-micro leading-normal text-ink-3'>{hint}</span>
    </span>
  )
}

export { JumpSpan, fromLocalInput, toLocalInput }
