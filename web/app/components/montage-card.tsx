import { plural, t } from '@lingui/core/macro'
import {
  filmNameOf,
  hasCompletePassenger,
  lastSegment,
  passengerFrom,
  passengerName,
  montageUploadKey
} from '@skydock/scripts'
import type { MontageFact } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini } from './buttons'
import { kindOf } from './file-list'
import { Icon } from './icons'
import { dsmFolderUrl } from '../helpers/dsm'
import { parcelsOfGroup } from '../helpers/parcels'
import type { Places } from '../helpers/parcels'
import type { Inside, Parcel } from '../helpers/parcels'
import { formatFilmSize, getFileUrl, getPictureUrl, hhmm, pad } from './utils'
import type { ManifestGroup } from './types'

/* a name typed in, as tall as the button beside it */
const FIELD =
  'h-[34px] min-w-0 flex-1 rounded-[10px] border border-transparent bg-well px-3 text-[13px] font-medium text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

/* A montage is named once, by one name — "Luc Favre", "Boogie 2026" — and the name *is* the folder
   it gets (RULES, Places). Renaming moves the montage, or joins it to another, so it is never done by
   clicking away: Enter or Save does it, Escape puts the name back, and an emptied field saves nothing. */
const PassengerName = ({
  group,
  passengers,
  onSave
}: {
  group: ManifestGroup
  passengers: Passenger[]
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
        <span className='text-[11.5px] font-medium text-accent-ink'>{t`Joins ${joined}’s montage`}</span>
      )}
    </span>
  )
}

type Passenger = NonNullable<ManifestGroup['passenger']>

/* the montage a name already belongs to, whatever its case — one name is one folder */
const sameName = (passengers: Passenger[], typed: Passenger) =>
  passengers.find((p) => passengerName(p).toLowerCase() === passengerName(typed).toLowerCase())

/* A few frames off the clips, which is how you tell who a montage belongs to. A name is read off a
   form or a face, so asking for one beside a pair of counts is asking somebody to remember what
   they saw on another screen. Videos first, and only then photos, because a face is more likely in
   the footage than in a burst of canopy shots. */
const PassengerFrames = ({
  group,
  alt,
  inline
}: {
  group: ManifestGroup
  alt: string
  /* on a jump's own line rather than on a card: the same frames, in a row the height of the line */
  inline?: boolean
}) => {
  const shown = [...group.files]
    .sort((a, b) => Number(kindOf(b) === 'video') - Number(kindOf(a) === 'video'))
    .slice(0, 4)
  if (shown.length === 0) return null
  if (inline)
    return (
      <span className='flex gap-[3px]'>
        {shown.map((file) => (
          <img
            key={file.id ?? file.path}
            src={getPictureUrl(file, undefined, 80)}
            alt={alt}
            loading='lazy'
            decoding='async'
            className='h-6 w-[34px] rounded-[6px] bg-well object-cover'
          />
        ))}
      </span>
    )
  return (
    /* four across, sharing the width, so the last one never spills off the card */
    <span className='mt-1.5 mb-0.5 grid grid-cols-4 gap-1'>
      {shown.map((file) => (
        <img
          key={file.id ?? file.path}
          src={getPictureUrl(file, undefined, 160)}
          alt={alt}
          loading='lazy'
          decoding='async'
          className='h-[42px] w-full min-w-0 rounded-[8px] bg-well object-cover'
        />
      ))}
    </span>
  )
}

/* Making a montage, named once, from what is on screen: the jump or the files and their name side by
   side, so nothing has to be dragged, or found again on another page.

   Never saved by clicking away: leaving here half-typed would have filed something by accident. So it
   is saved by Enter or the button, and Escape puts things back as they were.

   A name that is already a montage's joins it — one name is one folder — and says so before anything
   is saved. The comparison ignores case; what is saved is the name as it already is, so the two jumps
   do not end up in two folders spelled two ways.

   What already belongs to a place is copied in rather than moved, and `keeps` names that place, so
   the person knows before pressing that it keeps its own. */
