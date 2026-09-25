import {
  EDIT_LOCKED,
  fileChanged,
  fileStatus,
  isWholeFrame,
  UPLOADED_LOCKED
} from '@skydock/scripts'
import type { ProxyFact, StatusContext } from '@skydock/scripts'
import { useState } from 'react'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import type { LiveFile } from '../hooks/useLiveProgress'
import type { ManifestFile } from './types'
import { clock, formatSize, formatTime, getPictureUrl, isVideoFile } from './utils'

/* Videos and photos are two different jobs on a montage — 15 clips to cut, 500 stills to cull — so
   the badges say which is on screen. The counts are always of everything there, never of what the
   filter left. */
type Kind = 'all' | 'video' | 'photo'

/* what a click on a file means depends on the keys held with it — a key press carries the same */
type Modifiers = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }

/* One shape for every file. A clip is not a different layout, only a badge inside the same square,
   so nothing shifts position between one row and the next. */
type FileShape = 'rows' | 'grid'

type Props = {
  files: ManifestFile[]
  kind: Kind
  shape: FileShape
  picked: string[]
  statusContext: (file: ManifestFile) => StatusContext
  /* where each clip's proxy has got to, keyed by the clip's path — read off the disk by the
     server, because the record alone cannot know someone emptied the folder */
  proxies: Record<string, ProxyFact>
  /* a click looks at a file, with modifiers it picks; a double-click or Enter opens it */
  onFile: (file: ManifestFile, lane: ManifestFile[], e: Modifiers) => void
  /* the tick: the one plain way to pick a file */
  onPick: (file: ManifestFile) => void
  onOpen: (file: ManifestFile) => void
  /* the file being looked at, which is shown apart from the picked ones */
  previewed: string | null
  /* files in a jump the gap rule would not have put them in — flagged, not moved */
  offGap: Set<string>
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  /* what the files are put in order by — their time, their name or how far along they are */
  sortKey: (file: ManifestFile) => string | number
  /* the name the file has once a copy exists — what goes to the NAS and what the passenger sees */
  deliveredName: (file: ManifestFile) => string | null
  selecting: boolean
  /* files being processed or proxied right now, by file, and how far through */
  live?: Record<string, LiveFile>
}

/* A card of 500 photos must not put 500 things on screen before they have been asked for. */
const PAGE = { rows: 40, grid: 120 }

const kindOf = (file: ManifestFile) => (isVideoFile(file.path) ? 'video' : 'photo')
const matchesKind = (file: ManifestFile, kind: Kind) => kind === 'all' || kindOf(file) === kind

const byKey =
  (key: (file: ManifestFile) => string | number) => (a: ManifestFile, b: ManifestFile) => {
    const x = key(a)
    const y = key(b)
    return x < y ? -1 : x > y ? 1 : a.mtime - b.mtime
  }

/* The files as they are drawn: one run of the kind asked for, or — for everything, where there are
   both — the clips and then the stills, each in its own column. The board steps through files with
   the arrow keys in this same order, so what is next is what is below. */
const lanesOf = (
  files: ManifestFile[],
  kind: Kind,
  key: (file: ManifestFile) => string | number
) => {
  const sorted = files.filter((f) => matchesKind(f, kind)).sort(byKey(key))
  const videos = sorted.filter((f) => kindOf(f) === 'video')
  const photos = sorted.filter((f) => kindOf(f) === 'photo')
  return kind === 'all' && videos.length > 0 && photos.length > 0 ? [videos, photos] : [sorted]
}

/* Why a file can no longer be changed here, if it cannot: freed, frozen with its montage's edit, or
   uploaded — each the server's rule as much as the page's. */
const FREED_LOCKED = 'Freed from this machine — it is on the storage only now.'

const lockReason = (file: ManifestFile, context: StatusContext) =>
  file.freed
    ? FREED_LOCKED
    : context.inEdit
      ? EDIT_LOCKED
      : fileStatus(file, context) === 'uploaded'
        ? UPLOADED_LOCKED
        : null

const shownStatus = (file: ManifestFile, context: StatusContext): ShownStatus =>
  fileChanged(file, context) ? 'changed' : fileStatus(file, context)

/* What was kept, not that something was. A crop is the one edit whose effect cannot be seen on the
   row itself, so the row says it in full — and says whether it has happened yet. */
const CropFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (file.cropStart == null && file.cropEnd == null) return null
  const from = file.cropStart ?? 0
  const range =
    file.cropEnd != null ? `${clock(from)}–${clock(file.cropEnd)}` : `from ${clock(from)}`
  return (
    <span
      title={
        applied
          ? 'Crop applied when this file was processed'
          : 'Crop saved — applied at the next Process'
      }
      className={`flex-none rounded px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${
        applied
          ? 'border border-accent bg-accent text-white'
          : 'border border-dashed border-local bg-local-soft text-local'
      }`}>
      {range}
      {applied ? ' ✓' : ''}
    </span>
  )
}

/* Whether the small copy exists yet. Only clips have one, and it is worth saying out loud: a card
   where none of them built looks exactly like a card still building. `own` is a clip already small
   enough to be its own proxy — finished, with nothing left to make. */
const PROXY_FLAG: Record<ProxyFact['state'], { label: string; title: string; className: string }> =
  {
    ready: {
      label: 'proxy',
      title: 'Proxy ready — the crop bar plays it, and the editor opens on it',
      className: 'border border-proc bg-proc-soft text-proc'
    },
    own: {
      label: 'proxy',
      title: 'Small enough already — this clip is its own proxy, nothing to build',
      className: 'border border-line bg-line-2 text-ink-3'
    },
    none: {
      label: 'no proxy',
      title:
        'No proxy yet — it is built behind the scan. Meanwhile the clip plays as it is and the editor makes its own.',
      className: 'border border-dashed border-local bg-local-soft text-local'
    }
  }

/* A file its jump holds against the gap rule — dragged in, or re-timed away from the rest. Only
   said, never acted on: the person who put it there may well be right. */
const GAP_TITLE =
  'More than 15 minutes from the rest of its jump — the gap rule would not have put it here'

const GapFlag = () => (
  <span
    title={GAP_TITLE}
    className='flex-none rounded border border-dashed border-changed bg-changed-soft px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap text-changed'>
    ⧗ gap
  </span>
)

/* A copy: the same clip is in another jump as well, and this entry is this jump's own — its own
   trim, time and processed copy. Said on the file, because nothing else about it looks any different
   and taking it out of the jump ends it rather than sending it back. */
const COPY_TITLE =
  'A copy — the same clip is in another jump too. This one has its own trim and time, and is processed for this jump. Taken out of the jump, it simply ends: the original stays where it is.'

const CopyFlag = () => (
  <span
    title={COPY_TITLE}
    className='flex-none rounded border border-line bg-line-2 px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap text-ink-2'>
    ⧉ copy
  </span>
)

/* a proxy that could not be made says so, with why — told apart from one that is still to come */
const proxyFailedTitle = (reason: string) =>
  `The proxy could not be made: ${reason}. It is tried again on the next pass; meanwhile the clip plays as it is.`

const ProxyFlag = ({ fact }: { fact?: ProxyFact }) => {
  if (!fact) return null
  const { label, title, className } = PROXY_FLAG[fact.state]
  return (
    <span
      title={fact.reason ? proxyFailedTitle(fact.reason) : title}
      className={`flex-none rounded px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${className}`}>
      {fact.reason ? 'proxy failed' : label}
    </span>
  )
}

/* The trim shows as a range on the row, and the rectangle beside it, so a crop that was set can be
   told from one that was not without opening the file. It reads as the share of
   the picture kept, because "cropped" alone does not say how much. Solid once it has been applied,
   dashed while it is still only saved — the same distinction the trim makes. */
const FrameFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (isWholeFrame(file.frame)) return null
  const kept = Math.round((file.frame!.width + file.frame!.height) * 50)
  return (
    <span
      title={
        applied
          ? `Frame cropped when this file was processed — about ${kept}% of the picture, keeping its shape`
          : `Frame crop saved — about ${kept}% of the picture, keeping its shape. Applied at the next Process.`
      }
      className={`flex-none rounded px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${
        applied
          ? 'border border-accent bg-accent text-white'
          : 'border border-dashed border-local bg-local-soft text-local'
      }`}>
      ▣ {kept}%
    </span>
  )
}

/* The turn, the same way: solid once applied, dashed while only saved. */
const TurnFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (!file.rotation) return null
  return (
    <span
      title={
        applied
          ? `Turned ${file.rotation}° when this file was processed`
          : `Turned ${file.rotation}° — applied at the next Process`
      }
      className={`flex-none rounded px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${
        applied
          ? 'border border-accent bg-accent text-white'
          : 'border border-dashed border-local bg-local-soft text-local'
      }`}>
      ↻ {file.rotation}°
    </span>
  )
}

