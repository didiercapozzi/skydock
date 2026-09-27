import { plural, t } from '@lingui/core/macro'
import { hasCompletePassenger, isMontage, isVideoFile, passengerName } from '@skydock/scripts'
import type { FileStatus, ProxyFact, MontageFact } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini } from './buttons'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import { JumpForm } from './jump-name'
import { JumpSpan, hhmmss } from './jump-time'
import { NameMontage, PassengerFrames, PassengerName } from './montage-card'
import { StepTrail } from './montage-steps'
import type { Passenger } from './montage-card'
import type { ManifestFile, ManifestGroup } from './types'
import { dateLabel, formatSize, getThumbUrl, minFileMtime, shortDate } from './utils'

/* The right-hand pane says everything about whatever is selected — one file, several, a jump, or
   the folder itself when nothing is — and offers what can be done with it, so nothing has to be
   opened just to be looked at. */

const Shell = ({ children }: { children: React.ReactNode }) => (
  <aside
    aria-label={t`Details`}
    className='flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-pane p-3.5 max-[1100px]:hidden'>
    {children}
  </aside>
)

const Title = ({ title, sub }: { title: React.ReactNode; sub?: string }) => (
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
    <Hint>
      {t`Select a file or a jump to see it here. Double-click a file to crop or turn it.`}
    </Hint>
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
    <span>
      <Mini onClick={() => setMaking(true)}>
        {keeps
          ? t`Copy into a montage…`
          : what
            ? t`Make a montage of ${ofWhat}…`
            : t`Make a montage…`}
      </Mini>
    </span>
  )
}

/* A jump: when it started — set right here, every file moving with it — a few frames of it, and the
   way to make it a passenger's montage or delete it. It is filed by dragging it onto a place. A montage
   shows how far it has got, and its name can be changed while nothing has been edited from it. */
