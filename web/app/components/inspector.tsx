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

const Shell = ({ children }: { children: React.ReactNode }) => {
  const column = useDetailsColumn()
  const drawer = useDetailsDrawer()
  return (
    <>
      <aside
        aria-label={t`Details`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && drawer) setDetailsDrawer(false)
        }}
        className={`group/side flex min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-[18px] isle-side min-[1101px]:rounded-none min-[1101px]:border-l min-[1101px]:border-edge min-[1101px]:border-l min-[1101px]:border-edge transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-30 max-[1100px]:w-[min(340px,90vw)] max-[1100px]:shadow-[0_0_40px_rgba(0,0,0,0.25)] min-[1101px]:col-start-5 min-[1101px]:row-start-2 ${
          drawer ? '' : 'max-[1100px]:invisible max-[1100px]:translate-x-full'
        } ${column ? '' : 'min-[1101px]:invisible'}`}>
        <div className='relative flex min-h-full w-[338px] flex-col max-[1100px]:w-full'>
          {children}
        </div>
      </aside>
    </>
  )
}

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
  tags?: React.ReactNode
  file?: boolean
  lower?: boolean
}) => (
  <div className={`flex flex-col px-6 pb-1.5 ${lower ? 'pt-[26px]' : 'pt-5'}`}>
    {eyebrow && (
      <span className='text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase'>
        {eyebrow}
      </span>
    )}
    <h2
      className={`m-0 mt-1 mb-2 leading-[1.45] tracking-[-0.03em] break-words ${
        file
          ? 'font-display text-[19px] leading-[1.25] font-semibold break-all'
          : 'font-display text-[24px] font-semibold'
      }`}>
      {title}
    </h2>
    {sub && <span className='font-medium text-ink-3'>{sub}</span>}
    {tags && <div className='mt-1 flex flex-wrap gap-1'>{tags}</div>}
  </div>
)

const PICTURE = 'sticky top-0 z-20 h-[206px] flex-none'
const Hero = ({ children }: { children: React.ReactNode }) => (
  <div
    data-picture=''
    className={`${PICTURE} overflow-hidden bg-[linear-gradient(135deg,#c9e1f3,#e4f1fc)] dark:bg-well`}>
    {children}
  </div>
)

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
  const title = 'm-0 text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase'
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

const BIG =
  '[&>button]:h-[42px] [&>button]:w-full [&>button]:justify-start [&>button]:gap-2.5 [&>button]:rounded-full [&>button]:px-3.5 [&>button]:text-[14px] [&_button[aria-expanded]]:h-[42px] [&_button[aria-expanded]]:w-full [&_button[aria-expanded]]:justify-start [&_button[aria-expanded]]:gap-2.5 [&_button[aria-expanded]]:rounded-full [&_button[aria-expanded]]:px-3.5 [&_button[aria-expanded]]:text-[14px] [&_button[aria-expanded]_svg]:size-[18px]'

const Acts = ({ children }: { children: React.ReactNode }) => (
  <div className='flex flex-col gap-2'>{children}</div>
)

const Pair = ({ children }: { children: React.ReactNode }) => (
  <div className={`grid grid-cols-1 gap-2 ${BIG}`}>{children}</div>
)

const Whole = ({ children }: { children: React.ReactNode }) => (
  <div className={`grid ${BIG}`}>{children}</div>
)

const BinButton = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button
    type='button'
    onClick={onClick}
    className='inline-flex h-[34px] items-center justify-center gap-2 rounded-full bg-pane px-3.5 text-[13px] font-bold whitespace-nowrap text-bin shadow-card hover:bg-bin-soft'>
    {children}
  </button>
)

const PlainTag = ({ children }: { children: React.ReactNode }) => (
  <span className='inline-flex h-[22px] items-center rounded-full bg-well px-[9px] text-[11.5px] font-bold whitespace-nowrap text-ink-2'>
    {children}
  </span>
)

const Facts = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className='m-0 flex flex-col text-[14px]'>
    {rows.map(([term, value]) => (
      <div
        key={term}
        className='flex min-w-0 items-baseline justify-between gap-3 border-t border-line-2 py-2.5 first:border-t-0'>
        <dt className='flex-none text-ink-3'>{term}</dt>
        <dd className='m-0 min-w-0 text-right font-bold break-words tabular-nums [&_button]:text-[14px] [&_button]:font-bold'>
          {value}
        </dd>
      </div>
    ))}
  </dl>
)

const JumpMarks = ({ moments }: { moments: NonNullable<ManifestFile['moments']> }) => {
  const last = moments.landing ?? moments.canopy ?? moments.opening ?? moments.exit
  const along = (seconds: number) => (last > 0 ? Math.min(96, (seconds / last) * 96) : 0)
  const marks: [string, number | undefined][] = [
    [t`Exit`, moments.exit],
    [t`Opening`, moments.opening],
    [t`Landing`, moments.landing]
  ]
  return (
    <div className='relative h-[46px]'>
      <div className='absolute inset-x-1 top-3 h-1.5 rounded-[3px] bg-well'>
        <i
          className='absolute inset-y-0 rounded-[3px] bg-[linear-gradient(90deg,#7fb0ff,#9a8cff)]'
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
            className='absolute top-1.5 -ml-[9px] h-[18px] w-[18px] rounded-full border-[3px] border-accent bg-pane'
            style={{ left: `${along(at)}%` }}>
            <span className='absolute top-[22px] left-1/2 -translate-x-1/2 text-[10.5px] font-bold whitespace-nowrap text-ink-3 not-italic'>
              {name}
            </span>
          </i>
        )
      )}
    </div>
  )
}

