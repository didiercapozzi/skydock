import { afterNote } from '../helpers/sizes'
import { plural, t } from '@lingui/core/macro'
import {
  hasCompletePassenger,
  isMontage,
  isVideoFile,
  passengerName,
  UPLOADED_LOCKED
} from '@skydock/scripts'
import type { FileStatus, ProxyFact } from '@skydock/scripts'
import { useState } from 'react'
import { dsmFolderUrl } from '../helpers/dsm'
import { useStorageTwin } from '../hooks/storageTwins'
import { setDetailsDrawer, useDetailsColumn, useDetailsDrawer } from '../hooks/useDetails'
import { Danger, Go, Mini } from './buttons'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import { Icon } from './icons'
import type { IconName } from './icons'
import { JumpForm } from './jump-name'
import { JumpSpan } from './jump-time'
import { NameMontage, PassengerName } from './montage-card'
import type { Passenger } from './montage-card'
import { Slices } from './slices'
import type { ManifestFile, ManifestGroup } from './types'
import { kindsSaid } from './kinds'
import { dateLabel, formatSize, getPictureUrl, hhmm, minFileMtime, shortDate } from './utils'

/* The right-hand pane says everything about whatever is selected — one file, several, a jump, or
   the folder itself when nothing is — and offers what can be done with it, so nothing has to be
   opened just to be looked at. */

/* Beside the files when the window is wide enough for three columns; below that it is a drawer
   pulled out from the right edge, because what only it offers — naming a montage, fixing a jump's
   start, deleting a jump — must not go missing just because the window is narrow or the board is
   drawn bigger. */
const Shell = ({ children }: { children: React.ReactNode }) => {
  const column = useDetailsColumn()
  const drawer = useDetailsDrawer()
  return (
    <>
      {/* shut, it slides away and is then taken out of sight and of the tab order, so it is not
          read out while it is not there */}
      <aside
        aria-label={t`Details`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && drawer) setDetailsDrawer(false)
        }}
        className={`group/side flex min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-corner isle-side wide:rounded-none wide:border-l wide:border-edge wide:border-l wide:border-edge transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none max-wide:fixed max-wide:inset-y-0 max-wide:right-0 max-wide:z-30 max-wide:w-[min(340px,90vw)] max-wide:shadow-overlay wide:col-start-5 wide:row-start-2 ${
          drawer ? '' : 'max-wide:invisible max-wide:translate-x-full'
        } ${column ? '' : 'wide:invisible'}`}>
        {/* as wide as the column is when open, so what is inside slides out of view rather than
            being squeezed while the column closes */}
        <div className='relative flex min-h-full w-84.5 flex-col max-wide:w-full'>{children}</div>
      </aside>
    </>
  )
}

/* Who or what the panel is about: what kind of thing and where, its name — a file's in the mono
   face file names are read in — and what it holds. With no picture above it, it sits a little
   lower, where the picture would have ended. */
const Who = ({
  eyebrow,
  title,
  sub,
  tags,
  file = false,
  lower = false
}: {
  eyebrow?: string
  title: React.ReactNode
  sub?: React.ReactNode
  /* what state it is in, as small badges under the name */
  tags?: React.ReactNode
  file?: boolean
  lower?: boolean
}) => (
  <div className={`flex flex-col px-6 pb-1.5 ${lower ? 'pt-6.5' : 'pt-5'}`}>
    {eyebrow && <span className='eyebrow'>{eyebrow}</span>}
    <h2
      className={`m-0 mt-1 mb-2 leading-prose tracking-display break-words ${
        file
          ? 'font-display text-subhead leading-text font-semibold break-all'
          : 'font-display text-heading font-semibold'
      }`}>
      {title}
    </h2>
    {sub && <span className='font-medium text-ink-3'>{sub}</span>}
    {tags && <div className='mt-1 flex flex-wrap gap-1'>{tags}</div>}
  </div>
)

/* the picture at the top of the panel: what is being looked at, before any word about it */
/* it stays at the top while the rest of the panel scrolls under it */
const PICTURE = 'sticky top-0 z-20 h-51.5 flex-none'
const Hero = ({ children }: { children: React.ReactNode }) => (
  <div
    data-picture=''
    className={`${PICTURE} overflow-hidden bg-(image:--gradient-picture) dark:bg-well`}>
    {children}
  </div>
)

