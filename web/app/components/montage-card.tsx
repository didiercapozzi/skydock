import { plural, t } from '@lingui/core/macro'
import {
  filmNameOf,
  hasCompletePassenger,
  lastSegment,
  parentOf,
  passengerFrom,
  passengerName,
  montageUploadKey
} from '@skydock/scripts'
import type { MontageFact } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini } from './buttons'
import { kindOf } from './file-list'
import { formatFilmSize, getFileUrl, getPictureUrl, hhmm, pad } from './utils'
import type { ManifestGroup } from './types'

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
      className='flex flex-wrap items-center gap-1.5'>
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
        className='w-full max-w-[16rem] rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px]'
      />
      {changed && (
        <>
          {joins && (
            <span className='text-[11px] font-semibold text-accent'>{t`Joins ${joined}’s montage`}</span>
          )}
          <Go onClick={save}>{t`Save`}</Go>
          <Mini onClick={() => setName(was)}>{t`Cancel`}</Mini>
        </>
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
            className='h-6 w-[34px] rounded-[3px] bg-line-2 object-cover'
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
          className='h-[42px] w-full min-w-0 rounded-[4px] bg-line-2 object-cover'
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
      className='flex flex-wrap items-center gap-1.5'>
      {framed && group && (
        <PassengerFrames
          group={group}
          alt=''
          inline
        />
      )}
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
        className='w-44 rounded-[5px] border border-pick bg-pane px-[7px] py-0.5 text-[12px] text-ink'
      />
      <span
        className={`min-w-[128px] text-[11px] ${joins ? 'font-semibold text-accent' : 'text-ink-3'}`}>
        {joins
          ? t`Joins ${joined}’s montage${copied}`
          : complete
            ? t`A new montage${copied}`
            : t`A name: a person, an event`}
      </span>
      <Go
        disabled={!complete}
        onClick={save}>
        {joins ? t`Join montage` : keeps ? t`Copy into montage` : t`Make montage`}
      </Go>
      {onCancel && <Mini onClick={onCancel}>{t`Cancel`}</Mini>}
    </span>
  )
}

/* the film, once it exists: the one thing here nobody can make again — so it is said out loud, above
   the montage it came from, rather than as a size beside its buttons. How long it runs is what tells a
   whole jump from a test render of its first minute. */
