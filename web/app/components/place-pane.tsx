import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { droppedIn, fromComputer } from '../helpers/import'
import type { Dropped } from '../helpers/import'
import { placeLabel } from '../helpers/places'
import type { Place } from '../helpers/places'
import type { Grouping } from '../helpers/sections'
import { KindBadges } from './file-list'
import type { Kind } from './file-list'
import type { ManifestFile } from './types'

const GROUPING_LABEL: Record<Grouping, MessageDescriptor> = {
  jump: msg`By jump`,
  day: msg`By day`,
  none: msg`One list`
}

/* The folder that is open: the path to it, what it holds, the ways of finding and arranging its
   files, and — always at the top right — the one thing the folder as a whole asks for next. Under
   it, what is left to do there, and the board's one line of news. The pane takes files dropped from
   the computer, for the folder it shows. */
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
  strip,
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
  grouping: { value: Grouping; options: readonly Grouping[]; onChange: (g: Grouping) => void }
  kind: { value: Kind; onChange: (k: Kind) => void }
  /* what else the folder offers — a passenger's email, taking a montage back */
  tools?: React.ReactNode
  /* what is still to do here, and anything that belongs to the folder, like its storage folder */
  left?: React.ReactNode
  /* an upload under way */
  strip?: React.ReactNode
  note: string | null
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
      className='flex min-h-0 min-w-0 flex-col bg-ground'>
      <div className='flex flex-wrap items-center gap-x-[9px] gap-y-1.5 border-b border-line bg-pane px-4 pt-2.5 pb-2'>
        <span className='flex items-center gap-1.5 text-[12.5px] text-ink-3'>
          <b className='text-[15px] font-semibold text-ink'>{placeLabel(place)}</b>
        </span>
        <span className='text-[12px] text-ink-2'>{summary}</span>
        {tools}
        <span className='ml-auto flex flex-wrap items-center gap-2'>
          {browsing && (
            <>
              <label className='flex items-center gap-1.5 rounded-md border border-line bg-ground px-[9px] py-[3px]'>
                <span
                  aria-hidden='true'
                  className='text-[12px] text-ink-3'>
                  ⌕
                </span>
                <input
                  type='text'
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder={t`Find a file`}
                  aria-label={t`Find a file`}
                  className='w-[130px] border-0 bg-transparent text-[12.5px] outline-none placeholder:text-ink-3 max-[780px]:w-[90px]'
                />
              </label>
              <KindBadges
                files={files}
                kind={kind.value}
                withAll
                onPick={kind.onChange}
              />
              {/* every way of arranging the folder in plain sight, one press each — a place with
                  only one way has nothing to choose */}
              {grouping.options.length > 1 && (
                <span
                  role='group'
                  aria-label={t`Group`}
                  className='flex overflow-hidden rounded-md border border-line'>
                  {grouping.options.map((g) => (
                    <button
                      key={g}
                      type='button'
                      aria-pressed={grouping.value === g}
                      onClick={() => grouping.onChange(g)}
                      className={`px-[11px] py-[5px] text-[12px] ${
                        grouping.value === g
                          ? 'bg-accent-soft font-semibold text-accent'
                          : 'bg-pane text-ink-2 hover:text-ink'
                      }`}>
                      {i18n._(GROUPING_LABEL[g])}
                    </button>
                  ))}
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {(left || strip) && (
        <div className='flex flex-wrap items-center gap-2 border-b border-line bg-pane px-4 py-1.5 text-[12px] text-ink-2'>
          {left}
          {strip && <span className='flex-[1_1_100%]'>{strip}</span>}
        </div>
      )}

      {note && (
        <p className='m-0 border-b border-line bg-accent-soft px-4 py-[7px] text-[12.5px] text-ink-2'>
          {note}
        </p>
      )}

      <div className='flex-1 overflow-y-auto px-4 pb-10'>{children}</div>
    </section>
  )
}

/* one thing still owed in the folder, said as a small count; one that can be acted on is a button */
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
    todo: 'border-local bg-local-soft text-local',
    done: 'border-up bg-up-soft text-up',
    plain: 'border-line bg-ground text-ink-2'
  }[tone]
  return onClick ? (
    <button
      type='button'
      onClick={onClick}
      className={`rounded-full border px-2.5 py-px text-[12px] hover:brightness-95 ${look}`}>
      {children}
    </button>
  ) : (
    <span className={`rounded-full border px-2.5 py-px text-[12px] ${look}`}>{children}</span>
  )
}

export { Owed, PlacePane }
