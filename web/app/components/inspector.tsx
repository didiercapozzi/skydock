import { plural, t } from '@lingui/core/macro'
import { hasCompletePassenger, isMontage, isVideoFile, passengerName } from '@skydock/scripts'
import type { FileStatus, ProxyFact, MontageFact } from '@skydock/scripts'
import { useState } from 'react'
import { setDetailsDrawer, useDetailsColumn, useDetailsDrawer } from '../hooks/useDetails'
import { Danger, Go, Mini } from './buttons'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import { Icon } from './icons'
import { JumpForm } from './jump-name'
import { JumpSpan } from './jump-time'
import { NameMontage, PassengerName } from './montage-card'
import { StepTrail } from './montage-steps'
import type { Passenger } from './montage-card'
import type { ManifestFile, ManifestGroup } from './types'
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
        className={`backdrop-side flex min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto border-l border-line bg-pane transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-30 max-[1100px]:w-[min(340px,90vw)] max-[1100px]:shadow-[0_0_40px_rgba(0,0,0,0.25)] ${
          drawer ? '' : 'max-[1100px]:invisible max-[1100px]:translate-x-full'
        } ${column ? '' : 'min-[1101px]:invisible'}`}>
        {/* as wide as the column is when open, so what is inside slides out of view rather than
            being squeezed while the column closes */}
        <div className='flex min-h-full w-[312px] flex-col max-[1100px]:w-full'>{children}</div>
      </aside>
    </>
  )
}

/* Who or what the panel is about: what kind of thing and where, its name, and what it holds — over
   a hairline, the way every section under it is set off from the next. With no picture above it, it
   sits a little lower, where the picture would have ended. */
const Who = ({
  eyebrow,
  title,
  sub,
  lower = false
}: {
  eyebrow?: string
  title: React.ReactNode
  sub?: React.ReactNode
  lower?: boolean
}) => (
  <div
    className={`flex flex-col gap-0.5 border-b border-line px-4 pb-3 ${lower ? 'pt-5' : 'pt-3.5'}`}>
    {eyebrow && <span className='text-[11.5px] font-medium text-ink-3'>{eyebrow}</span>}
    <h2 className='m-0 mt-0.5 text-[17px] leading-[1.25] font-semibold tracking-[-0.02em] break-words'>
      {title}
    </h2>
    {sub && <span className='text-[12px] text-ink-3'>{sub}</span>}
  </div>
)

/* the picture at the top of the panel: what is being looked at, before any word about it */
const Hero = ({ children }: { children: React.ReactNode }) => (
  <div className='relative mx-3.5 mt-3.5 h-[150px] flex-none overflow-hidden rounded-md bg-well'>
    {children}
  </div>
)

/* One part of the panel: what it is about in a quiet word over it, a hairline under it. */
const Part = ({ heading, children }: { heading?: string; children: React.ReactNode }) => (
  <section className='flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0'>
    {heading && <h3 className='m-0 text-[11.5px] font-medium text-ink-3'>{heading}</h3>}
    {children}
  </section>
)

/* buttons of a part two to a row, each taking half */
const Pair = ({ children }: { children: React.ReactNode }) => (
  <div className='grid grid-cols-2 gap-2 [&>button]:w-full'>{children}</div>
)

/* one button across the whole part */
const Whole = ({ children }: { children: React.ReactNode }) => (
  <div className='grid [&>button]:w-full'>{children}</div>
)

const Facts = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className='m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]'>
    {rows.map(([term, value]) => (
      <div
        key={term}
        className='contents'>
        <dt className='text-ink-3'>{term}</dt>
        <dd className='m-0 min-w-0 break-words tabular-nums'>{value}</dd>
      </div>
    ))}
  </dl>
)

/* what holds the thing still — an edit, or being on the storage only — drawn with a lock */
const Lock = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 flex gap-2.5 rounded-md border border-line-2 bg-rail px-3 py-2 text-[12px] text-ink-2'>
    <Icon
      name='lock'
      size={14}
      className='mt-px text-ink-2'
    />
    <span>{children}</span>
  </p>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 text-[11.5px] leading-normal text-ink-3'>{children}</p>
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
    <Who
      eyebrow={t`Nothing selected`}
      title={title}
      sub={sub}
      lower
    />
    {files.length > 0 && (
      <Part heading={t`What it holds`}>
        <Facts rows={tally(files, statusOf).map(([name, n]) => [name, String(n)])} />
      </Part>
    )}
    {children}
    <Part>
      <Hint>
        {t`Select a file or a jump to see it here. Double-click a file to trim, frame or turn it.`}
      </Hint>
    </Part>
  </>
)

