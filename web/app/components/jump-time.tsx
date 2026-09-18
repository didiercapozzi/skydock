import { useState } from 'react'
import { dateLabel, pad } from './utils'

/* to the second, like every other time on the board: two files a second apart is the whole reason
   the order inside a jump is worth looking at */
const hhmmss = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

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
  disabled,
  onShift,
  hint = 'every file in the jump moves with it',
  tip = 'Wrong camera clock? Set when this jump really started — every file in it moves with it'
}: {
  from: number
  to: number
  /* a jump whose ends fall on different days has to date them, or the figures mean nothing and the
     editor opening on another date looks like a fault */
  withDate?: boolean
  disabled: boolean
  onShift: (anchorEpoch: number) => void
  /* what setting it does — the same editor corrects one file, which moves nothing else */
  hint?: string
  tip?: string
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  /* the full date, year and all: a camera clock that is wrong is as often wrong by a year */
  const show = (at: number) => (withDate ? `${dateLabel(at)} ${hhmmss(at)}` : hhmmss(at))

  if (draft === null)
    return (
      <span
        className='inline-flex flex-wrap items-center gap-1.5'
        title={`This jump runs from ${show(from)} to ${show(to)}`}>
        <button
          type='button'
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            setDraft(toLocalInput(from))
          }}
          title={tip}
          className='cursor-text border-0 bg-transparent p-0 font-mono text-[12.5px] font-semibold text-ink underline decoration-dotted underline-offset-[3px] tabular-nums hover:text-accent disabled:opacity-60'>
          {show(from)}
        </button>
      </span>
    )

  const commit = () => {
    const anchor = fromLocalInput(draft)
    setDraft(null)
    if (anchor !== null && anchor !== from) onShift(anchor)
  }
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='inline-flex flex-wrap items-center gap-[5px]'>
      <input
        type='datetime-local'
        step='1'
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
        className='rounded-[5px] border border-pick bg-pane px-[5px] py-0.5 font-mono text-[12px] text-ink'
      />
      <button
        type='button'
        onClick={commit}
        className='rounded-[5px] border border-accent bg-accent px-3 py-1 text-[12px] font-semibold text-white'>
        Set
      </button>
      <button
        type='button'
        onClick={() => setDraft(null)}
        className='text-[11px] text-ink-3 underline'>
        cancel
      </button>
      <span className='text-[11px] text-ink-3'>{hint}</span>
    </span>
  )
}

export { JumpSpan, fromLocalInput, hhmmss, toLocalInput }