const JumpPanel = ({
  group,
  label,
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
  onDelete
}: {
  group: ManifestGroup
  label: string
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
}) => {
  const [renaming, setRenaming] = useState(false)
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const videos = group.files.filter((f) => isVideoFile(f.path)).length
  const montage = isMontage(group)
  const named = hasCompletePassenger(group.passenger)
  const photos = group.files.length - videos
  const size = bytes(group.files)
  const sub = t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })} · ${size}`
  const fileCount = group.files.length
  return (
    <>
      {/* the name is changed where it is read, the way its start is */}
      {renaming && onRename ? (
        <JumpForm
          name={group.name}
          submitLabel={t`Rename`}
          onSubmit={(name) => {
            setRenaming(false)
            onRename(name)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        /* The name and the day kept apart: each is changed by clicking it, and the day is changed
           down in Starts, not here — so only the name is drawn as something to click. */
        <Title
          title={
            <span className='inline-flex flex-wrap items-baseline gap-x-2'>
              {onRename ? (
                <button
                  type='button'
                  onClick={() => setRenaming(true)}
                  title={t`Rename this jump`}
                  className='cursor-text border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] text-ink underline decoration-dotted underline-offset-[3px] hover:text-accent'>
                  {label}
                </button>
              ) : (
                label
              )}
              <span className='rounded border border-line px-1.5 text-[11.5px] font-normal text-ink-3'>
                {shortDate(from)}
              </span>
            </span>
          }
          sub={sub}
        />
      )}
      {/* when it started is the one thing about a jump that can be set right, so it is set here */}
      <Facts
        rows={[
          [
            t`Starts`,
            onShift && group.files.length > 0 ? (
              <JumpSpan
                key='starts'
                from={from}
                to={to}
                withDate
                disabled={false}
                onShift={onShift}
              />
            ) : (
              `${dateLabel(from)} ${hhmmss(from)}`
            )
          ]
        ]}
      />
      {!group.freed && (
        <PassengerFrames
          group={group}
          alt={montage && !named ? t`A frame from this montage, to tell who it is` : label}
        />
      )}
      {montage && (
        <StepTrail
          group={group}
          facts={facts}
          emailed={emailed}
        />
      )}
      {locked && <Lock>{locked}</Lock>}
      {montage ? (
        <Box heading={t`Montage`}>
          {locked ? (
            <p className='m-0 text-[13px] font-semibold'>{passengerName(group.passenger)}</p>
          ) : (
            <>
              <p className='m-0 text-[12px] text-ink-2'>
                {named
                  ? t`The name is the folder, the file names and the film.`
                  : t`Give it a name — a person, an event. It becomes the montage’s folder.`}
              </p>
              <PassengerName
                key={group.id}
                group={group}
                onSave={onName}
              />
              {named && (group.processed || group.uploaded) && (
                <p className='m-0 text-[11.5px] text-changed'>
                  {group.uploaded
                    ? t`Already uploaded — a new name means processing and uploading again, and the old folder stays on the storage under the old name.`
                    : t`Already processed — a new name means processing it again, into the new folder.`}
                </p>
              )}
            </>
          )}
        </Box>
      ) : (
        <Box heading={t`Montage`}>
          <MontageNamer
            key={group.id}
            initial={group.name}
            keeps={keeps}
            passengers={passengers}
            onSave={onNameMontage}
          />
        </Box>
      )}
      {!group.freed && group.files.length > 0 && (
        <span className='flex flex-wrap gap-1.5'>
          <Mini onClick={onSelectFiles}>
            {t`Select its ${plural(fileCount, { one: '# file', other: '# files' })}`}
          </Mini>
          {onDelete && (
            <Mini
              onClick={onDelete}
              title={
                montage && named
                  ? t`Undo the montage, whatever step it is at — its files go back to Fresh files, loose. Asks first.`
                  : t`The jump goes; its files are kept, loose in Fresh files, with their crops`
              }>
              {montage && named ? t`Delete montage…` : t`Delete jump`}
            </Mini>
          )}
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
  onOpen,
  onSendBack,
  backLabel,
  onTrash,
  onRetime,
  montage
}: {
  file: ManifestFile
  name: string | null
  jumpLabel: string | null
  status: ShownStatus
  proxy?: ProxyFact
  locked: string | null
  onOpen: () => void
  onSendBack: () => void
  /* what sending back does from here — out of a jump, or back to Unsorted from a place */
  backLabel: string
  /* in Unsorted there is nowhere to send it back to, so the way out is the bin */
  onTrash?: () => void
  /* when it was shot, corrected on its own; absent when the file is past changing */
  onRetime?: (epoch: number) => void
  /* made a montage on its own — copied in when a place keeps it; absent when it cannot be */
  montage?: MontageOffer
}) => {
  const video = isVideoFile(file.path)
  const filename = file.filename
  const turned = file.rotation ?? 0
  const reason = proxy?.reason ?? ''
  return (
    <>
      <Title
        title={name ?? file.filename}
        sub={name ? t`from ${filename}` : video ? t`video` : t`photo`}
      />
      <button
        type='button'
        onClick={onOpen}
        title={t`Open it — trim, frame and turn`}
        className='relative aspect-video w-full overflow-hidden rounded-lg border-0 bg-line-2 p-0'>
        <img
          src={getThumbUrl(file.path, 0.5, 480)}
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
              `${dateLabel(file.mtime)} ${hhmmss(file.mtime)}`
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
      {locked ? (
        <Lock>{locked}</Lock>
      ) : (
        <Box heading={t`Picture`}>
          <p className='m-0 text-[12px] text-ink-2'>
            {[
              file.cropStart != null || file.cropEnd != null ? t`trimmed` : t`not trimmed`,
              video ? (file.frame ? t`framed` : t`whole frame`) : null,
              file.rotation ? t`turned ${turned}°` : t`as shot`
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <span>
            <Go onClick={onOpen}>{t`Crop and turn…`}</Go>
          </span>
        </Box>
      )}
      {!locked && (
        <Box heading={t`Move`}>
          <span>
            {onTrash ? (
              <Mini onClick={onTrash}>{t`Put in the bin… (⌫)`}</Mini>
            ) : (
              <Mini onClick={onSendBack}>{backLabel}</Mini>
            )}
          </span>
        </Box>
      )}
      {montage && (
        <Box heading={t`Montage`}>
          <MontageNamer
            key={file.id}
            keeps={montage.keeps}
            what={t`this`}
            passengers={montage.passengers}
            onSave={montage.onMake}
          />
        </Box>
      )}
      <Hint>{t`Double-click or ↵ opens it · the tick picks it · ↑↓ step through · esc clears`}</Hint>
    </>
  )
}

/* Several files: what they add up to, and where they all go. */
const ManyPanel = ({
  files,
  statusOf,
  onSendBack,
  backLabel,
  onTrash,
  onMakeJump,
  montage,
  onClear
}: {
  files: ManifestFile[]
  statusOf: (file: ManifestFile) => FileStatus
  onSendBack: () => void
  /* what sending back does from here — out of a jump, or back to Unsorted from a place */
  backLabel: string
  /* offered only when every one of them is in Unsorted */
  onTrash?: () => void
  /* the same: gathered into a jump of their own, when the gap rule did not see them as one */
  onMakeJump?: (startsAt?: number) => void
  /* made into a montage — moved out of Fresh files, copied from anywhere else */
  montage?: MontageOffer
  onClear: () => void
}) => {
  const [making, setMaking] = useState(false)
  const videos = files.filter((f) => isVideoFile(f.path)).length
  const photos = files.length - videos
  const size = bytes(files)
  return (
    <>
      <Title
        title={plural(files.length, {
          one: '# file selected',
          other: '# files selected'
        })}
        sub={t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })} · ${size}`}
      />
      <Facts rows={tally(files, statusOf).map(([name, n]) => [name, String(n)])} />
      {making && onMakeJump ? (
        <Box heading={t`A jump of these`}>
          <JumpForm
            named={false}
            startsAt={minFileMtime(files) ?? 0}
            submitLabel={t`Make the jump`}
            onSubmit={(_name, startsAt) => onMakeJump(startsAt)}
            onCancel={() => setMaking(false)}
          />
        </Box>
      ) : null}
      {montage && (
        <Box heading={t`Montage`}>
          <MontageNamer
            keeps={montage.keeps}
            what={t`these`}
            passengers={montage.passengers}
            onSave={montage.onMake}
          />
        </Box>
      )}
      <Box heading={t`Move them`}>
        <span className='flex flex-wrap gap-1.5'>
          {onMakeJump && !making && (
            <Mini onClick={() => setMaking(true)}>{t`Make a jump of these…`}</Mini>
          )}
          {onTrash ? (
            <Mini onClick={onTrash}>{t`Put in the bin… (⌫)`}</Mini>
          ) : (
            <Mini onClick={onSendBack}>{backLabel}</Mini>
          )}
          <Mini onClick={onClear}>{t`Clear (esc)`}</Mini>
        </span>
      </Box>
      <Hint>
        {t`The tick or ⌘/ctrl-click picks one · shift-click takes a range · ⌘A takes them all · drag them onto a jump to move them, holding alt to copy them there instead`}
      </Hint>
    </>
  )
}

export { Box, FilePanel, FolderPanel, Hint, JumpPanel, ManyPanel, Shell, Title }
export type { MontageOffer }
