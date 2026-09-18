import { EDIT_LOCKED, fileChanged, fileStatus, isWholeFrame } from '@skydock/scripts'
import type { ProxyFact, StatusContext } from '@skydock/scripts'
import { useState } from 'react'
import { StatusChip } from './file-status'
import type { ShownStatus } from './file-status'
import type { ManifestFile } from './types'
import { formatSize, formatTime, getFileUrl, getThumbUrl, isVideoFile } from './utils'

/* Videos and photos are two different jobs on a tandem — 15 clips to cut, 500 stills to cull — so
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
  onFile: (file: ManifestFile, lane: ManifestFile[], e: Modifiers) => void
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  /* the name the file has once a copy exists — what goes to the NAS and what the passenger sees */
  deliveredName: (file: ManifestFile) => string | null
  selecting: boolean
}

/* A card of 500 photos must not put 500 things on screen before they have been asked for. */
const PAGE = { rows: 40, grid: 120 }

const kindOf = (file: ManifestFile) => (isVideoFile(file.path) ? 'video' : 'photo')
const matchesKind = (file: ManifestFile, kind: Kind) => kind === 'all' || kindOf(file) === kind

/* Why a file can no longer be changed here, if it cannot. Uploaded is the end of editing: SkyDock
   never deletes from the storage, so it could not take the old copy back, and changing this one would
   leave the two disagreeing for good. A tandem with an edit is frozen whole, for the edit's sake. */
const UPLOADED_LOCKED =
  'On the NAS — cropping, re-timing and moving are closed. Take it off the NAS to change it.'

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

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

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
   where none of them built looks exactly like a card still building, and until this was on screen
   the only way to tell was to read the server's log. `own` is a clip already small enough to be its
   own proxy — finished, with nothing left to make. */
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

const ProxyFlag = ({ fact }: { fact?: ProxyFact }) => {
  if (!fact) return null
  const { label, title, className } = PROXY_FLAG[fact.state]
  return (
    <span
      title={title}
      className={`flex-none rounded px-1.5 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap ${className}`}>
      {label}
    </span>
  )
}

/* The trim shows as a range on the row; the rectangle had nothing, which is why a crop that was
   set could not be told from one that was not without opening the file. It reads as the share of
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
const PickMark = ({ picked }: { picked: boolean }) => (
  <span
    aria-hidden='true'
    className={`pointer-events-none absolute top-1.5 right-1.5 grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] leading-none font-bold transition-colors duration-100 ${
      picked
        ? 'bg-accent text-white shadow-[0_0_0_2px_#fff,0_1px_4px_rgba(0,0,0,0.35)]'
        : 'bg-black/20 text-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.92),0_1px_3px_rgba(0,0,0,0.3)]'
    }`}>
    ✓
  </span>
)

const Row = ({
  file,
  lane,
  picked,
  locked,
  status,
  proxy,
  name,
  onFile,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: string | null
  status: ShownStatus
  proxy?: ProxyFact
  name: string | null
  onFile: Props['onFile']
  onDragFile: Props['onDragFile']
}) => (
  <div
    role='button'
    tabIndex={0}
    aria-selected={picked}
    draggable={!locked}
    onDragStart={locked ? undefined : (e) => onDragFile(file, e)}
    onClick={(e) => onFile(file, lane, e)}
    onKeyDown={(e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      onFile(file, lane, e)
    }}
    className={`flex h-[38px] w-full items-center gap-2.5 rounded-md border px-[7px] text-left ${
      picked ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-line-2'
    }`}>
    <span
      /* the tick is only ever drawn once it is ticked — transparent, not white, so it stays
         invisible on a dark panel as well as a light one */
      className={`grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] border-[1.5px] text-[9px] ${
        picked ? 'border-accent bg-accent text-white' : 'border-line text-transparent'
      }`}>
      ✓
    </span>
    <span className='relative h-[30px] w-10 flex-none overflow-hidden rounded-[3px] bg-line-2'>
      <img
        src={isVideoFile(file.path) ? getThumbUrl(file.path, 0.5, 80) : getFileUrl(file.path)}
        alt=''
        loading='lazy'
        style={turnedThumb(file.rotation)}
        className='h-full w-full object-cover'
      />
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
      <StatusChip status={status} />
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
  selecting,
  onFile,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: string | null
  status: ReturnType<typeof fileStatus>
  proxy?: ProxyFact
  selecting: boolean
  onFile: Props['onFile']
  onDragFile: Props['onDragFile']
}) => (
  <button
    type='button'
    aria-selected={picked}
    draggable={!locked}
    onDragStart={locked ? undefined : (e) => onDragFile(file, e)}
    onClick={(e) => onFile(file, lane, e)}
    title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)} · ${status}${
      proxy?.state === 'none' ? ' · no proxy yet' : ''
    }${isWholeFrame(file.frame) ? '' : ' · frame cropped'}${file.rotation ? ` · turned ${file.rotation}°` : ''}`}
    className={`relative aspect-[4/3] max-w-full overflow-hidden rounded-[5px] border-2 bg-line-2 p-0 ${
      picked ? 'border-accent' : 'border-transparent'
    }`}>
    <img
      src={isVideoFile(file.path) ? getThumbUrl(file.path, 0.5, 160) : getFileUrl(file.path)}
      alt=''
      loading='lazy'
      style={turnedThumb(file.rotation)}
      className='absolute inset-0 h-full w-full object-cover'
    />
    {isVideoFile(file.path) && (
      <i className='absolute bottom-1 left-1 rounded-[3px] bg-black/[0.66] px-1 font-mono text-[9px] text-white not-italic'>
        ▶
      </i>
    )}
    {locked && <span className='absolute right-1 bottom-1 text-[10px]'>🔒</span>}
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
        title={PROXY_FLAG.none.title}
        className='pointer-events-none absolute bottom-1 left-1 h-2 w-2 rounded-full border border-dashed border-white bg-local shadow-[0_0_0_1.5px_rgba(0,0,0,0.45)]'
      />
    )}
    {selecting && <PickMark picked={picked} />}
  </button>
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

/* one kind, or everything in one run: the list itself, a page at a time */
const Lane = ({
  files,
  kind,
  shape,
  picked,
  statusContext,
  proxies,
  onFile,
  onDragFile,
  deliveredName,
  selecting
}: Props) => {
  const [shown, setShown] = useState(PAGE[shape])
  const lane = files.filter((f) => matchesKind(f, kind)).sort((a, b) => a.mtime - b.mtime)
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
              name={deliveredName(file)}
              onFile={onFile}
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
              selecting={selecting}
              onFile={onFile}
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
   picked is that kind alone; a list of only one kind is simply that list. On a narrow screen the
   two columns stack. */
const FileList = (props: Props) => {
  const { files, kind } = props
  const videos = files.filter((f) => kindOf(f) === 'video').length
  const photos = files.length - videos
  if (kind !== 'all' || videos === 0 || photos === 0) return <Lane {...props} />
  return (
    <div className='grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2'>
      {(
        [
          ['video', 'Videos', videos],
          ['photo', 'Photos', photos]
        ] as const
      ).map(([only, label, count]) => (
        <div
          key={only}
          className='min-w-0'>
          <div className='mb-1 flex items-baseline gap-1.5 px-[7px] text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase'>
            {label}
            <span className='font-mono font-normal tracking-normal tabular-nums'>{count}</span>
          </div>
          <Lane
            {...props}
            kind={only}
          />
        </div>
      ))}
    </div>
  )
}

export { FileList, KindBadges, lockReason, matchesKind, kindOf }
export type { FileShape, Kind, Modifiers }