/* One part of the panel: what it is about in a quiet capital line over it. A part that is seldom wanted
   starts folded, its heading the way to open it. */
const Part = ({
  heading,
  folded = false,
  children
}: {
  heading?: string
  folded?: boolean
  children: React.ReactNode
}) => {
  const [open, setOpen] = useState(!folded)
  const title = 'm-0 eyebrow'
  return (
    <section className='flex flex-col gap-2.5 px-6 py-2.5'>
      {heading && folded ? (
        <h3 className={title}>
          <button
            type='button'
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className='flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left font-[inherit] tracking-[inherit] text-inherit uppercase'>
            {heading}
            <svg
              aria-hidden='true'
              viewBox='0 0 16 16'
              className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
              fill='none'
              stroke='currentColor'
              strokeWidth='1.8'
              strokeLinecap='round'
              strokeLinejoin='round'>
              <path d='M4 6l4 4 4-4' />
            </svg>
          </button>
        </h3>
      ) : (
        heading && <h3 className={title}>{heading}</h3>
      )}
      {open && children}
    </section>
  )
}

/* The buttons of a panel are drawn taller than the board's small ones, the size of a thumb's target:
   a menu's button is wrapped once, so it is reached by what it does, and the entries of its open
   list are left as they are. */
const BIG =
  '[&>button]:h-control-lg [&>button]:w-full [&>button]:justify-start [&>button]:gap-2.5 [&>button]:rounded-corner [&>button]:px-3.5 [&>button]:text-lead [&_button[aria-expanded]]:h-control-lg [&_button[aria-expanded]]:w-full [&_button[aria-expanded]]:justify-start [&_button[aria-expanded]]:gap-2.5 [&_button[aria-expanded]]:rounded-corner [&_button[aria-expanded]]:px-3.5 [&_button[aria-expanded]]:text-lead [&_button[aria-expanded]_svg]:size-mark'

/* what can be done, two buttons to a row and a wide one across; a button alone in its row takes it */
const Acts = ({ children }: { children: React.ReactNode }) => (
  <div className='flex flex-col gap-2'>{children}</div>
)

/* buttons of a part two to a row, each taking half */
const Pair = ({ children }: { children: React.ReactNode }) => (
  <div className={`grid grid-cols-1 gap-2 ${BIG}`}>{children}</div>
)

/* one button across the whole part */
const Whole = ({ children }: { children: React.ReactNode }) => (
  <div className={`grid ${BIG}`}>{children}</div>
)

/* letting go of files: red on nothing, so it is never taken for the next step */
const BinButton = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button
    type='button'
    onClick={onClick}
    className='inline-flex h-control items-center justify-center gap-2 rounded-corner bg-pane px-3.5 text-body font-bold whitespace-nowrap text-bin shadow-card hover:bg-bin-soft'>
    {children}
  </button>
)

/* the state of a file's proxy, quieter than its own state */
const PlainTag = ({ children }: { children: React.ReactNode }) => (
  <span className='inline-flex h-chip items-center rounded-full bg-well px-2.25 text-micro font-bold whitespace-nowrap text-ink-2'>
    {children}
  </span>
)

/* what is known, one line each: the name muted at the left, the value in bold at the right */
const Facts = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className='m-0 flex flex-col text-lead'>
    {rows.map(([term, value]) => (
      <div
        key={term}
        className='flex min-w-0 items-baseline justify-between gap-3 border-t border-line-2 py-2.5 first:border-t-0'>
        <dt className='flex-none text-ink-3'>{term}</dt>
        <dd className='m-0 min-w-0 text-right font-bold break-words tabular-nums [&_button]:text-lead [&_button]:font-bold'>
          {value}
        </dd>
      </div>
    ))}
  </dl>
)

/* where the jump is in a clip: a thin rail with the stretch from the exit to the landing filled, and
   a ringed marker at each moment the camera found. The clip's length is not known here, so the rail
   is as long as the last moment plus the little that follows it. */