/* A thumbnail shows the picture the way it will come out. A quarter-turned picture no longer fills
   the same box, so it is scaled up by its shape to cover it again — a thumbnail is for recognising a
   file, not for seeing all of it. */
const turnedThumb = (rotation: ManifestFile['rotation']): React.CSSProperties | undefined =>
  rotation
    ? { transform: `rotate(${rotation}deg)${rotation % 180 ? ' scale(1.34)' : ''}` }
    : undefined

/* Picked or not, in the corner of every thumbnail once a selection is under way: an empty ring to
   say it can be picked, filled with the board's green and a tick once it is. A white edge and a
   soft shadow keep it legible over any picture. It replaces the coloured status dot that stood
   there — orange on most of a card, and easily taken for a warning — the state is still in the
   thumbnail's title, and on every row. */
/* The tick on a thumbnail is a button of its own, since clicking the picture only looks at it.
   Always there once something is picked; before that it appears under the pointer, so the grid
   stays quiet until picking starts. */
const PickMark = ({
  picked,
  selecting,
  onPick
}: {
  picked: boolean
  selecting: boolean
  onPick: () => void
}) => (
  <button
    type='button'
    aria-label={picked ? 'Unpick' : 'Pick'}
    aria-pressed={picked}
    onClick={(e) => {
      e.stopPropagation()
      onPick()
    }}
    className={`absolute top-1.5 right-1.5 grid h-[18px] w-[18px] place-items-center rounded-full border-0 p-0 text-[11px] leading-none font-bold transition-[colors,opacity] duration-100 ${
      picked
        ? 'bg-accent text-white shadow-[0_0_0_2px_#fff,0_1px_4px_rgba(0,0,0,0.35)]'
        : 'bg-black/20 text-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.92),0_1px_3px_rgba(0,0,0,0.3)]'
    } ${selecting || picked ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}>
    ✓
  </button>
)

/* A file being worked on, said where the file is: what is being done and how far through, moving
   as it goes. It stands where the status would — until the work ends the status is about to
   change anyway — and once it ends the status is back, read from the board's own answer. */
const LIVE_WORK: Record<LiveFile['work'], string> = {
  process: 'Processing',
  proxy: 'Proxy',
  moments: 'Finding the jump'
}

const LiveBar = ({ live, filename }: { live: LiveFile; filename: string }) => (
  <span
    role='progressbar'
    aria-label={`${LIVE_WORK[live.work]} ${filename}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={live.percent}
    title={`${LIVE_WORK[live.work]} — ${live.percent}%`}
    className='flex w-full items-center gap-1.5'>
    <span className='h-1 min-w-0 flex-1 overflow-hidden rounded-sm bg-line-2'>
      <i
        className={`block h-full transition-[width] duration-500 ${live.work === 'process' ? 'bg-proc' : 'bg-accent'}`}
        style={{ width: `${live.percent}%` }}
      />
    </span>
    <span className='flex-none font-mono text-[10.5px] text-ink-2 tabular-nums'>
      {live.percent}%
    </span>
  </span>
)

const Row = ({
  file,
  lane,
  picked,
  locked,
  status,
  proxy,
  live,
  name,
  previewed,
  offGap: strayed,
  onFile,
  onPick,
  onOpen,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: string | null
  status: ShownStatus
  proxy?: ProxyFact
  live?: LiveFile
  name: string | null
  previewed: boolean
  offGap: boolean
  onFile: Props['onFile']
  onPick: Props['onPick']
  onOpen: Props['onOpen']
  onDragFile: Props['onDragFile']
}) => (
  <div
    role='button'
    tabIndex={0}
    aria-selected={picked}
    aria-current={previewed || undefined}
    data-file={file.id ?? file.path}
    /* a file that cannot move is still carried, because it can be copied into another jump */
    draggable={!file.freed}
    onDragStart={file.freed ? undefined : (e) => onDragFile(file, e)}
    onClick={(e) => onFile(file, lane, e)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onOpen(file)
      }
      /* space ticks, as it would a checkbox */
      if (e.key !== ' ' || locked) return
      e.preventDefault()
      onPick(file)
    }}
    className={`flex h-[38px] w-full items-center gap-2.5 rounded-md border px-[7px] text-left ${
      picked
        ? 'border-accent bg-accent-soft'
        : previewed
          ? 'border-ink-3 bg-line-2'
          : 'border-transparent hover:bg-line-2'
    }`}>
    {/* a file that cannot move has nothing to be picked for, so it has no tick — only the room
        one would take, so the rows stay in line */}
    {locked ? (
      <span className='h-3.5 w-3.5 flex-none' />
    ) : (
      <button
        type='button'
        aria-label={picked ? 'Unpick' : 'Pick'}
        aria-pressed={picked}
        onClick={(e) => {
          e.stopPropagation()
          onPick(file)
        }}
        /* transparent, not white, when not ticked, so it stays quiet on a dark panel as well as a
         light one */
        className={`grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] border-[1.5px] p-0 text-[9px] ${
          picked
            ? 'border-accent bg-accent text-white'
            : 'border-line bg-transparent text-transparent hover:border-accent'
        }`}>
        ✓
      </button>
    )}
    <span className='relative h-[30px] w-10 flex-none overflow-hidden rounded-[3px] bg-line-2'>
      {/* a freed file is on the storage only: nothing here to draw it from */}
      {!file.freed && (
        <img
          src={getPictureUrl(file, proxy, 80)}
          alt=''
          loading='lazy'
          style={turnedThumb(file.rotation)}
          className='h-full w-full object-cover'
        />
      )}
      {isVideoFile(file.path) && (
        <i className='absolute bottom-0.5 left-0.5 rounded-sm bg-black/[0.66] px-[3px] font-mono text-[8px] leading-[1.3] text-white not-italic'>
          ▶
        </i>
      )}
    </span>
    <span
      className='min-w-0 flex-1 truncate font-mono text-[11.5px]'
      title={name ? `${name}  ·  from ${file.filename}` : file.filename}>
      {name ?? file.filename}
    </span>
    {name && (
      <span
        className='max-w-[130px] flex-none truncate font-mono text-[10.5px] text-ink-3'
        title='the name it came off the camera with'>
        {file.filename}
      </span>
    )}
    <ProxyFlag fact={proxy} />
    {file.copyOf && <CopyFlag />}
    {strayed && <GapFlag />}
    <FrameFlag
      file={file}
      applied={status === 'processed' || status === 'uploaded'}
    />
    <CropFlag
      file={file}
      applied={status === 'processed' || status === 'uploaded'}
    />
    <TurnFlag
      file={file}
      applied={status === 'processed' || status === 'uploaded'}
    />
    {locked && (
      <span
        className='flex-none cursor-help text-[10px] opacity-55'
        title={locked}>
        🔒
      </span>
    )}
    <span className='w-[62px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
      {formatTime(file.mtime)}
    </span>
    <span className='w-[58px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
      {formatSize(file.size)}
    </span>
    <span className='flex w-[76px] flex-none justify-end'>
      {live ? (
        <LiveBar
          live={live}
          filename={file.filename}
        />
      ) : (
        <StatusChip status={status} />
      )}
    </span>
  </div>
)

