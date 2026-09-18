import { filmNameOf, hasCompletePassenger } from '@skydock/scripts'
import { useState } from 'react'
import type { UploadProgressState } from '../hooks/useUploadProgress'
import { Go, Mini } from './buttons'
import { kindOf } from './file-list'
import { getFileUrl, getThumbUrl } from './utils'
import type { ManifestGroup } from './types'

/* A tandem cannot be processed until it has a name, because the name *is* the folder the passenger
   gets (RULES, Dropzones and tandems). Both halves behave identically, so they are one field
   described twice rather than two fields written out twice. */
const NAME_FIELDS = [
  { key: 'firstname', label: 'First name' },
  { key: 'lastname', label: 'Last name' }
] as const

const PassengerName = ({
  group,
  onSave
}: {
  group: ManifestGroup
  onSave: (firstname: string, lastname: string) => void
}) => {
  const [name, setName] = useState({
    firstname: group.passenger?.firstname ?? '',
    lastname: group.passenger?.lastname ?? ''
  })
  const save = () => onSave(name.firstname.trim(), name.lastname.trim())
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      /* Saved when the name is finished, not when one half of it is. Saving on each field's own
         blur meant that moving from the first name to the last name recorded a passenger with no
         last name — which hid the inputs behind the name it had just invented, and left a jump the
         folder rule reads as a place rather than a person. */
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        save()
      }}
      className='flex flex-wrap items-center gap-1'>
      {NAME_FIELDS.map((field) => (
        <input
          key={field.key}
          type='text'
          value={name[field.key]}
          placeholder={field.label}
          aria-label={field.label}
          onChange={(e) => setName({ ...name, [field.key]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          className='w-24 rounded-[5px] border border-line bg-pane px-1.5 py-0.5 text-[12px]'
        />
      ))}
    </span>
  )
}

/* One passenger in the Tandems grid: who it is, what is in it, and the one thing to do next —
   which is the same sentence the tandem itself offers, said small. */
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
            src={kindOf(file) === 'video' ? getThumbUrl(file.path, 0.5, 80) : getFileUrl(file.path)}
            alt={alt}
            loading='lazy'
            className='h-6 w-[34px] rounded-[3px] bg-line-2 object-cover'
          />
        ))}
      </span>
    )
  return (
    /* four across, sharing the width — fixed widths spilled the last one off the card */
    <span className='mt-1.5 mb-0.5 grid grid-cols-4 gap-1'>
      {shown.map((file) => (
        <img
          key={file.id ?? file.path}
          src={kindOf(file) === 'video' ? getThumbUrl(file.path, 0.5, 160) : getFileUrl(file.path)}
          alt={alt}
          loading='lazy'
          className='h-[42px] w-full min-w-0 rounded-[4px] bg-line-2 object-cover'
        />
      ))}
    </span>
  )
}

type Passenger = NonNullable<ManifestGroup['passenger']>

const fullName = (p: { firstname: string; lastname: string }) =>
  `${p.firstname.trim()} ${p.lastname.trim()}`.trim()

/* Making a tandem from the jump itself: its line turns into the passenger's name. The jump and who
   is in it are both on screen, so nothing has to be dragged, or found again on another page.

   Unlike the name on a card, this is never saved by clicking away. Leaving a card's name half-typed
   costs nothing; leaving here would have filed the jump somewhere by accident. So it is saved by
   Enter or the button, and Escape puts the line back as it was.

   A name that is already a passenger's joins them — one passenger is one folder — and says so
   before anything is saved. The comparison ignores case; what is saved is the name as it already
   is, so the two jumps do not end up in two folders spelled two ways. */