const JumpMarks = ({ moments }: { moments: NonNullable<ManifestFile['moments']> }) => {
  const last = moments.landing ?? moments.canopy ?? moments.opening ?? moments.exit
  const along = (seconds: number) => (last > 0 ? Math.min(96, (seconds / last) * 96) : 0)
  const marks: [string, number | undefined][] = [
    [t`Exit`, moments.exit],
    [t`Opening`, moments.opening],
    [t`Landing`, moments.landing]
  ]
  return (
    <div className='relative h-11.5'>
      <div className='absolute inset-x-1 top-3 h-1.5 rounded-corner bg-well'>
        <i
          className='absolute inset-y-0 rounded-corner bg-(image:--gradient-marker)'
          style={{
            left: `${along(moments.exit)}%`,
            width: `${along(last) - along(moments.exit)}%`
          }}
        />
      </div>
      {marks.map(([name, at]) =>
        at === undefined ? null : (
          <i
            key={name}
            className='absolute top-1.5 -ml-2.25 h-mark w-mark rounded-full border-3 border-accent bg-pane'
            style={{ left: `${along(at)}%` }}>
            <span className='absolute top-5.5 left-1/2 -translate-x-1/2 text-micro font-bold whitespace-nowrap text-ink-3 not-italic'>
              {name}
            </span>
          </i>
        )
      )}
    </div>
  )
}

/* what holds the thing still — an edit, or being on the storage only — drawn with a lock */
const Lock = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 flex gap-2.5 rounded-corner bg-well px-3 py-2.5 text-small text-ink-2'>
    <Icon
      name='lock'
      size={14}
      className='mt-px text-ink-2'
    />
    <span>{children}</span>
  </p>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 text-micro leading-normal text-ink-3'>{children}</p>
)

const tally = (files: ManifestFile[], statusOf: (file: ManifestFile) => FileStatus) => {
  const count = (s: FileStatus) => files.filter((f) => statusOf(f) === s).length
  return [
    [t`Local`, count('local')],
    [t`Processed`, count('processed')],
    [t`Uploaded`, count('uploaded')]
  ] satisfies [string, number][]
}

/* What making a montage of something takes: the montages there are, for a name to join, the place
   that keeps what it holds when it is copied in rather than moved, and what to do with the name. */
type MontageOffer = {
  passengers: Passenger[]
  keeps?: string
  onMake: (passenger: Passenger) => void
}

const bytes = (files: ManifestFile[]) => formatSize(files.reduce((n, f) => n + f.size, 0))

/* Nothing selected: the folder itself — what it holds, how far along it is, and anything the folder
   as a whole has, like a dropzone's folder on the storage or a montage's progress. */
const FolderPanel = ({
  title,
  sub,
  eyebrow,
  children
}: {
  title: string
  sub: string
  eyebrow?: string
  children?: React.ReactNode
}) => (
  <>
    <Who
      eyebrow={eyebrow ?? t`Nothing selected`}
      title={title}
      sub={sub}
      lower
    />
    {children}
  </>
)

/* One setting of a folder, as a line: its mark, what it is and what it is now, and the one button
   that changes it. */
const SettingRow = ({
  icon,
  label,
  value,
  mono = false,
  children
}: {
  icon: IconName
  label: string
  value: React.ReactNode
  mono?: boolean
  children?: React.ReactNode
}) => (
  <div className='flex items-center gap-3 border-t border-line-2 py-3 first:border-t-0'>
    <span className='grid size-9.5 flex-none place-items-center rounded-corner bg-accent-soft text-accent'>
      <Icon
        name={icon}
        size={18}
      />
    </span>
    <div className='min-w-0 flex-1'>
      <b>{label}</b>
      <div className={`truncate text-ink-3 ${mono ? 'font-mono text-small' : 'text-body'}`}>
        {value}
      </div>
    </div>
    {children}
  </div>
)

/* Making a montage is a choice before it is a form: the name waits behind one button, so what is only
   being looked at, or filed, is not an empty box asking for a name. What a place already holds is
   copied into the montage, and `keeps` names that place. */
