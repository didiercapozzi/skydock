import { hasCompletePassenger, isVideoFile } from '@skydock/scripts'
import type { FileStatus, ProxyFact, TandemFact } from '@skydock/scripts'
import { Go, Mini } from './buttons'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import { TANDEMS } from '../helpers/jumps'
import { JumpSpan, hhmmss } from './jump-time'
import { PlaceSelect } from './place-select'
import type { Target } from './place-select'
import { MakeTandem, PassengerFrames, PassengerName } from './tandem-card'
import type { Passenger } from './tandem-card'
import type { Destination, ManifestFile, ManifestGroup } from './types'
import {
  calendarDay,
  dateLabel,
  formatSize,
  getFileUrl,
  getThumbUrl,
  minFileMtime,
  plural
} from './utils'

/* The right-hand pane says everything about whatever is selected — one file, several, a jump, or
   the folder itself when nothing is — and offers what can be done with it, so nothing has to be
   opened just to be looked at. */

const Shell = ({ children }: { children: React.ReactNode }) => (
  <aside
    aria-label='Details'
    className='flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-pane p-3.5 max-[1100px]:hidden'>
    {children}
  </aside>
)

const Title = ({ title, sub }: { title: string; sub?: string }) => (
  <div>
    <h3 className='m-0 text-[14px] font-semibold break-all'>{title}</h3>
    {sub && <p className='m-0 mt-0.5 text-[12px] text-ink-3'>{sub}</p>}
  </div>
)

const Box = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
  <section className='flex flex-col gap-2 rounded-lg border border-line bg-ground px-3 py-2.5'>
    <h4 className='m-0 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase'>
      {heading}
    </h4>
    {children}
  </section>
)

const Facts = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className='m-0 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-[12.5px]'>
    {rows.map(([term, value]) => (
      <div
        key={term}
        className='contents'>
        <dt className='text-ink-3'>{term}</dt>
        <dd className='m-0 min-w-0 font-mono text-[12px] break-all'>{value}</dd>
      </div>
    ))}
  </dl>
)

const Lock = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 rounded-r-md border-l-[3px] border-lock bg-lock-soft px-2.5 py-[7px] text-[12px] text-ink-2'>
    {children}
  </p>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 text-[12px] text-ink-3'>{children}</p>
)

const tally = (files: ManifestFile[], statusOf: (file: ManifestFile) => FileStatus) => {
  const count = (s: FileStatus) => files.filter((f) => statusOf(f) === s).length
  return [
    ['Local', count('local')],
    ['Processed', count('processed')],
    ['Uploaded', count('uploaded')]
  ] satisfies [string, number][]
}

const bytes = (files: ManifestFile[]) => formatSize(files.reduce((n, f) => n + f.size, 0))

/* A tandem's way from a name to the passenger's inbox, with where it has got to lit up. */
const StepTrail = ({
  group,
  facts,
  emailed
}: {
  group: ManifestGroup
  facts?: TandemFact
  emailed: boolean
}) => {
  const steps: [string, boolean][] = [
    ['Named', hasCompletePassenger(group.passenger)],
    ['Processed', Boolean(group.processed || group.uploaded || group.freed)],
    ['Edited', Boolean(facts?.project || group.freed)],
    ['Rendered', Boolean(facts?.film || group.uploaded || group.freed)],
    ['Uploaded', Boolean(group.uploaded)],
    ['Emailed', emailed]
  ]
  const now = steps.findIndex(([, done]) => !done)
  return (
    <ol
      aria-label='Where this tandem has got to'
      className='m-0 flex list-none flex-wrap gap-1 p-0'>
      {steps.map(([name, done], i) => (
        <li
          key={name}
          aria-current={i === now ? 'step' : undefined}
          className={`rounded-full border px-2 py-px text-[11.5px] ${
            done
              ? 'border-up bg-up-soft text-up'
              : i === now
                ? 'border-accent font-semibold text-accent'
                : 'border-line text-ink-3'
          }`}>
          {done ? `✓ ${name}` : name}
        </li>
      ))}
    </ol>
  )
}

