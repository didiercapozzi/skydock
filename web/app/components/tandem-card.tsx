import {
  filmNameOf,
  hasCompletePassenger,
  lastSegment,
  parentOf,
  passengerFrom,
  passengerName,
  tandemUploadKey
} from '@skydock/scripts'
import type { TandemFact } from '@skydock/scripts'
import { useState } from 'react'
import type { UploadProgressState } from '../hooks/useUploadProgress'
import { Go, Mini } from './buttons'
import { kindOf } from './file-list'
import { formatFilmSize, getFileUrl, getThumbUrl, hhmm, pad } from './utils'
import type { ManifestGroup } from './types'

/* A montage is named once, by one name — "Luc Favre", "Boogie 2026" — and the name *is* the folder
   it gets (RULES, Places). Saved when the field is left or on Enter. */
const PassengerName = ({
  group,
  onSave
}: {
  group: ManifestGroup
  onSave: (firstname: string, lastname: string) => void
}) => {
  const [name, setName] = useState(passengerName(group.passenger))
  const save = () => {
    const { firstname, lastname } = passengerFrom(name)
    onSave(firstname, lastname)
  }
  return (
    <input
      type='text'
      value={name}
      placeholder='Name'
      aria-label='Name'
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
      }}
      className='w-full max-w-[16rem] rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px]'
    />
  )
}

/* A few frames off the clips, which is how you tell who a tandem belongs to. A name is read off a
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
            src={getThumbUrl(file.path, 0.5, 80)}
            alt={alt}
            loading='lazy'
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
          src={getThumbUrl(file.path, 0.5, 160)}
          alt={alt}
          loading='lazy'
          className='h-[42px] w-full min-w-0 rounded-[4px] bg-line-2 object-cover'
        />
      ))}
    </span>
  )
}

type Passenger = NonNullable<ManifestGroup['passenger']>

/* Making a montage, named once, from what is on screen: the jump or the files and their name side by
   side, so nothing has to be dragged, or found again on another page.

   Never saved by clicking away: leaving here half-typed would have filed something by accident. So it
   is saved by Enter or the button, and Escape puts things back as they were.

   A name that is already a montage's joins it — one name is one folder — and says so before anything
   is saved. The comparison ignores case; what is saved is the name as it already is, so the two jumps
   do not end up in two folders spelled two ways.

   What already belongs to a place is copied in rather than moved, and `keeps` names that place, so
   the person knows before pressing that it keeps its own. */
const MakeTandem = ({
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
  const joins = complete
    ? passengers.find((p) => passengerName(p).toLowerCase() === passengerName(typed).toLowerCase())
    : undefined
  const save = () => {
    if (!complete) return
    onSave(joins ?? typed)
  }
  const copied = keeps ? ` — copied, ${keeps} keeps its own` : ''
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
        placeholder='Name'
        aria-label='Name'
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
          ? `Joins ${passengerName(joins)}’s montage${copied}`
          : complete
            ? `A new montage${copied}`
            : 'A name: a person, an event'}
      </span>
      <Go
        disabled={!complete}
        onClick={save}>
        {joins ? 'Join montage' : keeps ? 'Copy into montage' : 'Make montage'}
      </Go>
      {onCancel && <Mini onClick={onCancel}>Cancel</Mini>}
    </span>
  )
}

/* the film, once it exists: the one thing here nobody can make again — so it is said out loud, above
   the tandem it came from, rather than as a size beside its buttons. How long it runs is what tells a
   whole jump from a test render of its first minute. */
