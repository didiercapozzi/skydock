import { plural, t } from '@lingui/core/macro'
import {
  filmNameOf,
  hasCompletePassenger,
  lastSegment,
  passengerFrom,
  passengerName,
  montageUploadKey
} from '@skydock/scripts/client'
import type { Busy, MontageFact } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini } from './buttons'
import { kindOf } from './file-list'
import { Icon } from './icons'
import { dsmFolderUrl } from '../helpers/dsm'
import { heldNote } from '../helpers/notes'
import { parcelsOfGroup } from '../helpers/parcels'
import type { Places } from '../helpers/parcels'
import type { Inside, Parcel } from '../helpers/parcels'
import { formatFilmSize, getFileUrl, getPictureUrl, hhmm, pad } from './utils'
import type { ManifestGroup } from './types'

const FIELD =
  'h-control min-w-0 flex-1 rounded-corner border border-transparent bg-well px-3 text-body font-medium text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

const PassengerName = ({
  group,
  passengers,
  note,
  onSave
}: {
  group: ManifestGroup
  passengers: Passenger[]
  note?: string
  onSave: (firstname: string, lastname: string) => void
}) => {
  const was = passengerName(group.passenger)
  const [name, setName] = useState(was)
  const typed = passengerFrom(name)
  const changed = hasCompletePassenger(typed) && passengerName(typed) !== was
  const joins = changed ? sameName(passengers, typed) : undefined
  const save = () => {
    if (!changed) return
    const { firstname, lastname } = joins ?? typed
    onSave(firstname, lastname)
  }
  const joined = joins ? passengerName(joins) : ''
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='flex flex-col gap-2'>
      <span className='flex gap-1.5'>
        <input
          type='text'
          value={name}
          placeholder={t`Name`}
          aria-label={t`Name`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setName(was)
          }}
          className={FIELD}
        />
        {changed && <Go onClick={save}>{t`Save`}</Go>}
        {changed && <Mini onClick={() => setName(was)}>{t`Cancel`}</Mini>}
      </span>
      {joins && (
        <span className='text-micro font-medium text-accent-ink'>{t`Joins ${joined}’s montage`}</span>
      )}
      {changed && note && <span className='text-micro text-ink-3'>{note}</span>}
    </span>
  )
}

type Passenger = NonNullable<ManifestGroup['passenger']>

const sameName = (passengers: Passenger[], typed: Passenger) =>
  passengers.find((p) => passengerName(p).toLowerCase() === passengerName(typed).toLowerCase())

const PassengerFrames = ({
  group,
  alt,
  inline
}: {
  group: ManifestGroup
  alt: string
  inline?: boolean
}) => {
  const shown = [...group.files]
    .sort((a, b) => Number(kindOf(b) === 'video') - Number(kindOf(a) === 'video'))
    .slice(0, 4)
  if (shown.length === 0) return null
  if (inline)
    return (
      <span className='flex gap-0.75'>
        {shown.map((file) => (
          <img
            key={file.id ?? file.path}
            src={getPictureUrl(file, undefined, 80)}
            alt={alt}
            loading='lazy'
            decoding='async'
            className='h-6 w-control rounded-corner bg-well object-cover'
          />
        ))}
      </span>
    )
  return (
    <span className='mt-1.5 mb-0.5 grid grid-cols-4 gap-1'>
      {shown.map((file) => (
        <img
          key={file.id ?? file.path}
          src={getPictureUrl(file, undefined, 160)}
          alt={alt}
          loading='lazy'
          decoding='async'
          className='h-control-lg w-full min-w-0 rounded-corner bg-well object-cover'
        />
      ))}
    </span>
  )
}