const FilmStrip = ({ facts }: { facts?: MontageFact }) => {
  const [watching, setWatching] = useState(false)
  if (!facts?.film) return null
  const { seconds, size, mtime } = facts.film
  /* the render time in the address, so a film rendered again is fetched again rather than replayed
     from the browser's copy of the last one */
  const url = `${getFileUrl(facts.film.path)}?v=${mtime}`
  const renderedAt = hhmm(mtime)
  return (
    <div className='mt-2.5 rounded-[9px] border border-accent bg-accent-soft px-3 py-[9px]'>
      <div className='flex flex-wrap items-center gap-2.5'>
        <span
          aria-hidden='true'
          className='text-accent'>
          ▶
        </span>
        {/* the name opens the film on its own, where the browser can also save it */}
        <a
          href={url}
          target='_blank'
          rel='noreferrer'
          title={t`Open the film in a new tab`}
          className='font-mono text-[12.5px] font-bold text-ink hover:text-accent hover:underline'>
          {filmNameOf(facts.baseName)}
        </a>
        <span className='text-[12px] text-ink-2'>
          {[
            seconds === null ? null : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`,
            formatFilmSize(size),
            t`rendered ${renderedAt}`
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className='ml-auto'>
          <Mini
            title={watching ? t`Close the player` : t`Watch the film here`}
            onClick={() => setWatching(!watching)}>
            {watching ? t`Close` : t`▶ Watch`}
          </Mini>
        </span>
      </div>
      {/* watched where it is — the whole point is to check the render before it goes to anyone */}
      {watching && (
        <video
          src={url}
          controls
          autoPlay
          className='mt-2.5 max-h-[60vh] w-full rounded-md bg-black'
        />
      )}
    </div>
  )
}

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
      className='max-w-[22rem] truncate border-0 bg-transparent p-0 font-mono text-[11px] text-ink-3 hover:text-accent'>
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
  onFree
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
  /* offered once it is uploaded: delete it from this machine, on proof the storage holds it */
  onFree?: () => void
}) => {
  const working = busy !== null
  const uploadKey = montageUploadKey(group.id)
  const uploading = upload?.label ?? ''
  if (!group.processed)
    return (
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
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
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
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
  return (
    <span className='ml-auto flex flex-wrap items-center gap-2'>
      <ProjectPath path={facts.projectPath} />
      <Mini
        disabled={working}
        title={t`Open this project in the editor`}
        onClick={onOpenMontage}>
        {busy === `open:${group.id}` ? t`Opening…` : t`Open in kdenlive`}
      </Mini>
      {/* the film itself is shown above the montage once it exists */}
      {!facts.film && <span className='text-[12px] text-ink-3'>{t`edit and render it`}</span>}
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
      <Go
        disabled={working || blocked.blocked || upload !== null}
        title={
          upload && upload.key !== uploadKey
            ? t`Uploading ${uploading} — wait for it, or cancel it`
            : (blocked.message ??
              t`Zip the photos and the rushes, then send the film and the photos to the montage’s folder`)
        }
        onClick={onUpload}>
        {upload?.key === uploadKey ? t`Uploading…` : group.uploaded ? t`Upload again…` : t`Upload…`}
      </Go>
    </span>
  )
}

/* Once it is uploaded, what matters is what is on the NAS — not the files it was made from. One
   parcel per folder up there, each listing exactly what is in it. That is what makes an uploaded
   montage worth opening months later. */
const NasCard = ({
  title,
  dir,
  tag,
  items,
  shareUrl
}: {
  title: string
  dir: string
  tag: string
  items: { icon: string; name: string; size: number; what: string }[]
  shareUrl?: string
}) => (
  <div className='mt-2.5 overflow-hidden rounded-[9px] border border-line'>
    <div className='flex flex-wrap items-center gap-2 border-b border-line bg-ground px-3 py-[9px] text-[13px]'>
      <b className='font-semibold'>{title}</b>
      <span className='text-ink-3'>→</span>
      <code className='rounded-[3px] bg-line-2 px-1.5 py-px font-mono text-[11.5px] text-ink'>
        {dir}
      </code>
      <span className='ml-auto text-[12px] text-ink-2'>{tag}</span>
    </div>
    <div className='px-1.5 py-1'>
      {items.map((item) => (
        <div
          key={item.name}
          className='flex items-center gap-2.5 rounded-[5px] p-1.5 hover:bg-line-2'>
          <span className='w-[15px] flex-none text-center text-accent'>{item.icon}</span>
          <code className='font-mono text-[11.5px]'>{item.name}</code>
          <span className='text-[12px] text-ink-2'>{formatFilmSize(item.size)}</span>
          <span className='mr-2.5 ml-auto text-[12px] text-ink-2'>{item.what}</span>
        </div>
      ))}
      {shareUrl && (
        <div className='mt-1 flex items-center gap-2.5 border-t border-line-2 px-1.5 pt-2 pb-1.5'>
          <span className='w-[15px] flex-none text-center'>🔗</span>
          <a
            href={shareUrl}
            target='_blank'
            rel='noreferrer'
            className='truncate font-mono text-[11px] text-accent underline'>
            {shareUrl}
          </a>
        </div>
      )}
    </div>
  </div>
)

/* Uploaded, then gone from the storage: the montage reads as not uploaded again, and this says why —
   silently dropping the tick would look like SkyDock had forgotten, not like the files had gone. */
const GoneFromStorage = ({ gone, at }: { gone: { remotePath: string }[]; at?: number }) => {
  if (gone.length === 0) return null
  const uploadedOn = at ? new Date(at * 1000).toLocaleDateString('de-CH') : ''
  return (
    <p className='mt-2.5 mb-0 rounded-md bg-changed-soft px-3 py-2 text-[12.5px] text-changed'>
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

const UploadedCards = ({ group }: { group: ManifestGroup }) => {
  const record = group.uploaded
  if (!record) return null
  const passenger = [
    record.film && {
      icon: '▶',
      name: lastSegment(record.film.remotePath),
      size: record.film.size,
      what: t`the film`
    },
    record.photos && {
      icon: '🗜',
      name: lastSegment(record.photos.remotePath),
      size: record.photos.size,
      what: t`the photos`
    }
  ].filter((x): x is { icon: string; name: string; size: number; what: string } => Boolean(x))
  const anchor = record.film ?? record.photos
  return (
    <>
      {anchor && passenger.length > 0 && (
        <NasCard
          title={t`To hand over`}
          dir={parentOf(anchor.remotePath)}
          tag={t`ready to hand over`}
          items={passenger}
          shareUrl={record.shareUrl ?? group.publish?.shareUrl}
        />
      )}
      {record.rushes && (
        <NasCard
          title={t`Backup`}
          dir={parentOf(record.rushes.remotePath)}
          tag={t`never shared`}
          items={[
            {
              icon: '🗜',
              name: lastSegment(record.rushes.remotePath),
              size: record.rushes.size,
              what: t`the originals`
            }
          ]}
        />
      )}
      {/* kept as plain files, each original is on the storage on its own */}
      {record.originals && record.originals.length > 0 && (
        <NasCard
          title={t`Backup`}
          dir={parentOf(record.originals[0]!.remotePath)}
          tag={t`never shared`}
          items={record.originals.map((original) => ({
            icon: '▶',
            name: lastSegment(original.remotePath),
            size: original.size,
            what:
              record.film &&
              lastSegment(original.remotePath) === lastSegment(record.film.remotePath)
                ? t`a copy of the film`
                : t`original`
          }))}
        />
      )}
    </>
  )
}

export {
  NameMontage,
  UploadedCards,
  GoneFromStorage,
  FilmStrip,
  PassengerFrames,
  PassengerName,
  ProjectPath,
  MontageCardActions
}
export type { Passenger }