const Tile = ({
  file,
  lane,
  picked,
  locked,
  status,
  proxy,
  live,
  selecting,
  previewed,
  offGap: strayed,
  onFile,
  onPick,
  onOpen,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: string | null
  status: ReturnType<typeof fileStatus>
  proxy?: ProxyFact
  live?: LiveFile
  selecting: boolean
  previewed: boolean
  offGap: boolean
  onFile: Props['onFile']
  onPick: Props['onPick']
  onOpen: Props['onOpen']
  onDragFile: Props['onDragFile']
}) => (
  /* a div rather than a button, so its tick can be a button of its own */
  <div
    role='button'
    tabIndex={0}
    aria-selected={picked}
    aria-current={previewed || undefined}
    data-file={file.id ?? file.path}
    /* a file that cannot move is still carried, because it can be copied into another jump */
    draggable={!file.freed}
    onDragStart={file.freed ? undefined : (e) => onDragFile(file, e)}
    onClick={(e) => onFile(file, lane, e)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onOpen(file)
      }
      if (e.key !== ' ' || locked) return
      e.preventDefault()
      onPick(file)
    }}
    title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)} · ${status}${
      proxy?.state === 'none' ? (proxy.reason ? ' · proxy failed' : ' · no proxy yet') : ''
    }${isWholeFrame(file.frame) ? '' : ' · frame cropped'}${file.rotation ? ` · turned ${file.rotation}°` : ''}`}
    className={`group relative aspect-[4/3] max-w-full cursor-pointer overflow-hidden rounded-[5px] border-2 bg-line-2 p-0 ${
      picked ? 'border-accent' : previewed ? 'border-ink-3' : 'border-transparent'
    }`}>
    {/* a freed file is on the storage only: nothing here to draw it from */}
    {!file.freed && (
      <img
        src={getPictureUrl(file, proxy, 160)}
        alt=''
        loading='lazy'
        style={turnedThumb(file.rotation)}
        className='absolute inset-0 h-full w-full object-cover'
      />
    )}
    {isVideoFile(file.path) && (
      <i className='absolute bottom-1 left-1 rounded-[3px] bg-black/[0.66] px-1 font-mono text-[9px] text-white not-italic'>
        ▶
      </i>
    )}
    {locked && <span className='absolute right-1 bottom-1 text-[10px]'>🔒</span>}
    {file.copyOf && (
      <span
        title={COPY_TITLE}
        className='absolute top-1 left-1/2 -translate-x-1/2 rounded-[3px] bg-black/[0.66] px-1 font-mono text-[9px] text-white'>
        ⧉
      </span>
    )}
    {strayed && (
      <span
        title={GAP_TITLE}
        className='absolute top-1 left-1/2 -translate-x-1/2 rounded-[3px] border border-dashed border-changed bg-changed-soft px-1 font-mono text-[9px] font-semibold text-changed'>
        ⧗
      </span>
    )}
    {/* a rectangle is invisible on a thumbnail of the whole frame, so it is said rather than shown */}
    {!isWholeFrame(file.frame) && (
      <span
        title='The frame is cropped'
        className='absolute top-1 left-1 rounded-[3px] bg-black/[0.66] px-1 font-mono text-[9px] text-white'>
        ▣
      </span>
    )}
    {/* only the clip still waiting is marked here — a proxy that exists is the ordinary case, and
        a grid is where hundreds of stills are culled, so it stays as quiet as it can */}
    {proxy?.state === 'none' && (
      <span
        title={proxy.reason ? proxyFailedTitle(proxy.reason) : PROXY_FLAG.none.title}
        className='pointer-events-none absolute bottom-1 left-1 h-2 w-2 rounded-full border border-dashed border-white bg-local shadow-[0_0_0_1.5px_rgba(0,0,0,0.45)]'
      />
    )}
    {/* over the foot of the picture, on a dark band so the figures read on any frame */}
    {live && (
      <span className='pointer-events-none absolute inset-x-0 bottom-0 bg-black/[0.66] px-1 py-[3px] [&_span]:text-white'>
        <LiveBar
          live={live}
          filename={file.filename}
        />
      </span>
    )}
    {!locked && (
      <PickMark
        picked={picked}
        selecting={selecting}
        onPick={() => onPick(file)}
      />
    )}
  </div>
)

const KindBadges = ({
  files,
  kind,
  withAll,
  onPick
}: {
  files: ManifestFile[]
  kind: Kind
  withAll: boolean
  onPick: (kind: Kind) => void
}) => {
  const videos = files.filter((f) => kindOf(f) === 'video').length
  const photos = files.length - videos
  /* Shown on every header, even where one kind is absent, so every header reads the same and says
     what is in it at a glance. A kind with nothing in it is on show but cannot be picked. */
  if (files.length === 0) return null
  const active: Kind = withAll
    ? kind
    : kind === 'photo' || (kind === 'all' && videos === 0)
      ? 'photo'
      : 'video'
  const options: [Kind, string, number][] = withAll
    ? [
        ['all', 'All', files.length],
        ['video', 'Videos', videos],
        ['photo', 'Photos', photos]
      ]
    : [
        ['video', 'Videos', videos],
        ['photo', 'Photos', photos]
      ]
  return (
    <span
      role='group'
      aria-label='Videos or photos'
      className='flex overflow-hidden rounded-md border border-line'>
      {options.map(([value, label, count]) => (
        <button
          key={value}
          type='button'
          aria-pressed={active === value}
          disabled={count === 0 && active !== value}
          title={
            value === 'all' ? 'Show everything' : `Show only the ${count} ${label.toLowerCase()}`
          }
          onClick={() => onPick(value)}
          className={`inline-flex items-center gap-1.5 px-[11px] py-[5px] text-[12px] disabled:cursor-default disabled:opacity-45 ${
            active === value ? 'bg-accent-soft font-semibold text-accent' : 'bg-pane text-ink-2'
          }`}>
          {label}
          <span
            className={`rounded-full px-1.5 font-mono text-[11px] tabular-nums ${
              active === value ? 'bg-pane text-accent' : 'bg-line-2 text-ink-3'
            }`}>
            {count}
          </span>
        </button>
      ))}
    </span>
  )
}

/* one run of files, already in order: the list itself, a page at a time */
const Lane = ({
  lane,
  shape,
  picked,
  statusContext,
  proxies,
  onFile,
  onPick,
  onOpen,
  onDragFile,
  deliveredName,
  previewed,
  offGap,
  selecting,
  live
}: Omit<Props, 'files' | 'kind' | 'sortKey'> & { lane: ManifestFile[] }) => {
  const [shown, setShown] = useState(PAGE[shape])
  if (lane.length === 0) {
    return <p className='px-[7px] py-1 text-[12px] text-ink-3'>Nothing here.</p>
  }
  const page = Math.min(shown, lane.length)
  const drawn = lane.slice(0, page)
  return (
    <>
      <div
        className={
          shape === 'rows'
            ? 'flex flex-col gap-px'
            : 'grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5'
        }>
        {drawn.map((file) => {
          const context = statusContext(file)
          const locked = lockReason(file, context)
          return shape === 'rows' ? (
            <Row
              key={file.id ?? file.path}
              file={file}
              lane={lane}
              picked={Boolean(file.id && picked.includes(file.id))}
              locked={locked}
              status={shownStatus(file, context)}
              proxy={proxies[file.path]}
              live={file.id ? live?.[file.id] : undefined}
              name={deliveredName(file)}
              previewed={Boolean(file.id && file.id === previewed)}
              offGap={Boolean(file.id && offGap.has(file.id))}
              onFile={onFile}
              onPick={onPick}
              onOpen={onOpen}
              onDragFile={onDragFile}
            />
          ) : (
            <Tile
              key={file.id ?? file.path}
              file={file}
              lane={lane}
              picked={Boolean(file.id && picked.includes(file.id))}
              locked={locked}
              status={fileStatus(file, context)}
              proxy={proxies[file.path]}
              live={file.id ? live?.[file.id] : undefined}
              selecting={selecting}
              previewed={Boolean(file.id && file.id === previewed)}
              offGap={Boolean(file.id && offGap.has(file.id))}
              onFile={onFile}
              onPick={onPick}
              onOpen={onOpen}
              onDragFile={onDragFile}
            />
          )
        })}
      </div>
      {lane.length > PAGE[shape] && (
        <div className='mt-[9px] flex flex-wrap items-center gap-2 border-t border-line-2 pt-2 text-[12px] text-ink-2'>
          <span className='mr-0.5 tabular-nums'>
            <b className='font-semibold text-ink'>{page}</b> of {lane.length} shown
          </span>
          {page < lane.length && (
            <button
              type='button'
              onClick={() => setShown(page + PAGE[shape])}
              className='rounded-[5px] border border-line bg-pane px-2 py-[3px] text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink'>
              Show {Math.min(PAGE[shape], lane.length - page)} more
            </button>
          )}
          {page > PAGE[shape] && (
            <button
              type='button'
              onClick={() => setShown(PAGE[shape])}
              className='rounded-[5px] border border-line bg-pane px-2 py-[3px] text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink'>
              Show fewer
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* Videos and photos are two different jobs, so showing all of them is showing both side by side: the
   clips in one column, the stills in the other, each in its own order and with its own "show more".
   Picking a range stays within a column, since a range across the two would mean nothing. One kind
   picked is that kind alone; a list of only one kind is simply that list. Where the pane is narrow
   the two columns stack. */
const FileList = ({ files, kind, sortKey, ...rest }: Props) => {
  const lanes = lanesOf(files, kind, sortKey)
  if (lanes.length === 1)
    return (
      <Lane
        {...rest}
        lane={lanes[0] ?? []}
      />
    )
  return (
    <div className='grid grid-cols-1 gap-x-4 gap-y-3 @3xl:grid-cols-2'>
      {lanes.map((lane, i) => (
        <div
          key={i}
          className='min-w-0'>
          <div className='mb-1 flex items-baseline gap-1.5 px-[7px] text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase'>
            {i === 0 ? 'Videos' : 'Photos'}
            <span className='font-mono font-normal tracking-normal tabular-nums'>
              {lane.length}
            </span>
          </div>
          <Lane
            {...rest}
            lane={lane}
          />
        </div>
      ))}
    </div>
  )
}

export { FileList, KindBadges, kindOf, lanesOf, lockReason, matchesKind, shownStatus }
export type { FileShape, Kind, Modifiers }