const MakeTandem = ({
  group,
  passengers,
  onSave,
  onCancel
}: {
  group: ManifestGroup
  passengers: Passenger[]
  onSave: (passenger: Passenger) => void
  onCancel: () => void
}) => {
  const [name, setName] = useState({ firstname: '', lastname: '' })
  const complete = hasCompletePassenger(name)
  const typed = fullName(name).toLowerCase()
  const joins = complete ? passengers.find((p) => fullName(p).toLowerCase() === typed) : undefined
  const save = () => {
    if (!complete) return
    onSave(joins ?? { firstname: name.firstname.trim(), lastname: name.lastname.trim() })
  }
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className='order-2 flex flex-wrap items-center gap-1.5'>
      <PassengerFrames
        group={group}
        alt=''
        inline
      />
      {NAME_FIELDS.map((field, i) => (
        <input
          key={field.key}
          type='text'
          value={name[field.key]}
          placeholder={field.label}
          aria-label={field.label}
          autoFocus={i === 0}
          onChange={(e) => setName({ ...name, [field.key]: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onCancel()
          }}
          className='w-28 rounded-[5px] border border-pick bg-pane px-[7px] py-0.5 text-[12px] text-ink'
        />
      ))}
      <span
        className={`min-w-[128px] text-[11px] ${joins ? 'font-semibold text-accent' : 'text-ink-3'}`}>
        {joins
          ? `Joins ${fullName(joins)}’s tandem`
          : complete
            ? 'A new passenger folder'
            : 'First and last name'}
      </span>
      <Go
        disabled={!complete}
        onClick={save}>
        {joins ? 'Join tandem' : 'Make tandem'}
      </Go>
      <Mini onClick={onCancel}>Cancel</Mini>
    </span>
  )
}

/* One passenger in the Tandems grid: who it is, what is in it, and the one thing to do next —
   which is the same sentence the tandem itself offers, said small.

   The card is a div rather than a button. It used to be a button with the name's inputs inside it,
   which is not allowed and made every keystroke a click on the card underneath. */
const PassengerCard = ({
  group,
  who,
  naming,
  locked,
  dropTarget,
  onOpen,
  onRename,
  onName
}: {
  group: ManifestGroup
  who: string
  naming: boolean
  /* why the name cannot change any more, when it cannot: an edit lives in the folder it names */
  locked?: string
  dropTarget: Record<string, unknown>
  onOpen: () => void
  onRename: () => void
  onName: (firstname: string, lastname: string) => void
}) => {
  const videos = group.files.filter((f) => kindOf(f) === 'video').length
  /* The same rule the folder uses. "Has some text in it" is not the same as "has a name": a
     passenger with only a first name has no folder to go to, so the card keeps asking. */
  const complete = hasCompletePassenger(group.passenger)
  const editing = !locked && (naming || !complete)
  return (
    <div
      {...dropTarget}
      className='rounded-[10px] border border-line bg-pane p-3 text-left focus-within:border-accent hover:border-accent'>
      {editing ? (
        <>
          <PassengerName
            group={group}
            onSave={onName}
          />
          {/* The name is the folder, so changing it moves where everything goes. What is already
              prepared belongs to the old folder and has to be prepared again; what is already on
              the storage stays there under the old name, because SkyDock never deletes from it. */}
          {complete && (group.processed || group.delivered) && (
            <p className='mt-1 text-[11.5px] text-changed'>
              {group.delivered
                ? 'Already uploaded — a new name means preparing and uploading again, and the old folder stays on the storage under the old name.'
                : 'Already prepared — a new name means preparing it again, into the new folder.'}
            </p>
          )}
        </>
      ) : (
        <span className='flex items-baseline gap-1.5'>
          <h3 className='min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em]'>
            {who}
          </h3>
          {/* a name read off a form can be read wrong, and the folder is named after it */}
          {locked ? (
            <span
              title={locked}
              className='flex-none cursor-help text-[11px] opacity-55'>
              🔒
            </span>
          ) : (
            <button
              type='button'
              onClick={onRename}
              title='Change this name'
              className='flex-none border-0 bg-transparent p-0 text-[11.5px] text-ink-3 underline hover:text-accent'>
              rename
            </button>
          )}
        </span>
      )}
      {/* a freed tandem has no clips left here to take a frame from */}
      {!group.freed && (
        <PassengerFrames
          group={group}
          alt={editing ? 'A frame from this tandem, to tell who it is' : who}
        />
      )}
      <p className='text-[12px] text-ink-2'>
        {videos} video{videos === 1 ? '' : 's'} · {group.files.length - videos} photos
      </p>
      <button
        type='button'
        onClick={onOpen}
        className='mt-2.5 border-0 bg-transparent p-0 text-[11.5px] font-semibold text-accent'>
        {!complete
          ? 'Open to see the clips →'
          : group.delivered
            ? '✓ uploaded'
            : group.processed
              ? 'Next: montage →'
              : 'Next: process →'}
      </button>
    </div>
  )
}

const formatFilmSize = (bytes: number) =>
  bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

const pad2 = (n: number) => String(n).padStart(2, '0')