const MontageNamer = ({
  initial,
  keeps,
  what,
  passengers,
  primary = false,
  onSave
}: {
  initial?: string
  keeps?: string
  /* what the montage is made of, said on the button: "these", "this" */
  what?: string
  passengers: Passenger[]
  /* the one thing to do here, drawn as the main button */
  primary?: boolean
  onSave: (passenger: Passenger) => void
}) => {
  const [making, setMaking] = useState(false)
  const ofWhat = what ?? ''
  const Button = primary ? Go : Mini
  return making ? (
    <NameMontage
      initial={initial}
      keeps={keeps}
      passengers={passengers}
      framed={false}
      onSave={onSave}
      /* Cancel or Escape puts the button back and saves nothing (RULES, The board) */
      onCancel={() => setMaking(false)}
    />
  ) : (
    <Whole>
      <Button onClick={() => setMaking(true)}>
        {!primary && (
          <Icon
            name='montage'
            size={14}
            className='text-ink-2'
          />
        )}
        {keeps
          ? t`Copy into a montage…`
          : what
            ? t`Make a montage of ${ofWhat}…`
            : t`Make a montage…`}
      </Button>
    </Whole>
  )
}

const counts = (files: ManifestFile[]) => {
  const videos = files.filter((f) => isVideoFile(f.path)).length
  const photos = files.length - videos
  const size = bytes(files)
  return t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })} · ${size}`
}

/* A jump: when it started — set right here, every file moving with it — a picture of it, and the
   way to make it a montage or delete it. It is filed by dragging it onto a place. A montage shows how
   far it has got, and its name can be changed while nothing has been edited from it. */
const JumpPanel = ({
  group,
  label,
  where,
  locked,
  statusOf,
  passengers,
  keeps,
  onNameMontage,
  onName,
  onSelectFiles,
  onShift,
  onRename,
  onDelete,
  move,
  onTrimToJump,
  fileTo,
  end
}: {
  group: ManifestGroup
  label: string
  /* the folder the jump is in, said over its name */
  where?: string
  locked: string | null
  statusOf: (file: ManifestFile) => FileStatus
  passengers: Passenger[]
  /* the dropzone the jump is filed at, which keeps it: a montage gets copies of it */
  keeps?: string
  onNameMontage: (passenger: Passenger) => void
  onName: (firstname: string, lastname: string) => void
  onSelectFiles: () => void
  /* when it started, set right — every file moves with it; absent when the jump is past changing */
  onShift?: (anchorEpoch: number) => void
  /* what it is called — absent where naming it makes it a montage, and for a montage itself */
  onRename?: (name: string) => void
  /* the jump goes and its files stay, loose in Unsorted; absent when it cannot */
  onDelete?: () => void
  /* filing it somewhere else without dragging it; absent when it cannot move */
  move?: React.ReactNode
  /* every clip trimmed to its jump; absent when no clip has an exit found, or it is past changing */
  onTrimToJump?: () => void
  /* the destinations a jump still in Fresh files can be filed to, each a button of its own */
  fileTo?: { places: string[]; onFile: (place: string) => void }
  /* what is set once and left alone, last in the panel: a montage's ways back */
  end?: React.ReactNode
}) => {
  const [renaming, setRenaming] = useState(false)
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const montage = isMontage(group)
  const named = hasCompletePassenger(group.passenger)
  const fileCount = group.files.length
  /* a named montage is told by its name; anything else is told apart by what it shows */
  const pictured = !group.freed && fileCount > 0 && !(montage && named)
  const tallied = tally(group.files, statusOf)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${name.toLowerCase()}`)
    .join(' · ')
  /* A jump waiting in Fresh files has one decision to take: where it goes. The destinations are laid
     out as buttons, with making it a montage under them, so nothing is looked for in a menu. */
  if (fileTo && !montage && !group.freed) {
    const videos = group.files.filter((f) => isVideoFile(f.path)).length
    const photos = fileCount - videos
    const starts = hhmm(from)
    return (
      <>
        {fileCount > 0 && (
          <Slices
            files={group.files}
            width={480}
            grow={0.2}
            className={PICTURE}
          />
        )}
        <Who
          eyebrow={t`Jump · ${dateLabel(from)}`}
          lower={fileCount === 0}
          title={label}
          sub={`${kindsSaid(videos, photos, ' · ')} · ${t`starts ${starts}`}`}
        />
        {fileTo.places.length > 0 && (
          <Part heading={t`File it to`}>
            <div className='flex flex-col gap-2'>
              {fileTo.places.map((name) => (
                <button
                  key={name}
                  type='button'
                  onClick={() => fileTo.onFile(name)}
                  className='flex h-11.5 w-full cursor-pointer items-center gap-2.5 rounded-corner border-0 bg-pane p-2 text-left text-lead font-bold text-ink shadow-card hover:bg-accent-soft'>
                  <span className='grid size-control-sm flex-none place-items-center rounded-full bg-accent-soft text-accent'>
                    <Icon
                      name='place'
                      size={15}
                    />
                  </span>
                  <span className='min-w-0 flex-1 truncate'>{name}</span>
                  <span className='grid size-7 flex-none place-items-center rounded-full bg-accent-soft text-accent'>
                    <Icon
                      name='next'
                      size={15}
                    />
                  </span>
                </button>
              ))}
            </div>
          </Part>
        )}
        <Part heading={t`Or make it a film`}>
          <MontageNamer
            key={group.id}
            initial={group.name}
            keeps={keeps}
            primary
            passengers={passengers}
            onSave={onNameMontage}
          />
          <Hint>{t`Give it a name — a person or an event. The name becomes its folder and its film.`}</Hint>
        </Part>
        {onShift && fileCount > 0 && (
          <Part heading={t`Starts`}>
            <JumpSpan
              from={from}
              to={to}
              withDate
              big
              disabled={false}
              onShift={onShift}
            />
          </Part>
        )}
        <div className='mt-auto flex items-center justify-between gap-2 px-6 pt-4 pb-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <Mini onClick={onSelectFiles}>
              {t`Select its ${plural(fileCount, { one: '# file', other: '# files' })}`}
            </Mini>
            {onTrimToJump && (
              <Mini
                title={t`Each clip from its exit to a few seconds after its landing`}
                onClick={onTrimToJump}>
                <Icon name='scissors' />
                {t`Trim every clip to the jump`}
              </Mini>
            )}
          </div>
          {onDelete && (
            <Danger
              size='mini'
              onClick={onDelete}
              title={t`The jump goes; its files are kept, loose in Fresh files, with their trims`}>
              {t`Delete jump`}
            </Danger>
          )}
        </div>
      </>
    )
  }
  return (
    <>
      {pictured && (
        <Slices
          files={group.files}
          width={480}
          grow={0.2}
          className={PICTURE}
        />
      )}
      {/* the name is changed where it is read, the way its start is */}
      {renaming && onRename ? (
        <div className='px-5 pt-5 pb-3'>
          <JumpForm
            name={group.name}
            submitLabel={t`Rename`}
            onSubmit={(name) => {
              setRenaming(false)
              onRename(name)
            }}
            onCancel={() => setRenaming(false)}
          />
        </div>
      ) : (
        /* The name and the day kept apart: each is changed by clicking it, and the day is changed
           down in Starts, not here — so only the name is drawn as something to click. */
        <Who
          eyebrow={montage ? t`Montage` : where ? t`A jump in ${where}` : t`A jump`}
          lower={!pictured}
          title={
            <span className='inline-flex flex-wrap items-baseline gap-x-2'>
              {onRename ? (
                <button
                  type='button'
                  onClick={() => setRenaming(true)}
                  title={t`Rename this jump`}
                  className='cursor-text border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] text-ink hover:text-accent-ink hover:underline hover:decoration-dotted hover:underline-offset-3'>
                  {label}
                </button>
              ) : (
                label
              )}
              <span className='font-sans text-body font-medium tracking-normal text-ink-3'>
                {shortDate(from)}
              </span>
            </span>
          }
          sub={
            <>
              {counts(group.files)}
              {tallied && <span className='block'>{tallied}</span>}
            </>
          }
        />
      )}
      {/* when it started is the one thing about a jump that can be set right, so it is set here */}
      <Part heading={t`Starts`}>
        {onShift && group.files.length > 0 ? (
          <JumpSpan
            from={from}
            to={to}
            withDate
            big
            disabled={false}
            onShift={onShift}
          />
        ) : (
          <span className='text-body tabular-nums'>{`${dateLabel(from)} ${hhmm(from)}`}</span>
        )}
      </Part>
      {locked && locked !== UPLOADED_LOCKED && (
        <Part>
          <Lock>{locked}</Lock>
        </Part>
      )}
      {montage ? (
        <Part heading={t`Who it is for`}>
          {locked ? (
            <p className='m-0 text-body font-semibold'>{passengerName(group.passenger)}</p>
          ) : (
            <>
              <PassengerName
                key={group.id}
                group={group}
                passengers={passengers}
                onSave={onName}
              />
              <Hint>
                {named
                  ? t`The name is the folder, the file names and the film.`
                  : t`Give it a name — a person, an event. It becomes the montage’s folder.`}
              </Hint>
              {named && (group.processed || group.uploaded) && (
                <p className='m-0 text-micro text-changed'>
                  {group.uploaded
                    ? t`Already uploaded — a new name means processing and uploading again, and the old folder stays on the storage under the old name.`
                    : t`Already processed — a new name means processing it again, into the new folder.`}
                </p>
              )}
            </>
          )}
        </Part>
      ) : (
        <Part heading={t`Montage`}>
          <MontageNamer
            key={group.id}
            initial={group.name}
            keeps={keeps}
            passengers={passengers}
            onSave={onNameMontage}
          />
        </Part>
      )}
      {!group.freed && group.files.length > 0 && (
        <Part
          heading={montage ? t`Its files` : t`The jump`}
          folded={Boolean(montage)}>
          <Acts>
            <Pair>
              {move}
              <Mini onClick={onSelectFiles}>
                {t`Select its ${plural(fileCount, { one: '# file', other: '# files' })}`}
              </Mini>
            </Pair>
            {onTrimToJump && (
              <Whole>
                <Mini
                  title={t`Each clip from its exit to a few seconds after its landing`}
                  onClick={onTrimToJump}>
                  <Icon name='scissors' />
                  {t`Trim every clip to the jump`}
                </Mini>
              </Whole>
            )}
          </Acts>
          <div className='flex items-center justify-between gap-2'>
            <Hint>{t`⌘ or ctrl-click another jump to open the two side by side.`}</Hint>
            {onDelete && (
              <Danger
                size='mini'
                onClick={onDelete}
                title={t`The jump goes; its files are kept, loose in Fresh files, with their trims`}>
                {t`Delete jump`}
              </Danger>
            )}
          </div>
        </Part>
      )}
      {end}
    </>
  )
}