const Lock = ({ children }: { children: React.ReactNode }) => (
  <p className='m-0 flex gap-2.5 rounded-[12px] bg-well px-3 py-2.5 text-[12px] text-ink-2'>
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

type MontageOffer = {
  passengers: Passenger[]
  keeps?: string
  onMake: (passenger: Passenger) => void
}

const bytes = (files: ManifestFile[]) => formatSize(files.reduce((n, f) => n + f.size, 0))

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
    <span className='grid size-[38px] flex-none place-items-center rounded-[12px] bg-accent-soft text-accent'>
      <Icon
        name={icon}
        size={18}
      />
    </span>
    <div className='min-w-0 flex-1'>
      <b>{label}</b>
      <div className={`truncate text-ink-3 ${mono ? 'font-mono text-[12px]' : 'text-[12.5px]'}`}>
        {value}
      </div>
    </div>
    {children}
  </div>
)

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
  what?: string
  passengers: Passenger[]
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
  where?: string
  locked: string | null
  statusOf: (file: ManifestFile) => FileStatus
  passengers: Passenger[]
  keeps?: string
  onNameMontage: (passenger: Passenger) => void
  onName: (firstname: string, lastname: string) => void
  onSelectFiles: () => void
  onShift?: (anchorEpoch: number) => void
  onRename?: (name: string) => void
  onDelete?: () => void
  move?: React.ReactNode
  onTrimToJump?: () => void
  fileTo?: { places: string[]; onFile: (place: string) => void }
  end?: React.ReactNode
}) => {
  const [renaming, setRenaming] = useState(false)
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const montage = isMontage(group)
  const named = hasCompletePassenger(group.passenger)
  const fileCount = group.files.length
  const pictured = !group.freed && fileCount > 0 && !(montage && named)
  const tallied = tally(group.files, statusOf)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${name.toLowerCase()}`)
    .join(' · ')
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
                  className='flex h-[46px] w-full cursor-pointer items-center gap-2.5 rounded-full border-0 bg-pane p-2 text-left text-[14px] font-bold text-ink shadow-card hover:bg-accent-soft'>
                  <span className='grid size-[30px] flex-none place-items-center rounded-full bg-accent-soft text-accent'>
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
          <Mini onClick={onSelectFiles}>
            {t`Select its ${plural(fileCount, { one: '# file', other: '# files' })}`}
          </Mini>
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
                  className='cursor-text border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] text-ink hover:text-accent-ink hover:underline hover:decoration-dotted hover:underline-offset-[3px]'>
                  {label}
                </button>
              ) : (
                label
              )}
              <span className='font-sans text-[12.5px] font-medium tracking-normal text-ink-3'>
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
      {locked && locked !== UPLOADED_LOCKED && (
        <Part>
          <Lock>{locked}</Lock>
        </Part>
      )}
      {montage ? (
        <Part heading={t`Who it is for`}>
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

const StorageTwinPart = ({ name }: { name: string | null }) => {
  const twin = useStorageTwin(name)
  if (!twin) return null
  const dsm = twin.dsmHost ? dsmFolderUrl(twin.dsmHost, twin.file.path) : null
  return (
    <Part>
      <div className='flex flex-col gap-2.5 rounded-[16px] bg-up-soft px-4 py-3.5'>
        <b className='flex items-center gap-2'>
          <Icon
            name='storage'
            size={18}
            className='text-up'
          />
          {t`On the storage`}
        </b>
        <span className='font-mono text-[12px] break-all text-ink-3'>{twin.file.path}</span>
        {dsm && (
          <span className='flex'>
            <a
              href={dsm}
              target='_blank'
              rel='noreferrer'
              title={t`Show it in the storage’s own web interface, in a new tab`}
              className='inline-flex h-[34px] items-center justify-center gap-1.5 rounded-[11px] bg-accent px-3.5 text-[13px] font-bold whitespace-nowrap text-white no-underline'>
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
  where?: string
  jumpLabel: string | null
  status: ShownStatus
  proxy?: ProxyFact
  locked: string | null
  onOpen: () => void
  onSendBack: () => void
  backLabel: string
  onRetime?: (epoch: number) => void
  montage?: MontageOffer
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
              <span className='grid h-[52px] w-[52px] place-items-center rounded-full bg-white/[.92] text-[#10131a] shadow-[0_8px_24px_rgba(0,0,0,0.3)]'>
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
      {!locked && (
        <div className='mt-auto px-6 pt-4 pb-6'>
          <BinButton onClick={onSendBack}>{backLabel}</BinButton>
        </div>
      )}
    </>
  )
}

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
  where?: string
  statusOf: (file: ManifestFile) => FileStatus
  onSendBack: () => void
  backLabel: string
  onMakeJump?: (startsAt?: number) => void
  montage?: MontageOffer
  move?: React.ReactNode
  onClear: () => void
}) => {
  const [making, setMaking] = useState(false)
  const times = files.map((f) => f.mtime)
  const tallied = tally(files, statusOf)
  const notYet = tallied[0]?.[1] ?? 0
  return (
    <>
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
              <kbd className='rounded-[5px] bg-pane px-1.5 font-sans text-[10.5px] leading-4 font-semibold text-ink-3 shadow-[0_0_0_1px_var(--color-line)]'>
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