const NameMontage = ({
  group,
  initial = '',
  keeps,
  passengers,
  framed = true,
  onSave,
  onCancel
}: {
  group?: ManifestGroup
  initial?: string
  keeps?: string
  passengers: Passenger[]
  framed?: boolean
  onSave: (passenger: Passenger) => void
  onCancel?: () => void
}) => {
  const [name, setName] = useState(initial)
  const typed = passengerFrom(name)
  const complete = hasCompletePassenger(typed)
  const joins = complete ? sameName(passengers, typed) : undefined
  const save = () => {
    if (!complete) return
    onSave(joins ?? typed)
  }
  const copied = keeps ? t` — copied, ${keeps} keeps its own` : ''
  const joined = joins ? passengerName(joins) : ''
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='flex flex-col gap-2'>
      {framed && group && (
        <PassengerFrames
          group={group}
          alt=''
          inline
        />
      )}
      <span className='flex gap-1.5'>
        <input
          type='text'
          value={name}
          placeholder={t`Name`}
          aria-label={t`Name`}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onCancel?.()
          }}
          className={FIELD}
        />
        <Go
          disabled={!complete}
          onClick={save}>
          {joins ? t`Join montage` : keeps ? t`Copy into montage` : t`Make montage`}
        </Go>
      </span>
      <span className='flex items-start justify-between gap-2'>
        <span
          className={`text-micro leading-normal ${joins ? 'font-medium text-accent-ink' : 'text-ink-3'}`}>
          {joins
            ? t`Joins ${joined}’s montage${copied}`
            : complete
              ? t`A new montage${copied}`
              : t`A name: a person, an event`}
        </span>
        {onCancel && <Mini onClick={onCancel}>{t`Cancel`}</Mini>}
      </span>
    </span>
  )
}

