import { fileChanged, fileStatus } from '@skydock/scripts'
import type { StatusContext } from '@skydock/scripts'
import { useState } from 'react'
import { StatusChip, StatusDot } from './file-status'
import type { ShownStatus } from './file-status'
import type { ManifestFile } from './types'
import { formatSize, formatTime, getFileUrl, getThumbUrl, isVideoFile } from './utils'

/* Videos and photos are two different jobs on a tandem — 15 clips to cut, 500 stills to cull — so
   the badges say which is on screen. The counts are always of everything there, never of what the
   filter left. */
type Kind = 'all' | 'video' | 'photo'

/* One shape for every file. A clip is not a different layout, only a badge inside the same square,
   so nothing shifts position between one row and the next. */
type FileShape = 'rows' | 'grid'

type Props = {
  files: ManifestFile[]
  kind: Kind
  shape: FileShape
  picked: string[]
  statusContext: (file: ManifestFile) => StatusContext
  onFile: (file: ManifestFile, lane: ManifestFile[], e: React.MouseEvent) => void
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  /* the name the file has once a copy exists — what goes to the NAS and what the passenger sees */
  deliveredName: (file: ManifestFile) => string | null
  selecting: boolean
}

/* A card of 500 photos must not put 500 things on screen before they have been asked for. */
const PAGE = { rows: 40, grid: 120 }

const kindOf = (file: ManifestFile) => (isVideoFile(file.path) ? 'video' : 'photo')
const matchesKind = (file: ManifestFile, kind: Kind) => kind === 'all' || kindOf(file) === kind

/* Uploaded is the end of editing: SkyDock never deletes from the storage, so it could not take the
   old copy back, and changing this one would leave the two disagreeing for good. */
const lockedFile = (file: ManifestFile, context: StatusContext) =>
  fileStatus(file, context) === 'uploaded'

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
          ? 'Crop applied when this file was prepared'
          : 'Crop saved — applied at the next Prepare'
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

const Row = ({
  file,
  lane,
  picked,
  locked,
  status,
  name,
  onFile,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: boolean
  status: ShownStatus
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
      onFile(file, lane, e as unknown as React.MouseEvent)
    }}
    className={`flex h-[38px] w-full items-center gap-2.5 rounded-md border px-[7px] text-left ${
      picked ? 'border-pick bg-pick-soft' : 'border-transparent hover:bg-line-2'
    }`}>
    <span
      /* the tick is only ever drawn once it is ticked — transparent, not white, so it stays
         invisible on a dark panel as well as a light one */
      className={`grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] border-[1.5px] text-[9px] ${
        picked ? 'border-pick bg-pick text-white' : 'border-line text-transparent'
      }`}>
      ✓
    </span>
    <span className='relative h-[30px] w-10 flex-none overflow-hidden rounded-[3px] bg-line-2'>
      <img
        src={isVideoFile(file.path) ? getThumbUrl(file.path, 0.5, 80) : getFileUrl(file.path)}
        alt=''
        loading='lazy'
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
    <CropFlag
      file={file}
      applied={status === 'processed' || status === 'uploaded'}
    />
    {locked && (
      <span
        className='flex-none cursor-help text-[10px] opacity-55'
        title='On the NAS — cropping, re-timing and moving are closed. Take it off the NAS to change it.'>
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
  selecting,
  onFile,
  onDragFile
}: {
  file: ManifestFile
  lane: ManifestFile[]
  picked: boolean
  locked: boolean
  status: ReturnType<typeof fileStatus>
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
    title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)} · ${status}`}
    className={`relative aspect-[4/3] max-w-full overflow-hidden rounded-[5px] border-2 bg-line-2 p-0 ${
      picked ? 'border-pick' : 'border-transparent'
    }`}>
    <img
      src={isVideoFile(file.path) ? getThumbUrl(file.path, 0.5, 160) : getFileUrl(file.path)}
      alt=''
      loading='lazy'
      className='absolute inset-0 h-full w-full object-cover'
    />
    {isVideoFile(file.path) && (
      <i className='absolute bottom-1 left-1 rounded-[3px] bg-black/[0.66] px-1 font-mono text-[9px] text-white not-italic'>
        ▶
      </i>
    )}
    {locked && <span className='absolute right-1 bottom-1 text-[10px]'>🔒</span>}
    {selecting && <StatusDot status={status} />}
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
  if (videos === 0 || photos === 0) return null
  const active: Kind = withAll ? kind : kind === 'photo' ? 'photo' : 'video'
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
          onClick={() => onPick(value)}
          className={`inline-flex items-center gap-1.5 bg-pane px-[11px] py-[5px] text-[12px] ${
            active === value ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2'
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

const FileList = ({
  files,
  kind,
  shape,
  picked,
  statusContext,
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
          const locked = lockedFile(file, context)
          return shape === 'rows' ? (
            <Row
              key={file.id ?? file.path}
              file={file}
              lane={lane}
              picked={Boolean(file.id && picked.includes(file.id))}
              locked={locked}
              status={shownStatus(file, context)}
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

export { FileList, KindBadges, lockedFile, matchesKind, kindOf }
export type { Kind, FileShape }