const NameMontage = ({
  group,
  initial = '',
  keeps,
  passengers,
  framed = true,
  onSave,
  onCancel
}: {
  /* whose frames are shown beside the name; none when they are already on show */
  group?: ManifestGroup
  /* the name it starts with — a jump's own name, when it had one */
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
          className={`text-[11.5px] leading-normal ${joins ? 'font-medium text-accent-ink' : 'text-ink-3'}`}>
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

/* how long a film runs, the way a player writes it */
const runtime = (seconds: number | null) =>
  seconds === null ? null : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`

/* the render time in the address, so a film rendered again is fetched again rather than replayed
   from the browser's copy of the last one */
const filmUrl = (film: NonNullable<MontageFact['film']>) =>
  `${getFileUrl(film.path)}?v=${film.mtime}`

/* The film, once it exists: the one thing here nobody can make again — so it is a photograph of its
   own, above the montage it came from, with what it is written on it and, on it, what can be done
   with it next. It is watched right there, since the whole point is to check the render before it
   goes to anyone. How long it runs is what tells a whole jump from a test render of its first
   minute. The picture is a frame off the montage's own footage, the film having none of its own to
   show until it plays. The buttons sit on the picture, so they take its colours: the same buttons,
   drawn in white on the dark. */
const FilmStrip = ({
  facts,
  picture,
  children
}: {
  facts?: MontageFact
  picture?: string
  /* what can be done with the film, as buttons; without them it can only be watched */
  children?: React.ReactNode
}) => {
  const [watching, setWatching] = useState(false)
  if (!facts?.film) return null
  const film = facts.film
  const renderedAt = hhmm(film.mtime)
  return (
    <div
      className={`relative h-[250px] flex-none overflow-hidden rounded-[18px] bg-[#10131a] text-white shadow-card [--color-ink-2:rgba(255,255,255,0.8)] [--color-ink-3:rgba(255,255,255,0.7)] [--color-ink:#fff] [--color-line:rgba(255,255,255,0.3)] [--color-well:rgba(255,255,255,0.2)]`}>
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
          <span className='absolute inset-0 bg-[linear-gradient(90deg,rgba(8,12,22,0.86)_0%,rgba(8,12,22,0.6)_48%,rgba(8,12,22,0)_78%)]' />
          <div className='absolute top-0 right-[110px] bottom-0 left-[26px] z-[1] flex flex-col justify-center gap-2'>
            <span className='text-[11px] font-bold tracking-[0.1em] uppercase opacity-85'>
              {t`The film`}
            </span>
            <b className='font-display text-[27px] tracking-[-0.03em] break-words'>
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
            className='absolute top-1/2 right-[34px] z-[1] -mt-8 grid size-16 place-items-center rounded-full border-0 bg-white/92 text-[#10131a] hover:bg-white'>
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

/* While the montage has an edit, that the edit holds its files, with the lock that says so */
const FilmNote = ({ locked }: { locked?: string | null }) =>
  locked && (
    <div className='flex items-center gap-3.5 rounded-[12px] bg-well px-3.5 py-3'>
      <Icon
        name='lock'
        className='text-ink-2'
      />
      <span className='text-[11.5px] leading-normal text-ink-3'>{locked}</span>
    </div>
  )

/* The editor is opened by hand — SkyDock runs where it cannot start an application on the machine
   you are sitting at — so the least it can do is say exactly which file, spelled the way that
   machine knows it, and hand it over without anyone reading a path off the screen. */
const ProjectPath = ({ path: projectPath }: { path: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(projectPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard access can be refused; the full path is in the tooltip either way */
    }
  }
  return (
    <button
      type='button'
      onClick={copy}
      title={`${projectPath}\n\n${t`Click to copy`}`}
      className='max-w-full truncate border-0 bg-transparent p-0 font-mono text-[11.5px] text-ink-3 hover:text-accent-ink'>
      {copied ? t`✓ copied` : `${projectPath} ⧉`}
    </button>
  )
}

/* One step at a time, always in the same place. The three are distinct and never offered out of
   order (RULES, The board): Process copies and crops here, Make the project writes the project the editor
   opens, Deliver hands over what was rendered. Deliver stays enabled with no film yet, because a
   disabled button cannot say why — and pressing it is also how the board looks again, there being
   nothing that notices a render finishing. */
const MontageCardActions = ({
  group,
  facts,
  busy,
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
  /* what is being uploaded, anywhere — one at a time, so no other upload is offered meanwhile */
  upload?: { key: string; label: string } | null
  blocked: { blocked: boolean; message: string | null }
  /* how many of its clips are still getting their proxy — the project waits for them */
  proxiesWaiting?: number
  named: boolean
  onProcess: () => void
  /* stops the processing this montage started, while it runs */
  onCancelProcess?: () => void
  onMontage: () => void
  onOpenMontage: () => void
  onUpload: () => void
  /* given when emailing the link is the step it is at: it comes first, and Upload again steps back */
  onEmail?: { name: string; open: () => void }
  /* offered once it is uploaded: delete it from this machine, on proof the storage holds it */
  onFree?: () => void
  /* only the one button that takes the step it is at — the rest are in the page's menu */
  compact?: boolean
  /* buttons of the film's own, beside the others */
  children?: React.ReactNode
}) => {
  const working = busy !== null
  const uploadKey = montageUploadKey(group.id)
  const uploading = upload?.label ?? ''
  if (!group.processed)
    return (
      <span className='flex flex-wrap items-center gap-2'>
        <Go
          disabled={working || !named}
          onClick={onProcess}>
          {busy === group.id ? t`Processing…` : t`Process`}
        </Go>
        {busy === group.id && onCancelProcess && <Mini onClick={onCancelProcess}>{t`Cancel`}</Mini>}
      </span>
    )
  if (!facts?.project)
    return (
      <span className='flex flex-wrap items-center gap-2'>
        {/* The editor opens on proxies, and a project made before them opens on the full clips, so
            it waits until each clip has one, or has failed to get one (RULES, The editing project). */}
        {proxiesWaiting > 0 && (
          <span className='text-[12px] text-ink-3'>
            {plural(proxiesWaiting, {
              one: 'waiting for # proxy',
              other: 'waiting for # proxies'
            })}
          </span>
        )}
        <Go
          disabled={working || proxiesWaiting > 0}
          title={
            proxiesWaiting > 0
              ? t`${plural(proxiesWaiting, { one: '# clip is', other: '# clips are' })} still getting a proxy — the project can be made once each one has it, or has failed to`
              : t`Write the kdenlive project — clips laid out, render destination set — and open it`
          }
          onClick={onMontage}>
          {busy === group.id ? t`Writing…` : t`Make the project`}
        </Go>
      </span>
    )
  if (compact) {
    /* the next step is the one thing on the page's card; whatever else can be done is in the menu */
    if (onEmail)
      return (
        <Go
          disabled={working}
          title={t`Everything is on the storage — send the link to whoever the film is for`}
          onClick={onEmail.open}>
          {t`Email ${onEmail.name}…`}
        </Go>
      )
    if (!facts.film)
      return (
        <Go
          disabled={working}
          title={t`Open this project in the editor`}
          onClick={onOpenMontage}>
          {busy === `open:${group.id}` ? t`Opening…` : t`Open in kdenlive`}
        </Go>
      )
    if (!group.uploaded)
      return (
        <Go
          disabled={working || blocked.blocked || upload !== null}
          title={blocked.message ?? undefined}
          onClick={onUpload}>
          {upload?.key === uploadKey ? t`Uploading…` : t`Upload…`}
        </Go>
      )
    return onFree ? (
      <Go
        disabled={working}
        title={t`Delete it from this machine — only once the storage is proved to hold every file`}
        onClick={onFree}>
        {busy === `free:${group.id}` ? t`Checking the storage…` : t`Free up space…`}
      </Go>
    ) : null
  }
  /* Upload again steps back, to a quieter button, once emailing is the step it is at */
  const Upload = onEmail ? Mini : Go
  return (
    <span className='flex flex-wrap items-center gap-2'>
      {onEmail && (
        <Go
          disabled={working}
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
        disabled={working || blocked.blocked || upload !== null}
        title={
          upload && upload.key !== uploadKey
            ? t`Uploading ${uploading} — wait for it, or cancel it`
            : (blocked.message ??
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
        disabled={working}
        title={t`Open this project in the editor`}
        onClick={onOpenMontage}>
        <Icon
          name='open'
          size={14}
          className='text-ink-2'
        />
        {busy === `open:${group.id}` ? t`Opening…` : t`Open in kdenlive`}
      </Mini>
      {/* A montage with an edit is prepared again like any other: the copies are rewritten under the
          same names and the project is left where it is, so a trim or a frame corrected afterwards
          can still reach the footage the editor plays (RULES, The editing project). */}
      <Mini
        disabled={working}
        title={t`Make the copies again from the originals — the project, the film and the archives are left alone`}
        onClick={onProcess}>
        {busy === group.id ? t`Processing…` : t`Process again`}
      </Mini>
      {group.uploaded && onFree && (
        <Mini
          disabled={working}
          title={t`Delete it from this machine — only once the storage is proved to hold every file`}
          onClick={onFree}>
          {busy === `free:${group.id}` ? t`Checking the storage…` : t`Free up space…`}
        </Mini>
      )}
      {children}
      {/* the film itself is shown above the montage once it exists */}
      {!facts.film && <span className='text-[11.5px] text-ink-3'>{t`edit and render it`}</span>}
      <span className='basis-full'>
        <ProjectPath path={facts.projectPath} />
      </span>
    </span>
  )
}

/* Once it is uploaded, what matters is what is on the NAS — not the files it was made from. One
   parcel per folder up there, each listing exactly what is in it, and for a zip what is inside the
   zip. That is what makes an uploaded montage worth opening months later. */

/* how many files a folder inside a zip names before it says how many more */
const INSIDE_SHOWN = 3

/* what a folder inside a zip holds: how many, and — where the names are known — the first of them, the
   rest a press away */
const FolderInside = ({ line }: { line: Extract<Inside, { kind: 'folder' }> }) => {
  const [all, setAll] = useState(false)
  const count = line.count
  const named = all ? line.files : line.files.slice(0, INSIDE_SHOWN)
  const more = line.files.length - named.length
  return (
    <div>
      <span className='flex items-baseline gap-2'>
        <span className='font-mono text-[11.5px] font-semibold text-ink-2'>{line.name}</span>
        <span className='text-[11.5px] text-ink-3'>
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
          className='block truncate pl-4 font-mono text-[11px]'>
          {name}
        </span>
      ))}
      {line.files.length > INSIDE_SHOWN && (
        <button
          type='button'
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className='ml-4 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-accent-ink hover:underline'>
          {all ? t`Show fewer` : t`+ ${more} more — show all`}
        </button>
      )}
    </div>
  )
}

/* what is in a zip, or in a folder sent as it is */
const InsideList = ({ inside }: { inside: Inside[] }) => (
  <div className='mt-0.5 mb-1.5 ml-[30px] flex flex-col gap-1 border-l border-line-2 pl-3 text-ink-3'>
    <span className='text-[10.5px] font-semibold tracking-[0.06em] uppercase'>{t`Inside`}</span>
    {inside.map((line) =>
      line.kind === 'folder' ? (
        <FolderInside
          key={line.name}
          line={line}
        />
      ) : (
        <span
          key={line.name}
          className='font-mono text-[11.5px] text-ink-2'>
          {line.name}
        </span>
      )
    )}
  </div>
)

/* One thing in a folder up there. A zip, or a folder sent as it is, is closed until its row is pressed,
   and pressed again closes it: what is inside it is there to look at, and out of the way when it is not.
   Any other row opens the storage's own web interface on its folder, in a new tab. What was sent and
   is not there now is said so, and has nothing to open. */
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
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-ink no-underline hover:bg-well'
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
        className={`min-w-0 flex-1 truncate font-mono text-[12px] ${missing ? 'text-ink-3 line-through' : ''}`}
        title={item.name}>
        {item.name}
      </span>
      {missing && (
        <span className='inline-flex h-[22px] flex-none items-center rounded-full bg-local-soft px-[9px] text-[11.5px] font-bold whitespace-nowrap text-local'>
          {t`no longer on the storage`}
        </span>
      )}
      <span className='flex-none text-[12.5px] whitespace-nowrap text-ink-3'>{item.what}</span>
      {item.size ? (
        <span className='mr-1 flex-none text-[12.5px] whitespace-nowrap text-ink-3'>
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
  /* where each item the storage no longer holds was: its folder and name */
  gone?: Set<string>
  /* what can be done to an item the folder holds, as buttons at the end of its row */
  itemActions?: (dir: string, name: string) => React.ReactNode
  /* its folder's link taken away */
  onLink?: (dir: string, make: boolean) => void
  /* no link line at the foot: the link is the panel's */
  quiet?: boolean
}) => {
  /* its folder in the storage's own web interface, opened in a new tab: what is up there is looked
     for there, and each file is shown by the folder it is in */
  const dsm = dsmHost ? dsmFolderUrl(dsmHost, parcel.dir) : null
  return (
    <div className='mt-2.5 overflow-hidden rounded-[16px] shadow-[0_0_0_1px_var(--color-line)]'>
      <div className='flex flex-wrap items-center gap-2.5 bg-well px-3.5 py-[11px] text-[12.5px]'>
        {parcel.title && <b className='font-bold'>{parcel.title}</b>}
        {dsm ? (
          <a
            href={dsm}
            target='_blank'
            rel='noreferrer'
            title={t`Show this folder in the storage’s own web interface, in a new tab`}
            className='font-mono text-[11.5px] text-accent-ink hover:underline'>
            {parcel.dir}
          </a>
        ) : (
          <span className='font-mono text-[11.5px] text-ink-3'>{parcel.dir}</span>
        )}
        <span className='ml-auto text-[11.5px] text-ink-3'>{parcel.tag}</span>
      </div>
      <div className='px-1.5 py-1'>
        {parcel.items.map((item) => (
          <ParcelRow
            key={item.key}
            item={item}
            dir={parcel.dir}
            dsm={dsm}
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
            <span className='text-[11.5px] text-ink-3'>{t`No link`}</span>
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
              className='truncate font-mono text-[11px] text-accent-ink hover:underline'>
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

/* every parcel of a montage, as handed over */
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

/* Uploaded, then gone from the storage: the montage reads as not uploaded again, and this says why —
   silently dropping the tick would look like SkyDock had forgotten, not like the files had gone. */
const GoneFromStorage = ({ gone, at }: { gone: { remotePath: string }[]; at?: number }) => {
  if (gone.length === 0) return null
  const uploadedOn = at ? new Date(at * 1000).toLocaleDateString('de-CH') : ''
  return (
    <p className='mt-2.5 mb-0 rounded-[12px] bg-changed-soft px-3.5 py-2.5 text-[12.5px] text-changed'>
      {at ? t`Uploaded ${uploadedOn}, but ` : ''}
      {plural(gone.length, {
        one: 'this is no longer on the storage:',
        other: 'these are no longer on the storage:'
      })}{' '}
      <code className='font-mono text-[11.5px]'>
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
  /* the destinations the board knows, to name each folder the montage went to */
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