const runtime = (seconds: number | null) =>
  seconds === null ? null : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`

const filmUrl = (film: NonNullable<MontageFact['film']>) =>
  `${getFileUrl(film.path)}?v=${film.mtime}`

const FilmStrip = ({
  facts,
  picture,
  children
}: {
  facts?: MontageFact
  picture?: string
  children?: React.ReactNode
}) => {
  const [watching, setWatching] = useState(false)
  if (!facts?.film) return null
  const film = facts.film
  const renderedAt = hhmm(film.mtime)
  return (
    <div
      className={`relative h-62.5 flex-none overflow-hidden rounded-corner bg-stage text-white shadow-card [--color-ink-2:rgba(255,255,255,0.8)] [--color-ink-3:rgba(255,255,255,0.7)] [--color-ink:#fff] [--color-line:rgba(255,255,255,0.3)] [--color-well:rgba(255,255,255,0.2)]`}>
      {watching ? (
        <>
          <video
            src={filmUrl(film)}
            controls
            autoPlay
            className='h-full w-full bg-black'
          />
          <button
            type='button'
            aria-label={t`Close the player`}
            title={t`Close the player`}
            onClick={() => setWatching(false)}
            className='absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border-0 bg-black/60 text-white hover:bg-black/80'>
            <Icon
              name='close'
              size={14}
            />
          </button>
        </>
      ) : (
        <>
          {picture && (
            <img
              src={picture}
              alt=''
              className='absolute inset-0 h-full w-full object-cover'
            />
          )}
          <span className='absolute inset-0 bg-(image:--gradient-veil-side)' />
          <div className='absolute top-0 right-27.5 bottom-0 left-6.5 z-1 flex flex-col justify-center gap-2'>
            <span className='text-micro font-bold tracking-eyebrow uppercase opacity-85'>
              {t`The film`}
            </span>
            <b className='font-display text-display tracking-display break-words'>
              {filmNameOf(facts.baseName)}
            </b>
            <span className='font-semibold opacity-90'>
              {[runtime(film.seconds), formatFilmSize(film.size), t`rendered ${renderedAt}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <div className='mt-2 flex flex-wrap items-center gap-2.5'>{children}</div>
          </div>
          <button
            type='button'
            aria-label={t`Watch the film here`}
            title={t`Watch the film here`}
            onClick={() => setWatching(true)}
            className='absolute top-1/2 right-8.5 z-1 -mt-8 grid size-16 place-items-center rounded-full border-0 bg-white/92 text-stage-ink hover:bg-white'>
            <Icon
              name='play'
              size={26}
            />
          </button>
        </>
      )}
    </div>
  )
}

const FilmNote = ({ locked }: { locked?: string | null }) =>
  locked && (
    <div className='flex items-center gap-3.5 rounded-corner bg-well px-3.5 py-3'>
      <Icon
        name='lock'
        className='text-ink-2'
      />
      <span className='text-micro leading-normal text-ink-3'>{locked}</span>
    </div>
  )

const MontageCardActions = ({
  group,
  facts,
  busy,
  held = null,
  upload = null,
  blocked,
  proxiesWaiting = 0,
  named,
  onProcess,
  onCancelProcess,
  onMontage,
  onOpenMontage,
  onUpload,
  onEmail,
  onFree,
  compact = false,
  children
}: {
  group: ManifestGroup
  facts?: MontageFact
  busy: string | null
  held?: Busy | null
  upload?: { key: string; label: string } | null
  blocked: { blocked: boolean; message: string | null }
  proxiesWaiting?: number
  named: boolean
  onProcess: () => void
  onCancelProcess?: () => void
  onMontage: () => void
  onOpenMontage: () => void
  onUpload: () => void
  onEmail?: { name: string; open: () => void }
  onFree?: () => void
  compact?: boolean
  children?: React.ReactNode
}) => {
  const working = busy !== null
  const processing = busy === group.id || held === 'processing'
  const heldSaid = held ? heldNote(held) : undefined
  const uploadKey = montageUploadKey(group.id)
  const uploading = upload?.label ?? ''
  if (!group.processed)
    return (
      <span className='flex flex-wrap items-center gap-2'>
        <Go
          disabled={working || !named || held !== null}
          title={heldSaid}
          onClick={onProcess}>
          {processing ? t`Processing…` : t`Process`}
        </Go>
        {processing && onCancelProcess && <Mini onClick={onCancelProcess}>{t`Cancel`}</Mini>}
      </span>
    )
  if (!facts?.edit)
    return (
      <span className='flex flex-wrap items-center gap-2'>
        {proxiesWaiting > 0 && (
          <span className='text-small text-ink-3'>
            {plural(proxiesWaiting, {
              one: 'waiting for # proxy',
              other: 'waiting for # proxies'
            })}
          </span>
        )}
        <Go
          title={
            proxiesWaiting > 0
              ? t`Open the film editor with the clips laid end to end — ${plural(proxiesWaiting, { one: '# clip plays', other: '# clips play' })} at full size until its small copy is made`
              : t`Open the film editor with the clips laid end to end`
          }
          onClick={onMontage}>
          {t`Edit the film`}
        </Go>
      </span>
    )
  if (compact) {
    if (onEmail)
      return (
        <Go
          title={t`Everything is on the storage — send the link to whoever the film is for`}
          onClick={onEmail.open}>
          {t`Email ${onEmail.name}…`}
        </Go>
      )
    if (!facts.film)
      return (
        <Go
          title={t`Open the film editor`}
          onClick={onOpenMontage}>
          {t`Edit the film`}
        </Go>
      )
    if (!group.uploaded)
      return (
        <Go
          disabled={working || blocked.blocked || upload !== null || held !== null}
          title={blocked.message ?? heldSaid}
          onClick={onUpload}>
          {upload?.key === uploadKey ? t`Uploading…` : t`Upload…`}
        </Go>
      )
    return onFree ? (
      <Go
        disabled={working || held !== null}
        title={
          heldSaid ??
          t`Delete it from this machine — only once the storage is proved to hold every file`
        }
        onClick={onFree}>
        {busy === `free:${group.id}` ? t`Checking the storage…` : t`Free up space…`}
      </Go>
    ) : null
  }
  const Upload = onEmail ? Mini : Go
  return (
    <span className='flex flex-wrap items-center gap-2'>
      {onEmail && (
        <Go
          title={t`Everything is on the storage — send the link to whoever the film is for`}
          onClick={onEmail.open}>
          <Icon
            name='mail'
            size={14}
            weight={2}
          />
          {t`Email ${onEmail.name}…`}
        </Go>
      )}
      <Upload
        disabled={working || blocked.blocked || upload !== null || held !== null}
        title={
          upload && upload.key !== uploadKey
            ? t`Uploading ${uploading} — wait for it, or cancel it`
            : (blocked.message ??
              heldSaid ??
              t`Zip the photos and the rushes, then send the film and the photos to the montage’s folder`)
        }
        onClick={onUpload}>
        <Icon
          name='upload'
          size={14}
          weight={2}
        />
        {upload?.key === uploadKey ? t`Uploading…` : group.uploaded ? t`Upload again…` : t`Upload…`}
      </Upload>
      <Mini
        title={t`Open the film editor`}
        onClick={onOpenMontage}>
        <Icon
          name='open'
          size={14}
          className='text-ink-2'
        />
        {t`Edit the film`}
      </Mini>
      <Mini
        disabled={working || held !== null}
        title={
          heldSaid ??
          t`Make the copies again from the originals — the edit, the film and the archives are left alone`
        }
        onClick={onProcess}>
        {processing ? t`Processing…` : t`Process again`}
      </Mini>
      {processing && onCancelProcess && <Mini onClick={onCancelProcess}>{t`Cancel`}</Mini>}
      {group.uploaded && onFree && (
        <Mini
          disabled={working || held !== null}
          title={
            heldSaid ??
            t`Delete it from this machine — only once the storage is proved to hold every file`
          }
          onClick={onFree}>
          {busy === `free:${group.id}` ? t`Checking the storage…` : t`Free up space…`}
        </Mini>
      )}
      {children}
      {!facts.film && <span className='text-micro text-ink-3'>{t`edit and render it`}</span>}
    </span>
  )
}

const INSIDE_SHOWN = 3

const FolderInside = ({ line }: { line: Extract<Inside, { kind: 'folder' }> }) => {
  const [all, setAll] = useState(false)
  const count = line.count
  const named = all ? line.files : line.files.slice(0, INSIDE_SHOWN)
  const more = line.files.length - named.length
  return (
    <div>
      <span className='flex items-baseline gap-2'>
        <span className='font-mono text-micro font-semibold text-ink-2'>{line.name}</span>
        <span className='text-micro text-ink-3'>
          {line.name === 'videos/'
            ? plural(count, { one: '# clip', other: '# clips' })
            : line.name === 'photos/'
              ? plural(count, { one: '# photo', other: '# photos' })
              : plural(count, { one: '# file', other: '# files' })}
        </span>
      </span>
      {named.map((name) => (
        <span
          key={name}
          className='block truncate pl-4 font-mono text-micro'>
          {name}
        </span>
      ))}
      {line.files.length > INSIDE_SHOWN && (
        <button
          type='button'
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className='ml-4 cursor-pointer border-0 bg-transparent p-0 text-micro font-semibold text-accent-ink hover:underline'>
          {all ? t`Show fewer` : t`+ ${more} more — show all`}
        </button>
      )}
    </div>
  )
}

const InsideList = ({ inside }: { inside: Inside[] }) => (
  <div className='mt-0.5 mb-1.5 ml-7.5 flex flex-col gap-1 border-l border-line-2 pl-3 text-ink-3'>
    <span className='text-micro font-semibold tracking-eyebrow uppercase'>{t`Inside`}</span>
    {inside.map((line) =>
      line.kind === 'folder' ? (
        <FolderInside
          key={line.name}
          line={line}
        />
      ) : (
        <span
          key={line.name}
          className='font-mono text-micro text-ink-2'>
          {line.name}
        </span>
      )
    )}
  </div>
)

const ParcelRow = ({
  item,
  dir,
  dsm,
  missing,
  actions
}: {
  item: Parcel['items'][number]
  dir: string
  dsm: string | null
  missing: boolean
  actions?: (dir: string, name: string) => React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const holds = Boolean(item.inside && item.inside.length > 0) && !missing
  const ROW =
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-corner px-2 py-1.5 text-ink no-underline hover:bg-well'
  const body = (
    <>
      {holds && (
        <Icon
          name='next'
          size={12}
          className={`flex-none text-ink-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate font-mono text-small ${missing ? 'text-ink-3 line-through' : ''}`}
        title={item.name}>
        {item.name}
      </span>
      {missing && (
        <span className='inline-flex h-chip flex-none items-center rounded-full bg-pane shadow-hairline px-2.25 text-micro font-bold whitespace-nowrap text-local'>
          {t`no longer on the storage`}
        </span>
      )}
      <span className='flex-none text-body whitespace-nowrap text-ink-3'>{item.what}</span>
      {item.size ? (
        <span className='mr-1 flex-none text-body whitespace-nowrap text-ink-3'>
          {formatFilmSize(item.size)}
        </span>
      ) : null}
    </>
  )
  return (
    <div>
      <div className='flex items-center gap-2'>
        {holds ? (
          <button
            type='button'
            aria-expanded={open}
            title={open ? t`Close what is inside` : t`Show what is inside`}
            onClick={() => setOpen(!open)}
            className={`${ROW} cursor-pointer border-0 bg-transparent text-left`}>
            {body}
          </button>
        ) : (
          <a
            href={dsm && !missing ? dsm : undefined}
            target='_blank'
            rel='noreferrer'
            title={
              dsm && !missing
                ? t`Show it in the storage’s own web interface, in a new tab`
                : undefined
            }
            className={`${ROW} ${dsm && !missing ? 'cursor-pointer' : 'cursor-default'}`}>
            {body}
          </a>
        )}
        {!missing && actions?.(dir, item.name)}
      </div>
      {holds && open && item.inside && <InsideList inside={item.inside} />}
    </div>
  )
}

const NasCard = ({
  parcel,
  dsmHost,
  gone,
  itemActions,
  onLink,
  quiet = false
}: {
  parcel: Parcel
  dsmHost?: string | null
  gone?: Set<string>
  itemActions?: (dir: string, name: string) => React.ReactNode
  onLink?: (dir: string, make: boolean) => void
  quiet?: boolean
}) => {
  const dsm = dsmHost ? dsmFolderUrl(dsmHost, parcel.dir) : null
  return (
    <div className='mt-2.5 rounded-corner shadow-hairline'>
      <div className='flex flex-wrap items-center gap-2.5 rounded-t-corner bg-well px-3.5 py-2.75 text-body'>
        {parcel.title && <b className='font-bold'>{parcel.title}</b>}
        {dsm ? (
          <a
            href={dsm}
            target='_blank'
            rel='noreferrer'
            title={t`Show this folder in the storage’s own web interface, in a new tab`}
            className='font-mono text-micro text-accent-ink hover:underline'>
            {parcel.dir}
          </a>
        ) : (
          <span className='font-mono text-micro text-ink-3'>{parcel.dir}</span>
        )}
        <span className='ml-auto text-micro text-ink-3'>{parcel.tag}</span>
      </div>
      <div className='px-1.5 py-1'>
        {parcel.items.map((item) => (
          <ParcelRow
            key={item.key}
            item={item}
            dir={parcel.dir}
            dsm={dsmHost ? dsmFolderUrl(dsmHost, `${parcel.dir}/${item.name}`) : null}
            missing={gone?.has(`${parcel.dir}/${item.name}`) ?? false}
            actions={itemActions}
          />
        ))}
        {!quiet && !parcel.shareUrl && onLink && (
          <div className='mt-1 flex items-center gap-2.5 border-t border-line-2 px-2 pt-2 pb-1.5'>
            <Icon
              name='link'
              size={14}
              className='text-ink-3'
            />
            <span className='text-micro text-ink-3'>{t`No link`}</span>
            <span className='ml-auto'>
              <Mini
                title={t`Make a link to its folder, to send`}
                onClick={() => onLink(parcel.dir, true)}>
                {t`Create link`}
              </Mini>
            </span>
          </div>
        )}
        {!quiet && parcel.shareUrl && (
          <div className='mt-1 flex items-center gap-2.5 border-t border-line-2 px-2 pt-2 pb-1.5'>
            <Icon
              name='link'
              size={14}
              className='text-ink-3'
            />
            <a
              href={parcel.shareUrl}
              target='_blank'
              rel='noreferrer'
              className='truncate font-mono text-micro text-accent-ink hover:underline'>
              {parcel.shareUrl}
            </a>
            {onLink && (
              <span className='ml-auto flex flex-none items-center gap-1.5'>
                <Mini
                  title={t`Copy the link`}
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(parcel.shareUrl ?? '')
                      .catch(() => undefined)
                  }>
                  {t`Copy link`}
                </Mini>
                <Mini
                  title={t`Take the link away — the folder stays where it is`}
                  onClick={() => onLink(parcel.dir, false)}>
                  {t`Remove link`}
                </Mini>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const ParcelCards = ({
  parcels,
  dsmHost,
  gone,
  itemActions,
  onLink,
  quiet
}: {
  parcels: Parcel[]
  dsmHost?: string | null
  gone?: Set<string>
  itemActions?: (dir: string, name: string) => React.ReactNode
  onLink?: (dir: string, make: boolean) => void
  quiet?: boolean
}) => (
  <>
    {parcels.map((parcel) => (
      <NasCard
        key={parcel.key}
        parcel={parcel}
        dsmHost={dsmHost}
        gone={gone}
        itemActions={itemActions}
        onLink={onLink}
        quiet={quiet}
      />
    ))}
  </>
)

const GoneFromStorage = ({ gone, at }: { gone: { remotePath: string }[]; at?: number }) => {
  if (gone.length === 0) return null
  const uploadedOn = at ? new Date(at * 1000).toLocaleDateString('de-CH') : ''
  return (
    <p className='mt-2.5 mb-0 rounded-corner bg-changed-soft px-3.5 py-2.5 text-body text-changed'>
      {at ? t`Uploaded ${uploadedOn}, but ` : ''}
      {plural(gone.length, {
        one: 'this is no longer on the storage:',
        other: 'these are no longer on the storage:'
      })}{' '}
      <code className='font-mono text-micro'>
        {gone.map((f) => lastSegment(f.remotePath)).join(', ')}
      </code>{' '}
      {plural(gone.length, {
        one: '— upload again to put it back.',
        other: '— upload again to put them back.'
      })}
    </p>
  )
}

const UploadedCards = ({
  group,
  dsmHost,
  gone,
  itemActions,
  onLink,
  places,
  quiet
}: {
  group: ManifestGroup
  dsmHost?: string | null
  places?: Places
  gone?: Set<string>
  itemActions?: (dir: string, name: string) => React.ReactNode
  onLink?: (dir: string, make: boolean) => void
  quiet?: boolean
}) => (
  <ParcelCards
    parcels={parcelsOfGroup(group, places)}
    dsmHost={dsmHost}
    gone={gone}
    itemActions={itemActions}
    onLink={onLink}
    quiet={quiet}
  />
)

export {
  NameMontage,
  ParcelCards,
  UploadedCards,
  GoneFromStorage,
  FilmNote,
  FilmStrip,
  PassengerName,
  MontageCardActions
}
export type { Passenger }