/* One file: the picture, what is known about it, and where it goes. Opening it is where it is
   trimmed, framed and turned. */
/* A file here that is up there too, with the way to it: its folder in the storage's own web interface,
   in a new tab. Nothing to watch from there — the file is here — so that is all it offers. */
const StorageTwinPart = ({ name }: { name: string | null }) => {
  const twin = useStorageTwin(name)
  if (!twin) return null
  const dsm = twin.dsmHost ? dsmFolderUrl(twin.dsmHost, twin.file.path) : null
  return (
    <Part>
      <div className='flex flex-col gap-2.5 rounded-corner bg-up-soft px-4 py-3.5'>
        <b className='flex items-center gap-2'>
          <Icon
            name='storage'
            size={18}
            className='text-up'
          />
          {t`On the storage`}
        </b>
        <span className='font-mono text-small break-all text-ink-3'>{twin.file.path}</span>
        {dsm && (
          <span className='flex'>
            <a
              href={dsm}
              target='_blank'
              rel='noreferrer'
              title={t`Show it in the storage’s own web interface, in a new tab`}
              className='inline-flex h-control items-center justify-center gap-1.5 rounded-corner bg-accent px-3.5 text-body font-bold whitespace-nowrap text-white no-underline'>
              {t`Open in DSM`}
            </a>
          </span>
        )}
      </div>
    </Part>
  )
}