type FileTo = {
  places: Destination[]
  passengers: string[]
  onFileTo: (target: Target) => void
}

/* Nothing selected: the folder itself — what it holds, how far along it is, and anything the folder
   as a whole has, like a dropzone's folder on the storage or a passenger's progress. */
const FolderPanel = ({
  title,
  sub,
  files,
  statusOf,
  children
}: {
  title: string
  sub: string
  files: ManifestFile[]
  statusOf: (file: ManifestFile) => FileStatus
  children?: React.ReactNode
}) => (
  <>
    <Title
      title={title}
      sub={sub}
    />
    {files.length > 0 && (
      <Facts rows={tally(files, statusOf).map(([name, n]) => [name, String(n)])} />
    )}
    {children}
    <Hint>Select a file or a jump to see it here. Double-click a file to crop or turn it.</Hint>
  </>
)

/* A jump: a few frames of it, when it started — which can be corrected — and where it goes. An
   unsorted jump is filed from here in one choice, or made a passenger's tandem by typing the name
   beside its frames. A tandem shows how far it has got, and its name can be changed while nothing
   has been edited from it. */
const JumpPanel = ({
  group,
  label,
  facts,
  emailed,
  locked,
  busy,
  statusOf,
  passengers,
  fileTo,
  compare,
  onShift,
  onMakeTandem,
  onName,
  onSelectFiles,
  onCompare
}: {
  group: ManifestGroup
  label: string
  facts?: TandemFact
  emailed: boolean
  locked: string | null
  busy: boolean
  statusOf: (file: ManifestFile) => FileStatus
  passengers: Passenger[]
  fileTo: FileTo & { current: Target | null }
  /* the other jumps it could be compared with, side by side, and merged into */
  compare: { id: string; label: string }[]
  onShift: (anchorEpoch: number) => void
  onMakeTandem: (passenger: Passenger) => void
  onName: (firstname: string, lastname: string) => void
  onSelectFiles: () => void
  onCompare: (otherId: string) => void
}) => {
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const videos = group.files.filter((f) => isVideoFile(f.path)).length
  const tandem = group.destination === TANDEMS
  const named = hasCompletePassenger(group.passenger)
  return (
    <>
      <Title
        title={label}
        sub={`${dateLabel(from)} · ${plural(videos, 'video')} · ${plural(group.files.length - videos, 'photo')} · ${bytes(group.files)}`}
      />
      {!group.freed && (
        <PassengerFrames
          group={group}
          alt={tandem && !named ? 'A frame from this tandem, to tell who it is' : label}
        />
      )}
      {tandem && (
        <StepTrail
          group={group}
          facts={facts}
          emailed={emailed}
        />
      )}
      {locked && <Lock>{locked}</Lock>}
      {tandem ? (
        <Box heading='Passenger'>
          {locked ? (
            <p className='m-0 text-[13px] font-semibold'>
              {group.passenger?.firstname} {group.passenger?.lastname}
            </p>
          ) : (
            <>
              <p className='m-0 text-[12px] text-ink-2'>
                {named
                  ? 'The name is the folder the passenger gets.'
                  : 'Type the name off the form — it becomes the passenger’s folder.'}
              </p>
              <PassengerName
                key={group.id}
                group={group}
                onSave={onName}
              />
              {named && (group.processed || group.uploaded) && (
                <p className='m-0 text-[11.5px] text-changed'>
                  {group.uploaded
                    ? 'Already uploaded — a new name means processing and uploading again, and the old folder stays on the storage under the old name.'
                    : 'Already processed — a new name means processing it again, into the new folder.'}
                </p>
              )}
            </>
          )}
        </Box>
      ) : (
        <Box heading='Where it goes'>
          <p className='m-0 text-[12px] text-ink-2'>
            Pick a folder, or drag the jump’s line onto one on the left.
          </p>
          <span className='flex flex-wrap items-center gap-1.5'>
            <PlaceSelect
              label='File to'
              current={fileTo.current}
              places={fileTo.places}
              passengers={fileTo.passengers}
              disabled={busy}
              onPick={fileTo.onFileTo}
            />
          </span>
          <p className='m-0 mt-1 text-[12px] text-ink-2'>Or make it a passenger’s tandem:</p>
          <MakeTandem
            key={group.id}
            group={group}
            passengers={passengers}
            framed={false}
            onSave={onMakeTandem}
          />
        </Box>
      )}
      {!locked && !group.freed && (
        <Box heading='Time'>
          <p className='m-0 text-[12px] text-ink-2'>
            A wrong camera clock is wrong for the whole jump: set when it really started, and every
            file moves with it.
          </p>
          <JumpSpan
            from={from}
            to={to}
            withDate={calendarDay(from) !== calendarDay(to)}
            disabled={busy}
            onShift={onShift}
          />
        </Box>
      )}
      {compare.length > 0 && !locked && (
        <Box heading='Compare'>
          <p className='m-0 text-[12px] text-ink-2'>
            Two jumps that may be one: look at them side by side, then merge them.
          </p>
          <select
            aria-label='Compare with'
            value=''
            onChange={(e) => e.target.value && onCompare(e.target.value)}
            className='rounded-md border border-line bg-pane px-1.5 py-[3px] text-[12px] text-ink-2'>
            <option value=''>Compare with…</option>
            {compare.map((c) => (
              <option
                key={c.id}
                value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Box>
      )}
      {!group.freed && group.files.length > 0 && (
        <span className='flex gap-1.5'>
          <Mini onClick={onSelectFiles}>Select its {plural(group.files.length, 'file')}</Mini>
        </span>
      )}
      <Hint>
        {tally(group.files, statusOf)
          .filter(([, n]) => n > 0)
          .map(([name, n]) => `${n} ${name.toLowerCase()}`)
          .join(' · ')}
      </Hint>
    </>
  )
}

/* One file: the picture, what is known about it, and where it goes. Opening it is where it is
   trimmed, framed and turned. */
const FilePanel = ({
  file,
  name,
  jumpLabel,
  status,
  proxy,
  locked,
  fileTo,
  onOpen,
  onSendBack,
  onTrash,
  onRetime
}: {
  file: ManifestFile
  name: string | null
  jumpLabel: string | null
  status: ShownStatus
  proxy?: ProxyFact
  locked: string | null
  fileTo: FileTo & { current: Target | null }
  onOpen: () => void
  onSendBack: () => void
  /* in Unsorted there is nowhere to send it back to, so the way out is the bin */
  onTrash?: () => void
  /* when it was shot, corrected on its own; absent when the file is past changing */
  onRetime?: (epoch: number) => void
}) => {
  const video = isVideoFile(file.path)
  return (
    <>
      <Title
        title={name ?? file.filename}
        sub={name ? `from ${file.filename}` : video ? 'video' : 'photo'}
      />
      <button
        type='button'
        onClick={onOpen}
        title='Open it — trim, frame and turn'
        className='relative aspect-video w-full overflow-hidden rounded-lg border-0 bg-line-2 p-0'>
        <img
          src={video ? getThumbUrl(file.path, 0.5, 480) : getFileUrl(file.path)}
          alt=''
          style={
            file.rotation
              ? {
                  transform: `rotate(${file.rotation}deg)${file.rotation % 180 ? ' scale(0.5625)' : ''}`
                }
              : undefined
          }
          className='h-full w-full object-contain'
        />
        {video && (
          <span className='absolute inset-0 grid place-items-center text-[28px] text-white/90 drop-shadow'>
            ▶
          </span>
        )}
      </button>
      <Facts
        rows={[
          [
            'Shot',
            onRetime ? (
              <JumpSpan
                key='shot'
                from={file.mtime}
                to={file.mtime}
                withDate
                disabled={false}
                onShift={onRetime}
                hint='only this file moves — the rest of the jump stays'
                tip='Wrong time on this one file? Set when it was really shot'
              />
            ) : (
              `${dateLabel(file.mtime)} ${hhmmss(file.mtime)}`
            )
          ],
          ['Size', formatSize(file.size)],
          ['In', jumpLabel ?? 'no jump — a loose file'],
          ...(video && proxy
            ? ([['Proxy', proxy.state === 'none' ? 'not made yet' : 'ready']] satisfies [
                string,
                string
              ][])
            : []),
          [
            'Status',
            <StatusChip
              key='status'
              status={status}
            />
          ]
        ]}
      />
      {locked ? (
        <Lock>{locked}</Lock>
      ) : (
        <Box heading='Picture'>
          <p className='m-0 text-[12px] text-ink-2'>
            {[
              file.cropStart != null || file.cropEnd != null ? 'trimmed' : 'not trimmed',
              video ? (file.frame ? 'framed' : 'whole frame') : null,
              file.rotation ? `turned ${file.rotation}°` : 'as shot'
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <span>
            <Go onClick={onOpen}>Crop and turn…</Go>
          </span>
        </Box>
      )}
      {!locked && (
        <Box heading='Move'>
          <PlaceSelect
            label='File to'
            current={fileTo.current}
            places={fileTo.places}
            passengers={fileTo.passengers}
            onPick={fileTo.onFileTo}
          />
          <span>
            {onTrash ? (
              <Mini onClick={onTrash}>Put in the bin… (⌫)</Mini>
            ) : (
              <Mini onClick={onSendBack}>Send back to Unsorted (⌫)</Mini>
            )}
          </span>
        </Box>
      )}
      <Hint>Double-click or ↵ opens it · the tick picks it · ↑↓ step through · esc clears</Hint>
    </>
  )
}

/* Several files: what they add up to, and where they all go. */
const ManyPanel = ({
  files,
  statusOf,
  lockedCount,
  fileTo,
  onSendBack,
  onTrash,
  onClear
}: {
  files: ManifestFile[]
  statusOf: (file: ManifestFile) => FileStatus
  lockedCount: number
  fileTo: FileTo
  onSendBack: () => void
  /* offered only when every one of them is in Unsorted */
  onTrash?: () => void
  onClear: () => void
}) => {
  const videos = files.filter((f) => isVideoFile(f.path)).length
  return (
    <>
      <Title
        title={`${plural(files.length, 'file')} selected`}
        sub={`${plural(videos, 'video')} · ${plural(files.length - videos, 'photo')} · ${bytes(files)}`}
      />
      <Facts rows={tally(files, statusOf).map(([name, n]) => [name, String(n)])} />
      {lockedCount > 0 && (
        <Lock>
          {plural(lockedCount, 'file')} cannot move — uploaded, or in a tandem with an edit — and
          will stay where {lockedCount === 1 ? 'it is' : 'they are'}.
        </Lock>
      )}
      <Box heading='Move them'>
        <PlaceSelect
          label='File to'
          current={null}
          places={fileTo.places}
          passengers={fileTo.passengers}
          onPick={fileTo.onFileTo}
        />
        <span className='flex flex-wrap gap-1.5'>
          {onTrash ? (
            <Mini onClick={onTrash}>Put in the bin… (⌫)</Mini>
          ) : (
            <Mini onClick={onSendBack}>Send back to Unsorted (⌫)</Mini>
          )}
          <Mini onClick={onClear}>Clear (esc)</Mini>
        </span>
      </Box>
      <Hint>
        The tick or ⌘/ctrl-click picks one · shift-click takes a range · ⌘A takes them all
      </Hint>
    </>
  )
}

export { Box, FilePanel, FolderPanel, Hint, JumpPanel, ManyPanel, Shell, StepTrail, Title }