const FilmStrip = ({ facts }: { facts?: TandemFact }) => {
  const [watching, setWatching] = useState(false)
  if (!facts?.film) return null
  const { seconds, size, mtime } = facts.film
  /* the render time in the address, so a film rendered again is fetched again rather than replayed
     from the browser's copy of the last one */
  const url = `${getFileUrl(facts.film.path)}?v=${mtime}`
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
          title='Open the film in a new tab'
          className='font-mono text-[12.5px] font-bold text-ink hover:text-accent hover:underline'>
          {filmNameOf(facts.baseName)}
        </a>
        <span className='text-[12px] text-ink-2'>
          {[
            seconds === null ? null : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`,
            formatFilmSize(size),
            `rendered ${hhmm(mtime)}`
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className='ml-auto'>
          <Mini
            title={watching ? 'Close the player' : 'Watch the film here'}
            onClick={() => setWatching(!watching)}>
            {watching ? 'Close' : '▶ Watch'}
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
      title={`${projectPath}\n\nClick to copy`}
      className='max-w-[22rem] truncate border-0 bg-transparent p-0 font-mono text-[11px] text-ink-3 hover:text-accent'>
      {copied ? '✓ copied' : `${projectPath} ⧉`}
    </button>
  )
}

/* One step at a time, always in the same place. The three are distinct and never offered out of
   order (RULES, The board): Process copies and crops here, Make the project writes the project the editor
   opens, Deliver hands over what was rendered. Deliver stays enabled with no film yet, because a
   disabled button cannot say why — and pressing it is also how the board looks again, there being
   nothing that notices a render finishing. */
const TandemActions = ({
  group,
  facts,
  busy,
  blocked,
  named,
  onProcess,
  onCancelProcess,
  onMontage,
  onOpenMontage,
  onUpload,
  onFree
}: {
  group: ManifestGroup
  facts?: TandemFact
  busy: string | null
  blocked: { blocked: boolean; message: string | null }
  named: boolean
  onProcess: () => void
  /* stops the processing this tandem started, while it runs */
  onCancelProcess?: () => void
  onMontage: () => void
  onOpenMontage: () => void
  onUpload: () => void
  /* offered once it is uploaded: delete it from this machine, on proof the storage holds it */
  onFree?: () => void
}) => {
  const working = busy !== null
  const uploadKey = tandemUploadKey(group.id)
  if (!group.processed)
    return (
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
        <Go
          disabled={working || !named}
          onClick={onProcess}>
          {busy === group.id ? 'Processing…' : 'Process'}
        </Go>
        {busy === group.id && onCancelProcess && <Mini onClick={onCancelProcess}>Cancel</Mini>}
      </span>
    )
  if (!facts?.project)
    return (
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
        <Go
          disabled={working}
          title='Write the kdenlive project — clips laid out, render destination set — and open it'
          onClick={onMontage}>
          {busy === group.id ? 'Writing…' : 'Make the project'}
        </Go>
      </span>
    )
  return (
    <span className='ml-auto flex flex-wrap items-center gap-2'>
      <ProjectPath path={facts.projectPath} />
      <Mini
        disabled={working}
        title='Open this project in the editor'
        onClick={onOpenMontage}>
        {busy === `open:${group.id}` ? 'Opening…' : 'Open in kdenlive'}
      </Mini>
      {/* the film itself is shown above the tandem once it exists */}
      {!facts.film && <span className='text-[12px] text-ink-3'>edit and render it</span>}
      {/* A tandem with an edit is prepared again like any other: the copies are rewritten under the
          same names and the project is left where it is, so a trim or a frame corrected afterwards
          can still reach the footage the editor plays (RULES, The editing project). */}
      <Mini
        disabled={working}
        title='Make the copies again from the originals — the project, the film and the archives are left alone'
        onClick={onProcess}>
        {busy === group.id ? 'Processing…' : 'Process again'}
      </Mini>
      {group.uploaded && onFree && (
        <Mini
          disabled={working}
          title='Delete it from this machine — only once the storage is proved to hold every file'
          onClick={onFree}>
          {busy === `free:${group.id}` ? 'Checking the storage…' : 'Free up space…'}
        </Mini>
      )}
      <Go
        disabled={working || blocked.blocked}
        title={
          blocked.message ??
          'Zip the photos and the rushes, then send the film and the photos to the montage’s folder'
        }
        onClick={onUpload}>
        {busy === uploadKey ? 'Uploading…' : group.uploaded ? 'Upload again…' : 'Upload…'}
      </Go>
    </span>
  )
}

/* The one upload strip, wherever an upload is happening — the same shape in a day header, a tandem
   header or on its own, so it is recognised before it is read. */
const UploadStrip = ({ progress }: { progress: UploadProgressState }) => {
  const percent =
    progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesUploaded / progress.totalBytes) * 100))
      : 0
  const shell =
    'flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] text-ink-2'
  if (progress.state === 'archiving')
    return (
      <div className={`${shell} border-accent bg-accent-soft`}>
        Zipping the {progress.filename.replace('.zip', '')} —{' '}
        <b className='font-mono text-ink tabular-nums'>
          {progress.fileIndex}/{progress.totalFiles}
        </b>{' '}
        files
      </div>
    )
  if (progress.state === 'checking')
    return (
      <div className={`${shell} border-accent bg-accent-soft`}>
        Checking what is already there —{' '}
        <b className='font-mono text-ink tabular-nums'>
          {progress.checked ?? 0}/{progress.totalFiles}
        </b>
      </div>
    )
  if (progress.state === 'error')
    return (
      <div className={`${shell} border-dashed border-local bg-local-soft text-local`}>
        Upload failed: {progress.error}
      </div>
    )
  if (progress.state === 'done')
    return (
      <div className={`${shell} border-up bg-up-soft`}>
        <span className='font-semibold text-up'>✓ uploaded</span>
        {progress.skipped ? <span>{progress.skipped} already there</span> : null}
      </div>
    )
  return (
    <div className={`${shell} border-accent bg-accent-soft`}>
      <span className='flex-[1_1_140px] truncate'>
        <b className='font-mono text-ink tabular-nums'>
          {progress.fileIndex + 1}/{progress.totalFiles}
        </b>{' '}
        · {progress.filename}
      </span>
      <span className='h-1.5 max-w-[260px] flex-[1_1_160px] overflow-hidden rounded-[3px] bg-black/10'>
        <i
          className='block h-full bg-accent transition-[width] duration-100 ease-linear'
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className='w-[38px] text-right font-mono text-[11.5px] tabular-nums'>{percent}%</span>
    </div>
  )
}

/* Once it is uploaded, what matters is what is on the NAS — not the files it was made from. One
   parcel per folder up there, each listing exactly what is in it. That is what makes an uploaded
   tandem worth opening months later. */
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

/* Uploaded, then gone from the storage: the tandem reads as not uploaded again, and this says why —
   silently dropping the tick would look like SkyDock had forgotten, not like the files had gone. */
const GoneFromStorage = ({ gone, at }: { gone: { remotePath: string }[]; at?: number }) =>
  gone.length === 0 ? null : (
    <p className='mt-2.5 mb-0 rounded-md bg-changed-soft px-3 py-2 text-[12.5px] text-changed'>
      {at ? `Uploaded ${new Date(at * 1000).toLocaleDateString('de-CH')}, but ` : ''}
      {gone.length === 1 ? 'this is' : 'these are'} no longer on the storage:{' '}
      <code className='font-mono text-[11.5px]'>
        {gone.map((f) => lastSegment(f.remotePath)).join(', ')}
      </code>{' '}
      — upload again to put {gone.length === 1 ? 'it' : 'them'} back.
    </p>
  )

const UploadedCards = ({ group }: { group: ManifestGroup }) => {
  const record = group.uploaded
  if (!record) return null
  const passenger = [
    record.film && {
      icon: '▶',
      name: lastSegment(record.film.remotePath),
      size: record.film.size,
      what: 'the film'
    },
    record.photos && {
      icon: '🗜',
      name: lastSegment(record.photos.remotePath),
      size: record.photos.size,
      what: 'the photos'
    }
  ].filter((x): x is { icon: string; name: string; size: number; what: string } => Boolean(x))
  const anchor = record.film ?? record.photos
  return (
    <>
      {anchor && passenger.length > 0 && (
        <NasCard
          title='To hand over'
          dir={parentOf(anchor.remotePath)}
          tag='ready to hand over'
          items={passenger}
          shareUrl={record.shareUrl ?? group.publish?.shareUrl}
        />
      )}
      {record.rushes && (
        <NasCard
          title='Backup'
          dir={parentOf(record.rushes.remotePath)}
          tag='never shared'
          items={[
            {
              icon: '🗜',
              name: lastSegment(record.rushes.remotePath),
              size: record.rushes.size,
              what: 'the originals'
            }
          ]}
        />
      )}
      {/* kept as plain files, each original is on the storage on its own */}
      {record.originals && record.originals.length > 0 && (
        <NasCard
          title='Backup'
          dir={parentOf(record.originals[0]!.remotePath)}
          tag='never shared'
          items={record.originals.map((original) => ({
            icon: '▶',
            name: lastSegment(original.remotePath),
            size: original.size,
            what:
              record.film &&
              lastSegment(original.remotePath) === lastSegment(record.film.remotePath)
                ? 'a copy of the film'
                : 'original'
          }))}
        />
      )}
    </>
  )
}

export {
  MakeTandem,
  UploadedCards,
  GoneFromStorage,
  FilmStrip,
  PassengerFrames,
  PassengerName,
  ProjectPath,
  TandemActions,
  UploadStrip
}
export type { Passenger }