const FilePanel = ({
  file,
  name,
  where,
  jumpLabel,
  status,
  proxy,
  locked,
  onOpen,
  onSendBack,
  backLabel,
  onRetime,
  montage,
  move
}: {
  file: ManifestFile
  name: string | null
  /* the folder it is in, said over its name */
  where?: string
  jumpLabel: string | null
  status: ShownStatus
  proxy?: ProxyFact
  locked: string | null
  onOpen: () => void
  onSendBack: () => void
  /* what removing does from here: a copy ends, anything else is asked about */
  backLabel: string
  /* when it was shot, corrected on its own; absent when the file is past changing */
  onRetime?: (epoch: number) => void
  /* made a montage on its own — copied in when a place keeps it; absent when it cannot be */
  montage?: MontageOffer
  /* filing it somewhere else without dragging it */
  move?: React.ReactNode
}) => {
  const video = isVideoFile(file.path)
  const filename = file.filename
  const turned = file.rotation ?? 0
  const reason = proxy?.reason ?? ''
  return (
    <>
      <Hero>
        <button
          type='button'
          onClick={onOpen}
          title={t`Open it — trim, frame and turn`}
          className='h-full w-full border-0 bg-transparent p-0'>
          <img
            src={getPictureUrl(file, undefined, 480)}
            alt=''
            style={
              file.rotation
                ? {
                    transform: `rotate(${file.rotation}deg)${file.rotation % 180 ? ' scale(0.5625)' : ''}`
                  }
                : undefined
            }
            className='h-full w-full object-cover'
          />
          {video && (
            <span className='absolute inset-0 grid place-items-center'>
              <span className='grid h-13 w-13 place-items-center rounded-full bg-white/[.92] text-stage-ink shadow-overlay'>
                <Icon
                  name='play'
                  size={20}
                />
              </span>
            </span>
          )}
        </button>
      </Hero>
      <Who
        eyebrow={[
          video ? t`Video` : t`Photo`,
          ...(where ? [where] : []),
          ...(jumpLabel ? [jumpLabel] : [])
        ].join(' · ')}
        title={name ?? file.filename}
        file
        sub={name ? t`from ${filename}` : undefined}
        tags={
          <>
            <StatusChip status={status} />
            {video && proxy && (
              <PlainTag>
                {proxy.state !== 'none'
                  ? t`Proxy ready`
                  : proxy.reason
                    ? t`Proxy could not be made — ${reason}`
                    : t`Proxy not made yet`}
              </PlainTag>
            )}
          </>
        }
      />
      <Part>
        <Facts
          rows={[
            [
              t`Shot`,
              onRetime ? (
                /* a tile is narrow: the two fields of the editor take a row each */
                <span
                  key='shot'
                  className='[&_input]:min-w-0 [&_input]:basis-full'>
                  {`${shortDate(file.mtime)} · `}
                  <JumpSpan
                    from={file.mtime}
                    to={file.mtime}
                    disabled={false}
                    onShift={onRetime}
                    hint={t`only this file moves — the rest of the jump stays`}
                    tip={t`Wrong time on this one file? Set when it was really shot`}
                  />
                </span>
              ) : (
                `${hhmm(file.mtime)} · ${shortDate(file.mtime)}`
              )
            ],
            [t`Size`, `${formatSize(file.size)}${afterNote(file)}`],
            [
              t`Picture`,
              [
                file.cropStart != null || file.cropEnd != null ? t`trimmed` : null,
                video && file.frame ? t`framed` : null,
                file.rotation ? t`turned ${turned}°` : null
              ]
                .filter(Boolean)
                .join(' · ') || t`as shot`
            ]
          ]}
        />
      </Part>
      <StorageTwinPart name={name} />
      {video && file.moments && (
        <Part heading={t`Where the jump is`}>
          <JumpMarks moments={file.moments} />
        </Part>
      )}
      {locked ? (
        /* a file on the storage says so by its state, and by the lock on its row: the panel does not
           say it a second time */
        locked !== UPLOADED_LOCKED && (
          <Part>
            <Lock>{locked}</Lock>
          </Part>
        )
      ) : (
        <Part>
          <Acts>
            <Pair>
              <Mini
                title={t`Open it — trim, frame and turn`}
                onClick={onOpen}>
                <Icon name='open' />
                {t`Trim, frame or turn…`}
              </Mini>
              {move}
              {montage && (
                <MontageNamer
                  key={file.id}
                  keeps={montage.keeps}
                  what={t`this`}
                  passengers={montage.passengers}
                  onSave={montage.onMake}
                />
              )}
            </Pair>
          </Acts>
        </Part>
      )}
      {/* the bin is open to a file the storage holds too: it moves only what is here */}
      {(!locked || locked === UPLOADED_LOCKED) && (
        <div className='mt-auto px-6 pt-4 pb-6'>
          <BinButton onClick={onSendBack}>{backLabel}</BinButton>
        </div>
      )}
    </>
  )
}

