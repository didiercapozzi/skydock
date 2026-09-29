import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { droppedIn, fromComputer } from '../helpers/import'
import type { Dropped } from '../helpers/import'
import { placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import type { Grouping } from '../helpers/sections'
import { Seg } from './buttons'
import { kindOf } from './file-list'
import { Icon } from './icons'
import { Notice } from './notice'
import type { Kind } from './file-list'
import type { ManifestFile } from './types'

const GROUPING_LABEL: Record<Grouping, MessageDescriptor> = {
  jump: msg`By jump`,
  day: msg`By day`,
  none: msg`One list`
}

/* how many of a kind, small and grey beside its name */
const Count = ({ n }: { n: number }) => (
  <span className='text-[11px] font-normal text-ink-3 tabular-nums'>{n}</span>
)

/* Videos, photos or both — each with how many the folder holds. Shown on every folder, even where
   one kind is absent, so every head reads the same and says what is in it at a glance. A kind with
   nothing in it is on show but cannot be picked. */
const KindSeg = ({
  files,
  kind,
  onPick
}: {
  files: ManifestFile[]
  kind: Kind
  onPick: (kind: Kind) => void
}) => {
  if (files.length === 0) return null
  const videos = files.filter((f) => kindOf(f) === 'video').length
  const photos = files.length - videos
  const options: [Kind, string, number | null, string][] = [
    ['video', t`Videos`, videos, t`Show only the ${videos} videos`],
    ['photo', t`Photos`, photos, t`Show only the ${photos} photos`],
    ['all', t`All`, null, t`Show everything`]
  ]
  return (
    <span
      role='group'
      aria-label={t`Videos or photos`}
      className='inline-flex h-[30px] gap-px rounded-[7px] border border-line-2 bg-well p-[2px]'>
      {options.map(([value, label, count, title]) => (
        <button
          key={value}
          type='button'
          aria-pressed={kind === value}
          disabled={count === 0 && kind !== value}
          title={title}
          onClick={() => onPick(value)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-[5px] px-[9px] text-[12px] font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-45 ${
            kind === value
              ? 'bg-pane text-ink shadow-[0_1px_2px_rgba(24,24,27,0.08),0_0_0_1px_rgba(24,24,27,0.04)]'
              : 'text-ink-2 hover:text-ink'
          }`}>
          {label}
          {count !== null && <Count n={count} />}
        </button>
      ))}
    </span>
  )
}

/* The folder that is open: its name and what it holds, the folder's own tools at the far end, and
   under them the ways of finding and arranging its files. Under the head, what is left to do there
   and the board's one line of news, which stay put while the files scroll. The pane takes files
   dropped from the computer, for the folder it shows. */
const PlacePane = ({
  place,
  summary,
  files,
  query,
  onQuery,
  grouping,
  kind,
  tools,
  left,
  note,
  incoming,
  onImport,
  children
}: {
  place: Place
  summary: string
  files: ManifestFile[]
  query: string
  onQuery: (query: string) => void
  grouping: {
    value: Grouping
    options: readonly Grouping[]
    onChange: (g: Grouping) => void
  }
  kind: { value: Kind; onChange: (k: Kind) => void }
  /* what else the folder offers — a montage's email, taking a montage back */
  tools?: React.ReactNode
  /* what is still to do here, and anything that belongs to the folder, like its storage folder */
  left?: React.ReactNode
  /* what the board last said, and whether it was a refusal */
  note: { text: string; problem: boolean; onClose: () => void } | null
  /* where a file from the computer dropped anywhere on the pane goes, if anywhere */
  incoming: { target: string; where: string } | null
  onImport: (list: Dropped[], target: string, where: string) => void
  children: React.ReactNode
}) => {
  const browsing = place.kind !== 'storage'
  return (
    <section
      aria-label={placeLabel(place)}
      /* a file let go anywhere on this page joins the folder it shows */
      onDragOver={(e) => {
        if (fromComputer(e) && incoming) e.preventDefault()
      }}
      onDrop={(e) => {
        const carried = fromComputer(e) && incoming ? droppedIn(e) : []
        if (!incoming || carried.length === 0) return
        e.preventDefault()
        onImport(carried, incoming.target, incoming.where)
      }}
      className='backdrop-pane flex min-h-0 min-w-0 flex-col bg-pane'>
      <div className='flex flex-col gap-3 border-b border-line px-4 pt-3 pb-2.5'>
        <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1.5'>
          <h1 className='m-0 text-[17px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink'>
            {placeLabel(place)}
          </h1>
          <span className='text-[12.5px] text-ink-3'>{summary}</span>
          {tools && <span className='ml-auto flex items-center gap-2 self-center'>{tools}</span>}
        </div>
        {browsing && (
          <div className='flex flex-wrap items-center gap-2'>
            <KindSeg
              files={files}
              kind={kind.value}
              onPick={kind.onChange}
            />
            {/* every way of arranging the folder in plain sight, one press each — a place with
                only one way has nothing to choose */}
            {grouping.options.length > 1 && (
              <Seg
                label={t`Group`}
                value={grouping.value}
                options={grouping.options.map((g) => [g, i18n._(GROUPING_LABEL[g])] as const)}
                onPick={grouping.onChange}
              />
            )}
            <label className='flex h-[30px] w-[180px] items-center gap-[7px] rounded-md border border-line px-[9px] text-ink-3 focus-within:border-accent max-[780px]:w-[130px]'>
              <Icon
                name='narrow'
                size={14}
                weight={2}
              />
              <input
                type='text'
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={t`Narrow by name`}
                aria-label={t`Find a file`}
                className='min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3'
              />
            </label>
          </div>
        )}
      </div>

      {(left || note) && (
        <div className='flex flex-col gap-3 px-4 pt-3'>
          {left}
          {note && (
            <Notice
              problem={note.problem}
              onClose={note.onClose}>
              {note.text}
            </Notice>
          )}
        </div>
      )}

      <div className='flex-1 overflow-y-auto px-4 pt-3 pb-10'>{children}</div>
    </section>
  )
}

/* one thing still owed in the folder, said as a short count in the colour of its state; one that
   can be acted on is a button */
const Owed = ({
  tone,
  children,
  onClick
}: {
  tone: 'todo' | 'done' | 'plain'
  children: React.ReactNode
  onClick?: () => void
}) => {
  const look = {
    todo: 'font-medium text-local',
    done: 'font-medium text-up',
    plain: 'text-ink-2'
  }[tone]
  return onClick ? (
    <button
      type='button'
      onClick={onClick}
      className={`border-0 bg-transparent p-0 text-[12.5px] hover:underline ${look}`}>
      {children}
    </button>
  ) : (
    <span className={`text-[12.5px] ${look}`}>{children}</span>
  )
}

export { Owed, PlacePane }