/* the film, once it exists: the one thing here nobody can make again — so it is said out loud, above
   the tandem it came from, rather than as a size beside its buttons. How long it runs is what tells a
   whole jump from a test render of its first minute. */
const FilmStrip = ({ facts }: { facts?: TandemFact }) => {
  const [watching, setWatching] = useState(false)
  if (!facts?.film) return null
  const { seconds, size, mtime } = facts.film
  const at = new Date(mtime * 1000)
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
            seconds === null ? null : `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`,
            formatFilmSize(size),
            `rendered ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
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

const dirOf = (remotePath: string) => {
  const cut = remotePath.lastIndexOf('/')
  return cut <= 0 ? '/' : remotePath.slice(0, cut)
}

const nameOf = (remotePath: string) => remotePath.slice(remotePath.lastIndexOf('/') + 1)

type TandemFact = {
  project: boolean
  projectPath: string
  film: { size: number; mtime: number; seconds: number | null; path: string } | null
  baseName: string
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
   order (RULES, The board): Process copies and crops here, Montage writes the project the editor
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
  onMontage,
  onOpenMontage,
  onDeliver,
  onFree
}: {
  group: ManifestGroup
  facts?: TandemFact
  busy: string | null
  blocked: { blocked: boolean; message: string | null }
  named: boolean
  onProcess: () => void
  onMontage: () => void
  onOpenMontage: () => void
  onDeliver: () => void
  /* offered once it is uploaded: delete it from this machine, on proof the storage holds it */
  onFree?: () => void
}) => {
  const working = busy !== null
  const deliverKey = `deliver:${group.id}`
  if (!group.processed)
    return (
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
        <Go
          disabled={working || !named}
          onClick={onProcess}>
          {busy === group.id ? 'Processing…' : 'Process'}
        </Go>
      </span>
    )
  if (!facts?.project)
    return (
      <span className='ml-auto flex flex-wrap items-center gap-1.5'>
        <Go
          disabled={working}
          title='Write the kdenlive project — clips laid out, render destination set — and open it'
          onClick={onMontage}>
          {busy === group.id ? 'Writing…' : 'Montage'}
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
      {group.delivered && onFree && (
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
          'Zip the photos and the rushes, then send the film and the photos to the passenger'
        }
        onClick={onDeliver}>
        {busy === deliverKey ? 'Uploading…' : group.delivered ? 'Upload again…' : 'Upload…'}
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

/* Once it is delivered, what matters is what is on the NAS — not the files it was made from. One
   parcel per folder up there, each listing exactly what is in it. That is what makes a delivered
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
        {gone.map((f) => nameOf(f.remotePath)).join(', ')}
      </code>{' '}
      — upload again to put {gone.length === 1 ? 'it' : 'them'} back.
    </p>
  )

const DeliveredCards = ({ group }: { group: ManifestGroup }) => {
  const record = group.delivered
  if (!record) return null
  const passenger = [
    record.film && {
      icon: '▶',
      name: nameOf(record.film.remotePath),
      size: record.film.size,
      what: 'the film'
    },
    record.photos && {
      icon: '🗜',
      name: nameOf(record.photos.remotePath),
      size: record.photos.size,
      what: 'the photos'
    }
  ].filter((x): x is { icon: string; name: string; size: number; what: string } => Boolean(x))
  const anchor = record.film ?? record.photos
  return (
    <>
      {anchor && passenger.length > 0 && (
        <NasCard
          title='For the passenger'
          dir={dirOf(anchor.remotePath)}
          tag='ready to hand over'
          items={passenger}
          shareUrl={record.shareUrl ?? group.publish?.shareUrl}
        />
      )}
      {record.rushes && (
        <NasCard
          title='Backup'
          dir={dirOf(record.rushes.remotePath)}
          tag='never shared'
          items={[
            {
              icon: '🗜',
              name: nameOf(record.rushes.remotePath),
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
          dir={dirOf(record.originals[0]!.remotePath)}
          tag='never shared'
          items={record.originals.map((original) => ({
            icon: '▶',
            name: nameOf(original.remotePath),
            size: original.size,
            what:
              record.film && nameOf(original.remotePath) === nameOf(record.film.remotePath)
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
  DeliveredCards,
  GoneFromStorage,
  FilmStrip,
  PassengerCard,
  PassengerName,
  ProjectPath,
  TandemActions,
  UploadStrip,
  formatFilmSize
}
export type { Passenger, TandemFact }