/* Several files: what they add up to, and where they all go. */
const ManyPanel = ({
  files,
  where,
  statusOf,
  onSendBack,
  backLabel,
  onMakeJump,
  montage,
  move,
  onClear
}: {
  files: ManifestFile[]
  /* the folder they were picked in, said over how many */
  where?: string
  statusOf: (file: ManifestFile) => FileStatus
  onSendBack: () => void
  /* what removing does from here: a copy ends, anything else is asked about */
  backLabel: string
  /* the same: gathered into a jump of their own, when the gap rule did not see them as one */
  onMakeJump?: (startsAt?: number) => void
  /* made into a montage — moved out of Fresh files, copied from anywhere else */
  montage?: MontageOffer
  /* filing them somewhere else without dragging them */
  move?: React.ReactNode
  onClear: () => void
}) => {
  const [making, setMaking] = useState(false)
  const times = files.map((f) => f.mtime)
  const tallied = tally(files, statusOf)
  const notYet = tallied[0]?.[1] ?? 0
  return (
    <>
      {/* what was picked, as pictures in the order it was shot — enough of them to tell the files apart at
          a glance, the rest counted on the last */}
      <Slices
        files={files}
        width={480}
        grow={0.2}
        className={PICTURE}
      />
      <Who
        eyebrow={where ? t`Picked in ${where}` : t`Picked`}
        title={plural(files.length, {
          one: '# file',
          other: '# files'
        })}
        sub={counts(files)}
      />
      <Part>
        <Facts
          rows={[
            [t`Total size`, bytes(files)],
            [t`Not yet processed`, String(notYet)],
            [t`From`, hhmm(Math.min(...times))],
            [t`To`, hhmm(Math.max(...times))],
            ...tallied
              .slice(1)
              .filter(([, n]) => n > 0)
              .map(([name, n]): [string, string] => [name, String(n)])
          ]}
        />
      </Part>
      {making && onMakeJump ? (
        <Part heading={t`A jump of these`}>
          <JumpForm
            named={false}
            startsAt={minFileMtime(files) ?? 0}
            submitLabel={t`Make the jump`}
            onSubmit={(_name, startsAt) => onMakeJump(startsAt)}
            onCancel={() => setMaking(false)}
          />
        </Part>
      ) : null}
      <Part>
        <Acts>
          {onMakeJump && !making && (
            <Whole>
              <Go onClick={() => setMaking(true)}>
                <Icon name='plus' />
                {t`Make a jump of these…`}
              </Go>
            </Whole>
          )}
          <Pair>
            {move}
            <Mini
              title={t`Clear (esc)`}
              onClick={onClear}>
              {t`Clear`}
              <kbd className='rounded-corner bg-pane px-1.5 font-sans text-micro leading-4 font-semibold text-ink-3 shadow-hairline'>
                esc
              </kbd>
            </Mini>
          </Pair>
          {montage && (
            <MontageNamer
              keeps={montage.keeps}
              what={t`these`}
              passengers={montage.passengers}
              onSave={montage.onMake}
            />
          )}
          <Whole>
            <BinButton onClick={onSendBack}>{backLabel}</BinButton>
          </Whole>
        </Acts>
        <Hint>
          {t`The tick or ⌘/ctrl-click picks one · shift-click takes a range · ⌘A takes them all · drag them onto a jump to move them, holding alt to copy them there instead`}
        </Hint>
      </Part>
    </>
  )
}

export {
  FilePanel,
  FolderPanel,
  JumpPanel,
  ManyPanel,
  Part,
  SettingRow,
  Shell,
  StorageTwinPart,
  Who
}
