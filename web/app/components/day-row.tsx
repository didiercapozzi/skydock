import type { StatusContext } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { Mini } from './buttons'
import { FileList, KindBadges, matchesKind } from './file-list'
import type { FileShape, Kind } from './file-list'
import type { ManifestFile, ManifestGroup } from './types'
import { calendarDay, minFileMtime, shortDate } from './utils'

/* A day, open or closed. Unsorted keeps its jumps because the half-hour rule made them and they
   can still be corrected; a dropzone has none, because its files are written flat and a jump means
   nothing once one is filed there. */
type Props = {
  day: string
  label: string
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  open: boolean
  grouped: boolean
  kind: Kind
  shape: FileShape
  picked: string[]
  statusContext: (file: ManifestFile) => StatusContext
  deliveredName: (file: ManifestFile) => string | null
  onToggle: () => void
  onKind: (kind: Kind) => void
  onFile: (file: ManifestFile, lane: ManifestFile[], e: React.MouseEvent) => void
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  onSelectAll: (files: ManifestFile[]) => void
  onShiftJump: (groupId: string, anchorEpoch: number) => void
  onSetTime?: (files: ManifestFile[]) => void
  /* open this day and land on that jump, from a closed day as well as an open one */
  onOpenAt: (day: string, anchor: string) => void
  /* whether a given jump is folded down to its name — the day stays open, its files do not take
     the room. Asked per jump rather than handed a list, because folding is a standing choice with
     exceptions, not a set of ids */
  isJumpShut: (groupId: string) => boolean
  onToggleJump: (groupId: string) => void
  /* picking up a whole jump, to file it somewhere in one go */
  onDragJump: (groupId: string) => void
  groupDropTarget: (groupId: string, scope?: 'group' | 'chip') => Record<string, unknown>
  /* which single thing on the whole board the pointer is over, if anything */
  overTarget: string | null
  /* while a file is in the air every chip is somewhere it can be dropped, and says so */
  dragging: boolean
  action?: React.ReactNode
  strip?: React.ReactNode
  busy: boolean
}

/* The open day's header is pinned, and the jump lines pin directly beneath it. How far beneath is
   the header's own height, measured rather than assumed: it grows with the videos/photos badges, an
   upload strip, or a narrow window wrapping it onto two lines, and a guessed number leaves either a
   strip of the page showing through or a jump line hidden behind the header. */
const DAY_HEAD = 'top-[var(--dayhead,48px)]'
const DAY_HEAD_SCROLL = 'scroll-mt-[var(--dayhead,48px)]'

/* the day's loose files are a place to land, like a jump, but they are not one */
const LOOSE_ANCHOR = 'loose'

const pad = (n: number) => String(n).padStart(2, '0')

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
  onShift
}: {
  from: number
  to: number
  /* a jump whose ends fall on different days has to date them, or the figures mean nothing and the
     editor opening on another date looks like a fault */
  withDate?: boolean
  disabled: boolean
  onShift: (anchorEpoch: number) => void
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const show = (at: number) => (withDate ? `${shortDate(at)} ${hhmmss(at)}` : hhmmss(at))

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
          title='Wrong camera clock? Set when this jump really started — every file in it moves with it'
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
      <span className='text-[11px] text-ink-3'>every file in the jump moves with it</span>
    </span>
  )
}

/* The jumps of a day, as chips: one click lands on that jump, even from a closed day. A dropzone
   has none — its day is one flat run of files — so it shows none. */
const Chip = ({
  children,
  count,
  title,
  dashed,
  dragging,
  over,
  drop,
  onClick
}: {
  children: React.ReactNode
  count: number
  title: string
  dashed?: boolean
  dragging: boolean
  over?: boolean
  drop?: Record<string, unknown>
  onClick: () => void
}) => {
  /* Three states, and they say different things. Dragging: every jump is somewhere this could go,
     drawn as an outline. Over: this is the one it would go to, filled in — without that, holding a
     file over one chip looks exactly like holding it over any other. */
  const look = over
    ? 'border-pick bg-pick text-white'
    : dragging && drop
      ? 'border-dashed border-pick bg-pick-soft text-pick'
      : 'border-line bg-pane text-ink-2 hover:border-accent hover:text-accent'
  return (
    <button
      type='button'
      title={title}
      onClick={onClick}
      {...drop}
      className={`rounded-full border px-2 py-px font-mono text-[11px] tabular-nums ${
        dashed && !over ? 'border-dashed' : ''
      } ${look}`}>
      <b className='font-sans text-[11px] font-semibold'>{children}</b>
      <span className={`ml-1 ${over ? 'text-white/70' : 'text-ink-3'}`}>{count}</span>
    </button>
  )
}

/* A group is named, not timed. "Jump 2" says why these files are together — almost certainly one
   jump — where a bare 09:08 only ever said when. The range beside it keeps the guess checkable.
   The numbers are positions within the day, not identities: ungroup one and the rest renumber. */