/* Making a montage is a choice before it is a form: the name waits behind one button, so what is only
   being looked at, or filed, is not an empty box asking for a name. What a place already holds is
   copied into the montage, and `keeps` names that place. */
const MontageNamer = ({
  initial,
  keeps,
  what,
  passengers,
  onSave
}: {
  initial?: string
  keeps?: string
  /* what the montage is made of, said on the button: "these", "this" */
  what?: string
  passengers: Passenger[]
  onSave: (passenger: Passenger) => void
}) => {
  const [making, setMaking] = useState(false)
  const ofWhat = what ?? ''
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
      <Mini onClick={() => setMaking(true)}>
        <Icon
          name='montage'
          size={14}
          className='text-ink-2'
        />
        {keeps
          ? t`Copy into a montage…`
          : what
            ? t`Make a montage of ${ofWhat}…`
            : t`Make a montage…`}
      </Mini>
    </Whole>
  )
}

/* the first frame worth showing: a video's, where there is one, since a face is likelier in footage */
const firstFrame = (files: ManifestFile[]) => files.find((f) => isVideoFile(f.path)) ?? files[0]

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
  facts,
  emailed,
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
  onTrimToJump
}: {
  group: ManifestGroup
  label: string
  /* the folder the jump is in, said over its name */
  where?: string
  facts?: MontageFact
  emailed: boolean
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
}) => {
  const [renaming, setRenaming] = useState(false)
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const montage = isMontage(group)
  const named = hasCompletePassenger(group.passenger)
  const fileCount = group.files.length
  const frame = group.freed ? undefined : firstFrame(group.files)
  /* a named montage is told by its name; anything else is told apart by what it shows */
  const pictured = frame && !(montage && named)
  const tallied = tally(group.files, statusOf)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${name.toLowerCase()}`)
    .join(' · ')
  return (
    <>
      {pictured && (
        <Hero>
          <img
            src={getPictureUrl(frame, undefined, 480)}
            alt={montage && !named ? t`A frame from this montage, to tell who it is` : label}
            className='h-full w-full object-cover'
          />
        </Hero>
      )}
      {/* the name is changed where it is read, the way its start is */}
      {renaming && onRename ? (
        <div className='border-b border-line px-4 py-3.5'>
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
                  className='cursor-text border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] text-ink hover:text-accent hover:underline hover:decoration-dotted hover:underline-offset-[3px]'>
                  {label}
                </button>
              ) : (
                label
              )}
              <span className='text-[12px] font-normal tracking-normal text-ink-3'>
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
          <span className='text-[12.5px] tabular-nums'>{`${dateLabel(from)} ${hhmm(from)}`}</span>
        )}
      </Part>
      {montage && (
        <Part heading={t`Where it has got to`}>
          <StepTrail
            group={group}
            facts={facts}
            emailed={emailed}
          />
        </Part>
      )}
      {locked && (
        <Part>
          <Lock>{locked}</Lock>
        </Part>
      )}
      {montage ? (
        <Part heading={t`Montage`}>
          {locked ? (
            <p className='m-0 text-[13px] font-semibold'>{passengerName(group.passenger)}</p>
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
                <p className='m-0 text-[11.5px] text-changed'>
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
        <Part heading={montage ? t`Its files` : t`The jump`}>
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
                <Icon
                  name='scissors'
                  size={14}
                  weight={2}
                  className='text-ink-2'
                />
                {t`Trim every clip to the jump`}
              </Mini>
            </Whole>
          )}
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
    </>
  )
}

/* One file: the picture, what is known about it, and where it goes. Opening it is where it is
   trimmed, framed and turned. */
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
              <span className='grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-[0_4px_18px_rgba(0,0,0,0.25)]'>
                <Icon
                  name='play'
                  size={15}
                />
              </span>
            </span>
          )}
        </button>
      </Hero>
      <Who
        eyebrow={
          where
            ? video
              ? t`A video in ${where}`
              : t`A photo in ${where}`
            : video
              ? t`A video`
              : t`A photo`
        }
        title={<span className='break-all'>{name ?? file.filename}</span>}
        sub={name ? t`from ${filename}` : video ? t`video` : t`photo`}
      />
      <Part heading={t`About it`}>
        <Facts
          rows={[
            [
              t`Shot`,
              onRetime ? (
                <JumpSpan
                  key='shot'
                  from={file.mtime}
                  to={file.mtime}
                  withDate
                  disabled={false}
                  onShift={onRetime}
                  hint={t`only this file moves — the rest of the jump stays`}
                  tip={t`Wrong time on this one file? Set when it was really shot`}
                />
              ) : (
                `${dateLabel(file.mtime)} ${hhmm(file.mtime)}`
              )
            ],
            [t`Size`, formatSize(file.size)],
            [t`In`, jumpLabel ?? t`no jump — a loose file`],
            ...(video && proxy
              ? ([
                  [
                    t`Proxy`,
                    proxy.state !== 'none'
                      ? t`ready`
                      : proxy.reason
                        ? t`could not be made — ${reason}`
                        : t`not made yet`
                  ]
                ] satisfies [string, string][])
              : []),
            [
              t`Status`,
              <StatusChip
                key='status'
                status={status}
              />
            ]
          ]}
        />
      </Part>
      {locked ? (
        <Part>
          <Lock>{locked}</Lock>
        </Part>
      ) : (
        <Part heading={t`Picture`}>
          <Hint>
            {[
              file.cropStart != null || file.cropEnd != null ? t`trimmed` : t`not trimmed`,
              video ? (file.frame ? t`framed` : t`whole frame`) : null,
              file.rotation ? t`turned ${turned}°` : t`as shot`
            ]
              .filter(Boolean)
              .join(' · ')}
          </Hint>
          <Whole>
            <Go onClick={onOpen}>
              <Icon
                name='scissors'
                size={14}
                weight={2}
              />
              {t`Trim, frame and turn…`}
            </Go>
          </Whole>
        </Part>
      )}
      {!locked && (
        <Part heading={t`Move`}>
          <Pair>
            {move}
            <Mini onClick={onSendBack}>{backLabel}</Mini>
          </Pair>
        </Part>
      )}
      {montage && (
        <Part heading={t`Montage`}>
          <MontageNamer
            key={file.id}
            keeps={montage.keeps}
            what={t`this`}
            passengers={montage.passengers}
            onSave={montage.onMake}
          />
        </Part>
      )}
      <Part>
        <Hint>{t`Double-click or ↵ opens it · the tick picks it · ↑↓ step through · esc clears`}</Hint>
      </Part>
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
  return (
    <>
      <Who
        eyebrow={where ? t`Picked in ${where}` : t`Picked`}
        title={plural(files.length, {
          one: '# file selected',
          other: '# files selected'
        })}
        sub={counts(files)}
        lower
      />
      {/* the first few, so what was picked is seen and not only counted */}
      <div className='flex gap-2 border-b border-line px-4 pt-4 pb-3'>
        {files.slice(0, 3).map((file) => (
          <img
            key={file.id ?? file.path}
            src={getPictureUrl(file, undefined, 160)}
            alt=''
            loading='lazy'
            className='aspect-[16/10] w-0 min-w-0 flex-1 rounded-md bg-well object-cover'
          />
        ))}
      </div>
      <Part heading={t`What they are`}>
        <Facts rows={tally(files, statusOf).map(([name, n]) => [name, String(n)])} />
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
      {montage && (
        <Part heading={t`Montage`}>
          <MontageNamer
            keeps={montage.keeps}
            what={t`these`}
            passengers={montage.passengers}
            onSave={montage.onMake}
          />
        </Part>
      )}
      <Part heading={t`Move them`}>
        <Pair>
          {move}
          <Mini onClick={onSendBack}>{backLabel}</Mini>
        </Pair>
        {onMakeJump && !making && (
          <Whole>
            <Mini onClick={() => setMaking(true)}>{t`Make a jump of these…`}</Mini>
          </Whole>
        )}
      </Part>
      <Part>
        <span>
          <Mini
            title={t`Clear (esc)`}
            onClick={onClear}>
            {t`Clear`}
            <kbd className='rounded-[3px] border border-line bg-rail px-1 font-sans text-[10.5px] leading-4 font-medium text-ink-3'>
              esc
            </kbd>
          </Mini>
        </span>
        <Hint>
          {t`The tick or ⌘/ctrl-click picks one · shift-click takes a range · ⌘A takes them all · drag them onto a jump to move them, holding alt to copy them there instead`}
        </Hint>
      </Part>
    </>
  )
}

export { FilePanel, FolderPanel, Hint, JumpPanel, ManyPanel, Part, Shell }
export type { MontageOffer }
