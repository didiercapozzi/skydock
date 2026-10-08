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
  <span className='text-lead font-semibold text-ink-3 tabular-nums'>{n}</span>
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
  const options: [Kind, string, number, string][] = [
    ['all', t`All`, files.length, t`Show everything`],
    ['video', t`Videos`, videos, t`Show only the ${videos} videos`],
    ['photo', t`Photos`, photos, t`Show only the ${photos} photos`]
  ]
  return (
    <span
      role='group'
      aria-label={t`Videos or photos`}
      className='inline-flex gap-0.5 rounded-corner bg-well p-1 shadow-inset'>
      {options.map(([value, label, count, title]) => (
        <button
          key={value}
          type='button'
          aria-pressed={kind === value}
          disabled={count === 0 && kind !== value}
          title={title}
          onClick={() => onPick(value)}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-corner px-4 text-lead font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-45 ${
            kind === value
              ? 'bg-pane text-accent-ink shadow-card'
              : 'text-ink-2 hover:bg-pane/60 hover:text-accent-ink'
          }`}>
          {label}
          <Count n={count} />
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
  head,
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
  /* a head of the page's own in place of the plain one, handed the ways of finding and arranging the
     folder's files to put where it wants them */
  head?: (pane: {
    query: string
    onQuery: (query: string) => void
    arrange: React.ReactNode
  }) => React.ReactNode
  /* what is still to do here, and anything that belongs to the folder, like its storage folder */
  left?: React.ReactNode
  /* what the board last said, and whether it was a refusal */
  note: { text: string; problem: boolean; onClose: () => void; onOpen?: () => void } | null
  /* where a file from the computer dropped anywhere on the pane goes, if anywhere */
  incoming: { target: string; where: string } | null
  onImport: (list: Dropped[], target: string, where: string) => void
  children: React.ReactNode
}) => {
  const browsing = true
  /* Fresh files has jumps and days to choose between; the one list is for the folders that have no
     jumps of their own to see */
  const ways =
    place.kind === 'sort' ? grouping.options.filter((g) => g !== 'none') : grouping.options
  const arrange =
    ways.length > 1 ? (
      <Seg
        label={t`Group`}
        value={grouping.value}
        options={ways.map((g) => [g, i18n._(GROUPING_LABEL[g])] as const)}
        onPick={grouping.onChange}
      />
    ) : null
  const controls = browsing ? (
    <>
      {browsing && (
        <label className='flex h-9 w-40 items-center gap-2.5 rounded-corner bg-well px-3 text-ink-3 focus-within:shadow-focus max-desk:w-32.5'>
          <Icon name='narrow' />
          <input
            type='text'
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t`Narrow by name`}
            aria-label={t`Find a file`}
            className='bare-input'
          />
        </label>
      )}
      {/* every way of arranging the folder in plain sight, one press each — a place with only
          one way has nothing to choose */}
      {arrange}
      {browsing && (
        <KindSeg
          files={files}
          kind={kind.value}
          onPick={kind.onChange}
        />
      )}
    </>
  ) : null
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
      className='flex min-h-0 min-w-0 flex-col overflow-hidden rounded-b-corner isle-pane max-desk:rounded-corner desk:rounded-b-none desk:col-start-3 desk:row-start-2'>
      {/* a page's own head, or the plain one: one row, the folder's name and count and at the right
          everything that acts on it — narrowing by name, the ways of arranging it, kinds, and the
          folder's own tools */}
      {head ? (
        head({ query, onQuery, arrange })
      ) : (
        <div className='flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-7 pt-4 pb-2'>
          {/* the count beside the name, on its line, so the controls at the right are level with it */}
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-3'>
            <h1 className='m-0 font-display text-display leading-title font-bold tracking-display text-ink'>
              {placeLabel(place)}
            </h1>
            <p className='m-0 text-body font-medium text-ink-3'>{summary}</p>
          </div>
          {(browsing || tools) && (
            <div className='ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-2'>
              {controls}
              {tools && <span className='flex items-center gap-2'>{tools}</span>}
            </div>
          )}
        </div>
      )}

      {(left || note) && (
        <div className='flex flex-col gap-2.5 px-7 pt-0.5'>
          {left}
          {note && (
            <Notice
              problem={note.problem}
              onClose={note.onClose}
              onOpen={note.onOpen}>
              {note.text}
            </Notice>
          )}
        </div>
      )}

      <div className='flex-1 overflow-y-auto px-7 pt-1.5 pb-10'>{children}</div>
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
    todo: 'font-semibold text-local',
    done: 'font-semibold text-up',
    plain: 'text-ink-2'
  }[tone]
  return onClick ? (
    <button
      type='button'
      onClick={onClick}
      className={`border-0 bg-transparent p-0 text-body hover:underline ${look}`}>
      {children}
    </button>
  ) : (
    <span className={`text-body ${look}`}>{children}</span>
  )
}

export { Owed, PlacePane }