const JumpLine = ({
  group,
  index,
  picked,
  shut,
  over,
  draggable,
  onToggle,
  onDrag,
  onSelectAll,
  onShiftJump,
  dropTarget,
  busy
}: {
  group: ManifestGroup
  index: number
  picked: string[]
  shut: boolean
  over: boolean
  /* only where a jump can still be filed: once it is in a dropzone there is nowhere to take it */
  draggable: boolean
  onToggle: () => void
  onDrag: () => void
  onSelectAll: (files: ManifestFile[]) => void
  onShiftJump: (groupId: string, anchorEpoch: number) => void
  dropTarget: Record<string, unknown>
  busy: boolean
}) => {
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const all = group.files.length > 0 && group.files.every((f) => f.id && picked.includes(f.id))
  /* Two bare times are only readable as a span while they are on the same day. A jump that runs
     past midnight, or that holds a file dragged in from another day, has to date both ends. */
  const spansDays = calendarDay(from) !== calendarDay(to)
  return (
    <div
      {...dropTarget}
      draggable={draggable}
      /* only the line itself is the handle — dragging a button inside it would mean something else */
      onDragStart={(e) => {
        if (e.target !== e.currentTarget) return
        e.stopPropagation()
        onDrag()
      }}
      title={
        draggable
          ? 'Drag this line onto a dropzone or Tandems to file the whole jump · drop files here to add them'
          : undefined
      }
      className={`sticky ${DAY_HEAD} ${DAY_HEAD_SCROLL} z-[3] -mx-[9px] flex flex-wrap items-center gap-2 px-[11px] pt-2 pb-[5px] text-[11px] ${
        over ? 'bg-pick-soft text-pick' : 'bg-pane text-ink-3'
      } ${shut ? 'opacity-85' : ''}`}>
      <button
        type='button'
        aria-expanded={!shut}
        title={shut ? 'Show this jump’s files' : 'Fold this jump down to its name'}
        onClick={onToggle}
        className={`w-4 border-0 bg-transparent px-0.5 text-[11px] transition-transform duration-150 ${
          shut ? 'text-ink-3' : 'rotate-90 text-accent'
        }`}>
        ▸
      </button>
      <span className='text-[12.5px] font-semibold text-ink'>Jump {index + 1}</span>
      <JumpSpan
        from={from}
        to={to}
        withDate={spansDays}
        disabled={busy}
        onShift={(at) => onShiftJump(group.id, at)}
      />
      <span className='text-[12px] text-ink-2'>
        {group.files.length} file{group.files.length === 1 ? '' : 's'}
      </span>
      {spansDays && (
        <span
          title='This jump holds files from more than one day — either it ran past midnight, or a camera’s clock is wrong. Setting the start moves every file in it by the same difference.'
          className='cursor-help rounded border border-dashed border-local px-1.5 text-[9.5px] font-semibold tracking-[0.03em] text-local'>
          spans days
        </span>
      )}
      <span className='order-1 h-px flex-1 bg-line-2' />
      <span className='order-2 flex flex-wrap items-center gap-1.5'>
        <Mini onClick={() => onSelectAll(group.files)}>
          {all ? 'Unselect jump' : 'Select jump'}
        </Mini>
      </span>
    </div>
  )
}

const DayRow = ({
  day,
  label,
  groups,
  looseFiles,
  open,
  grouped,
  kind,
  shape,
  picked,
  statusContext,
  deliveredName,
  onToggle,
  onKind,
  onFile,
  onDragFile,
  onSelectAll,
  onShiftJump,
  onSetTime,
  onOpenAt,
  isJumpShut,
  onToggleJump,
  onDragJump,
  groupDropTarget,
  overTarget,
  action,
  strip,
  busy,
  dragging
}: Props) => {
  const files = [...groups.flatMap((g) => g.files), ...looseFiles]
  const visible = files.filter((f) => matchesKind(f, kind))
  const pickedHere = visible.filter((f) => f.id && picked.includes(f.id))
  const everyPicked = visible.length > 0 && pickedHere.length === visible.length
  const ordered = [...groups].sort(
    (a, b) => (minFileMtime(a.files) ?? 0) - (minFileMtime(b.files) ?? 0)
  )
  const rowRef = useRef<HTMLDivElement | null>(null)
  const headRef = useRef<HTMLDivElement | null>(null)

  /* Writing a custom property on the node, not state: the value is only ever read back by CSS, and
     a ResizeObserver keeps it right when the header changes height under us. */
  useEffect(() => {
    const head = headRef.current
    const row = rowRef.current
    if (!head || !row) return
    const sync = () =>
      row.style.setProperty('--dayhead', `${Math.round(head.getBoundingClientRect().height)}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(head)
    return () => observer.disconnect()
  }, [open])

  return (
    <div
      ref={rowRef}
      id={`day-${day}`}
      className='mb-2 rounded-[9px] border border-line bg-pane'>
      <div
        ref={headRef}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, input, a')) return
          onToggle()
        }}
        className={`flex flex-wrap items-center gap-2.5 bg-pane px-3 py-2 ${
          open
            ? 'sticky top-0 z-[4] rounded-t-[9px] border-b border-line-2 shadow-[0_-8px_0_var(--color-ground)]'
            : 'cursor-pointer rounded-[9px] hover:bg-line-2'
        }`}>
        <button
          type='button'
          aria-expanded={open}
          onClick={onToggle}
          className='flex min-w-0 items-center gap-[9px] border-0 bg-transparent py-0.5 text-left'>
          <span
            aria-hidden='true'
            className={`w-3 transition-transform duration-150 ${
              open ? 'rotate-90 text-accent' : 'text-ink-3'
            }`}>
            ▸
          </span>
          <h3 className='text-[13px] font-semibold whitespace-nowrap'>{label}</h3>
          <span className='text-[12px] text-ink-2'>
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
        </button>
        <span className='kindslot'>
          {open && (
            <KindBadges
              files={files}
              kind={kind}
              withAll
              onPick={onKind}
            />
          )}
        </span>
        {grouped && (
          <span className='flex flex-wrap gap-1'>
            {looseFiles.length > 0 && (
              <Chip
                count={looseFiles.length}
                title='Loose files — in this day, not in any jump yet'
                dashed
                dragging={dragging}
                onClick={() => onOpenAt(day, LOOSE_ANCHOR)}>
                ◌ loose
              </Chip>
            )}
            {ordered.map((group, index) => (
              <Chip
                key={group.id}
                count={group.files.length}
                title={`Go to Jump ${index + 1} · ${hhmmss(minFileMtime(group.files) ?? 0)}`}
                dragging={dragging}
                over={overTarget === `chip:${group.id}`}
                drop={groupDropTarget(group.id, 'chip')}
                onClick={() => onOpenAt(day, group.id)}>
                Jump {index + 1}
              </Chip>
            ))}
          </span>
        )}
        <span className='ml-auto flex flex-wrap items-center gap-1.5'>
          {open && (
            <Mini onClick={() => onSelectAll(visible)}>
              {everyPicked ? 'Unselect day' : 'Select day'}
            </Mini>
          )}
          {open && onSetTime && pickedHere.length > 0 && (
            <Mini
              title="Move everything picked by one difference, from the earliest one's time"
              onClick={() => onSetTime(pickedHere)}>
              Set time · {pickedHere.length} file{pickedHere.length === 1 ? '' : 's'}
            </Mini>
          )}
          {action}
        </span>
        {strip && <span className='mt-0.5 flex-[1_1_100%]'>{strip}</span>}
      </div>
      {open && (
        <div className='px-[9px] pb-[9px]'>
          {grouped ? (
            ordered.map((group, index) => (
              <div
                key={group.id}
                id={`at-${group.id}`}
                className={DAY_HEAD_SCROLL}>
                <JumpLine
                  group={group}
                  index={index}
                  picked={picked}
                  shut={isJumpShut(group.id)}
                  over={overTarget === `group:${group.id}`}
                  draggable={grouped}
                  onToggle={() => onToggleJump(group.id)}
                  onDrag={() => onDragJump(group.id)}
                  onSelectAll={onSelectAll}
                  onShiftJump={onShiftJump}
                  dropTarget={groupDropTarget(group.id)}
                  busy={busy}
                />
                {!isJumpShut(group.id) && (
                  <FileList
                    files={group.files}
                    kind={kind}
                    shape={shape}
                    picked={picked}
                    statusContext={statusContext}
                    onFile={onFile}
                    onDragFile={onDragFile}
                    deliveredName={deliveredName}
                    selecting={picked.length > 0}
                  />
                )}
              </div>
            ))
          ) : (
            <FileList
              files={files}
              kind={kind}
              shape={shape}
              picked={picked}
              statusContext={statusContext}
              onFile={onFile}
              onDragFile={onDragFile}
              deliveredName={deliveredName}
              selecting={picked.length > 0}
            />
          )}
          {grouped && looseFiles.length > 0 && (
            <div
              id={`at-${LOOSE_ANCHOR}`}
              className={DAY_HEAD_SCROLL}>
              <div className='mt-3 mb-[5px] flex items-center gap-2 text-[11px] text-ink-3'>
                <span className='font-semibold text-local'>◌ Loose files</span>
                <span className='text-[12px] text-ink-2'>
                  {looseFiles.length} file{looseFiles.length === 1 ? '' : 's'} · not in a jump yet
                </span>
                <span className='h-px flex-1 bg-line-2' />
              </div>
              <FileList
                files={looseFiles}
                kind={kind}
                shape={shape}
                picked={picked}
                statusContext={statusContext}
                onFile={onFile}
                onDragFile={onDragFile}
                deliveredName={deliveredName}
                selecting={picked.length > 0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { DayRow }
