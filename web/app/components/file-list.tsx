import { afterNote } from '../helpers/sizes'
import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import {
  EDIT_LOCKED,
  fileChanged,
  fileStatus,
  isWholeFrame,
  UPLOADED_LOCKED
} from '@skydock/scripts'
import type { ProxyFact, StatusContext } from '@skydock/scripts'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { pictureWidthFor, stepTileSize, useTileSize } from '../hooks/useTileSize'
import { StatusChip, statusName } from './file-status'
import type { ShownStatus } from './file-status'
import { useLiveFile } from '../hooks/liveStore'
import type { LiveFile } from '../hooks/useLiveProgress'
import type { ManifestFile } from './types'
import { Mini } from './buttons'
import { Icon } from './icons'
import { clock, formatSize, formatTime, getPictureUrl, hhmm, isVideoFile } from './utils'

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
  /* what the rows are headed with, before how many there are — the open jump's name */
  title?: string
  /* and what goes before the count: when the jump ran */
  about?: string
  /* the count is said by the heading above it, so only the column names are drawn */
  bare?: boolean
  /* the rows share one card, a line between them, instead of a box each */
  joined?: boolean
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
const FREED_LOCKED = msg`Freed from this machine — it is on the storage only now.`

const lockReason = (file: ManifestFile, context: StatusContext) =>
  file.freed
    ? i18n._(FREED_LOCKED)
    : context.inEdit
      ? EDIT_LOCKED
      : fileStatus(file, context) === 'uploaded'
        ? UPLOADED_LOCKED
        : null

const shownStatus = (file: ManifestFile, context: StatusContext): ShownStatus =>
  fileChanged(file, context) ? 'changed' : fileStatus(file, context)

/* An edit to the picture, said as a small chip in the row's Picture column: solid once it has been
   applied, dashed while it is only saved and waits for the next Process. The chip names the edit;
   what exactly was kept — the range, the share of the picture, the turn — is in its title. */
const Adj = ({
  applied,
  title,
  children
}: {
  applied: boolean
  title: string
  children: React.ReactNode
}) => (
  <span
    title={title}
    className={`flex-none rounded-full border px-1.5 text-[10.5px] leading-[14px] font-semibold whitespace-nowrap text-ink-2 ${
      applied ? 'border-transparent bg-well' : 'border-dashed border-line-strong bg-transparent'
    }`}>
    {children}
  </span>
)

/* What was kept, not only that something was: a crop is the one edit whose effect cannot be seen on
   the thumbnail, so its title says the range in full — and whether it has happened yet. */
const CropFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (file.cropStart == null && file.cropEnd == null) return null
  const from = file.cropStart ?? 0
  const start = clock(from)
  const range = file.cropEnd != null ? `${start}–${clock(file.cropEnd)}` : t`from ${start}`
  return (
    <Adj
      applied={applied}
      title={
        applied
          ? t`Trim ${range} — applied when this file was processed`
          : t`Trim ${range} — saved, applied at the next Process`
      }>
      {t`trim`}
    </Adj>
  )
}

/* Whether the small copy exists yet — said only while it does not. Only clips have one, and a card
   where none of them built looks exactly like a card still building, so a missing one is worth
   saying out loud; one that exists is the ordinary case, and a word on every clip saying so is
   noise the eye learns to skip, taking the missing ones with it. */
const NO_PROXY_TITLE = msg`No proxy yet — it is built behind the scan. Meanwhile the clip plays as it is and the editor makes its own.`

/* A file its jump holds against the gap rule — dragged in, or re-timed away from the rest. Only
   said, never acted on: the person who put it there may well be right. */
const GAP_TITLE = msg`More than 15 minutes from the rest of its jump — the gap rule would not have put it here`

/* the small words under a file's name, each quiet and in the colour of what it warns of */
const NOTE = 'whitespace-nowrap'

const GapFlag = () => (
  <span
    title={i18n._(GAP_TITLE)}
    className={`${NOTE} text-changed`}>
    ⧗ {t`gap`}
  </span>
)

/* A copy: the same clip is in another jump as well, and this entry is this jump's own — its own
   trim, time and processed copy. Said on the file, because nothing else about it looks any different
   and taking it out of the jump ends it rather than sending it back. */
const COPY_TITLE = msg`A copy — the same clip is in another jump too. This one has its own trim and time, and is processed for this jump. Taken out of the jump, it simply ends: the original stays where it is.`

const CopyFlag = () => (
  <span
    title={i18n._(COPY_TITLE)}
    className={`${NOTE} text-ink-2`}>
    ⧉ {t`copy`}
  </span>
)

/* a proxy that could not be made says so, with why — told apart from one that is still to come */
const proxyFailedTitle = (reason: string) =>
  t`The proxy could not be made: ${reason}. It is tried again on the next pass; meanwhile the clip plays as it is.`

const ProxyFlag = ({ fact }: { fact?: ProxyFact }) => {
  if (!fact) return null
  /* a small copy made: said in green, so a clip that plays at once is told from one still waiting */
  if (fact.state !== 'none')
    return (
      <span
        title={t`Its proxy is ready — the small copy the preview plays at once`}
        className={`${NOTE} text-up`}>
        ▶ {t`proxy`}
      </span>
    )
  return (
    <span
      title={fact.reason ? proxyFailedTitle(fact.reason) : i18n._(NO_PROXY_TITLE)}
      className={`${NOTE} text-local`}>
      {fact.reason ? t`proxy failed` : t`no proxy`}
    </span>
  )
}

/* A clip whose jump was found says so, with where the door was left. A clip with none says nothing:
   most clips are not jumps, and a word on each of them would only hide the ones that are. */
const jumpTitle = (exit: string) => t`Its jump was found — the exit is at ${exit}`

const JumpFlag = ({ file }: { file: ManifestFile }) =>
  file.moments && (
    <span
      title={jumpTitle(clock(file.moments.exit))}
      className={`${NOTE} text-up`}>
      ↓ {t`exit`}
    </span>
  )

/* A frame that was set is told from one that was not without opening the file. Its title reads as
   the share of the picture kept, because "cropped" alone does not say how much. */
const FrameFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (isWholeFrame(file.frame)) return null
  const kept = Math.round((file.frame!.width + file.frame!.height) * 50)
  return (
    <Adj
      applied={applied}
      title={
        applied
          ? t`Framed when this file was processed — about ${kept}% of the picture, keeping its shape`
          : t`Frame saved — about ${kept}% of the picture, keeping its shape. Applied at the next Process.`
      }>
      {t`frame`}
    </Adj>
  )
}

const turnedTitle = (turn: number) => t`turned ${turn}°`

/* a turn said as the share of a whole turn it is, the way it is read at a glance */
const QUARTERS: Record<number, string> = { 90: '¼', 180: '½', 270: '¾' }

const TurnFlag = ({ file, applied }: { file: ManifestFile; applied: boolean }) => {
  if (!file.rotation) return null
  const turn = file.rotation
  return (
    <Adj
      applied={applied}
      title={
        applied
          ? t`Turned ${turn}° when this file was processed`
          : t`Turned ${turn}° — applied at the next Process`
      }>
      {t`turn`} {QUARTERS[turn] ?? `${turn}°`}
    </Adj>
  )
}

/* A thumbnail shows the picture the way it will come out. A quarter-turned picture no longer fills
   the same box, so it is scaled up by its shape to cover it again — a thumbnail is for recognising a
   file, not for seeing all of it. */
const turnedThumb = (rotation: ManifestFile['rotation']): React.CSSProperties | undefined =>
  rotation
    ? {
        transform: `rotate(${rotation}deg)${rotation % 180 ? ' scale(1.34)' : ''}`
      }
    : undefined

/* The tick on a thumbnail is a button of its own, since clicking the picture only looks at it: a
   blue square with a tick once picked, an empty one to say it can be. It is always there, so what
   can be picked is seen at once; a white edge over a dark wash keeps it legible over any picture. */
const PickMark = ({ picked, onPick }: { picked: boolean; onPick: () => void }) => (
  <button
    type='button'
    aria-label={picked ? t`Unpick` : t`Pick`}
    aria-pressed={picked}
    onClick={(e) => {
      e.stopPropagation()
      onPick()
    }}
    className={`absolute top-[9px] left-[9px] z-[2] grid size-5 place-items-center rounded-[7px] border-2 p-0 ${
      picked
        ? 'border-accent bg-accent text-white'
        : 'border-white/90 bg-[rgba(8,12,22,0.28)] text-transparent'
    }`}>
    <Icon
      name='check'
      size={11}
      weight={3.5}
    />
  </button>
)

/* A file being worked on, said where the file is: what is being done and how far through, moving
   as it goes. It stands where the state would — until the work ends the state is about to change
   anyway — and once it ends the state is back, read from the board's own answer. */
const LIVE_WORK: Record<LiveFile['work'], MessageDescriptor> = {
  process: msg`Processing`,
  proxy: msg`Proxy`,
  moments: msg`Finding the jump`
}

/* on a row, what is being done over its bar; under a thumbnail, where there is less room, the bar */
const LiveBar = ({
  live,
  filename,
  short
}: {
  live: LiveFile
  filename: string
  short: boolean
}) => (
  <span
    role='progressbar'
    aria-label={`${i18n._(LIVE_WORK[live.work])} ${filename}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={live.percent}
    title={`${i18n._(LIVE_WORK[live.work])} — ${live.percent}%`}
    className={`flex flex-col gap-1 ${short ? 'w-14' : 'w-[104px]'}`}>
    {!short && (
      <span className='flex justify-between text-[11.5px] text-ink-2'>
        <span className='truncate'>{i18n._(LIVE_WORK[live.work])}</span>
        <span className='font-mono text-[11px] tabular-nums'>{live.percent}%</span>
      </span>
    )}
    <span className={`block h-1 overflow-hidden rounded-full ${short ? 'bg-white/40' : 'bg-line'}`}>
      <i
        className={`block h-full transition-[width] duration-500 ${live.work === 'process' ? 'bg-proc' : 'bg-accent'}`}
        style={{ width: `${live.percent}%` }}
      />
    </span>
  </span>
)

/* A file's progress, heard by the file's own row or tile: a tick of one file draws that file and
   nothing else. It stands where the state would, which is back once the work ends. */
const WhileLive = ({
  id,
  filename,
  otherwise,
  short = false
}: {
  id: string | undefined
  filename: string
  otherwise: React.ReactNode
  short?: boolean
}) => {
  const live = useLiveFile(id)
  if (!live) return otherwise
  return (
    <LiveBar
      live={live}
      filename={filename}
      short={short}
    />
  )
}

/* The columns of a list of rows: tick, picture, the name with what it is under it — when it was shot,
   how big, what was done to the picture — and where it has got to. Few things, so a row reads at a
   glance; the rest is in the panel when the file is picked. */
const COLUMNS = 'grid grid-cols-[22px_64px_minmax(0,1fr)_112px] items-center gap-x-3.5 px-3'

const Row = ({
  file,
  lane,
  picked,
  locked,
  status,
  proxy,
  name,
  previewed,
  offGap: strayed,
  onFile,
  onPick,
  onOpen,
  onDragFile,
  joined = false
}: {
  file: ManifestFile
  lane: ManifestFile[]
  joined?: boolean
  picked: boolean
  locked: string | null
  status: ShownStatus
  proxy?: ProxyFact
  name: string | null
  previewed: boolean
  offGap: boolean
  onFile: Props['onFile']
  onPick: Props['onPick']
  onOpen: Props['onOpen']
  onDragFile: Props['onDragFile']
}) => {
  const filename = file.filename
  const applied = status === 'processed' || status === 'uploaded'
  return (
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
      /* the one looked at is marked apart from the picked ones by a ring round it */
      className={`${COLUMNS} w-full text-left [content-visibility:auto] ${
        joined
          ? `h-[52px] rounded-[10px] [contain-intrinsic-size:auto_52px] not-first:border-t not-first:border-line-2 ${
              previewed ? 'bg-accent-soft' : picked ? 'bg-accent-soft' : 'hover:bg-well'
            }`
          : `h-[64px] rounded-[16px] [contain-intrinsic-size:auto_64px] ${
              previewed
                ? 'bg-accent-soft shadow-[0_0_0_2px_var(--color-accent)]'
                : picked
                  ? 'bg-accent-soft shadow-[0_0_0_1px_var(--color-line)]'
                  : 'bg-pane shadow-[0_0_0_1px_var(--color-line)] hover:bg-well'
            }`
      }`}>
      {/* a file that cannot move has nothing to be picked for, so it has no tick — a lock in its
        place says why, and keeps the rows in line */}
      {locked ? (
        <span
          className='grid cursor-help place-items-center text-ink-3'
          title={locked}>
          <Icon
            name='lock'
            size={13}
          />
        </span>
      ) : (
        <button
          type='button'
          aria-label={picked ? t`Unpick` : t`Pick`}
          aria-pressed={picked}
          onClick={(e) => {
            e.stopPropagation()
            onPick(file)
          }}
          className={`grid size-[18px] place-items-center rounded-[6px] border-2 p-0 ${
            picked
              ? 'border-accent bg-accent text-white'
              : 'border-check bg-pane text-transparent hover:border-accent'
          }`}>
          <Icon
            name='check'
            size={11}
            weight={3.5}
          />
        </button>
      )}
      <span
        className={`relative overflow-hidden bg-well ${joined ? 'h-[34px] w-[46px] rounded-[9px]' : 'h-11 w-16 rounded-[11px]'}`}>
        {/* a freed file is on the storage only: nothing here to draw it from */}
        {!file.freed && (
          <img
            src={getPictureUrl(file, proxy, 160)}
            alt=''
            loading='lazy'
            decoding='async'
            style={turnedThumb(file.rotation)}
            className='h-full w-full object-cover'
          />
        )}
      </span>
      <span className='min-w-0'>
        <span
          className='block truncate font-mono text-[12px] font-medium tracking-[-0.02em] text-ink'
          title={name ? t`${name}  ·  from ${filename}` : file.filename}>
          {name ?? file.filename}
        </span>
        {/* the camera's name once a copy is named for handing over, or else what kind of file it
            is — then whatever is worth a second look about it */}
        <span className='flex min-w-0 items-center gap-1 truncate text-[12px] font-medium text-ink-3 [&>*+*]:before:mr-1 [&>*+*]:before:text-ink-3 [&>*+*]:before:content-["·"]'>
          <span className='tabular-nums'>
            {formatTime(file.mtime)} · {formatSize(file.size)}
            {afterNote(file)}
          </span>
          {name && (
            <span
              className='truncate'
              title={t`the name it came off the camera with`}>
              {file.filename}
            </span>
          )}
          <JumpFlag file={file} />
          <ProxyFlag fact={proxy} />
          {file.copyOf && <CopyFlag />}
          {strayed && <GapFlag />}
          <CropFlag
            file={file}
            applied={applied}
          />
          <FrameFlag
            file={file}
            applied={applied}
          />
          <TurnFlag
            file={file}
            applied={applied}
          />
        </span>
      </span>
      <span className='flex'>
        <WhileLive
          id={file.id}
          filename={file.filename}
          otherwise={
            <StatusChip
              status={status}
              prepared={joined}
            />
          }
        />
      </span>
    </div>
  )
}

/* what sits over a thumbnail's picture, small and dark so it reads on any frame */
const OVER =
  'rounded-full bg-[rgba(8,12,22,0.55)] px-[6px] text-[10.5px] leading-[18px] font-semibold whitespace-nowrap text-white'

/* where a file has got to, as the dot in a thumbnail's corner: the state's own bright colour, ringed
   in white so it reads on any picture */
const DOT: Record<ShownStatus, string> = {
  local: 'bg-local-bar',
  changed: 'bg-accent',
  processed: 'bg-[#e05ab6]',
  uploaded: 'bg-[#23b877]'
}

const Tile = ({
  file,
  lane,
  picked,
  locked,
  status,
  proxy,
  previewed,
  offGap: strayed,
  picture,
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
  /* how wide a picture to ask for, from how big the thumbnails are drawn */
  picture: number
  proxy?: ProxyFact
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
    title={`${file.filename} · ${formatTime(file.mtime)} · ${formatSize(file.size)}${afterNote(file)} · ${statusName(status)}${
      proxy?.state === 'none' ? ` · ${proxy.reason ? t`proxy failed` : t`no proxy yet`}` : ''
    }${isWholeFrame(file.frame) ? '' : ` · ${t`framed`}`}${file.rotation ? ` · ${turnedTitle(file.rotation)}` : ''}`}
    /* the picked one ringed in the accent, the one looked at in grey — a ring outside the picture,
       parted from it by a gap of the pane's own colour, so the picture is never covered. Not
       content-visibility: that would clip the ring at the tile's edge. */
    className={`@container/tile relative aspect-[16/11] max-w-full min-w-0 cursor-pointer overflow-hidden rounded-[14px] bg-well ${
      picked
        ? 'shadow-[0_0_0_3px_var(--color-pane),0_0_0_5px_var(--color-accent)]'
        : previewed
          ? 'shadow-[0_0_0_3px_var(--color-pane),0_0_0_5px_var(--color-ink-3)]'
          : 'shadow-card'
    }`}>
    {/* a freed file is on the storage only: nothing here to draw it from */}
    {!file.freed && (
      <img
        src={getPictureUrl(file, proxy, picture)}
        alt=''
        loading='lazy'
        decoding='async'
        style={turnedThumb(file.rotation)}
        className='absolute inset-0 h-full w-full object-cover'
      />
    )}
    <span className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,22,0)_55%,rgba(8,12,22,0.7)_100%)]' />
    {isVideoFile(file.path) && (
      <span
        className={`absolute top-[9px] right-[9px] inline-grid h-[22px] min-w-[22px] place-items-center px-[7px] ${OVER}`}>
        <Icon
          name='play'
          size={9}
        />
      </span>
    )}
    {/* when it was shot, whatever is worth a second look, and where it has got to. On a small
        thumbnail there is room for the dot only, and the state is in its title. */}
    <span className='pointer-events-none absolute right-2.5 bottom-2 left-2.5 flex items-center gap-1.5 text-white'>
      <span className='hidden font-mono text-[12px] font-semibold tracking-[-0.02em] @[80px]/tile:inline'>
        {hhmm(file.mtime)}
      </span>
      {/* only the clip still waiting is marked here — a proxy that exists is the ordinary case, and
          a grid is where hundreds of stills are culled, so it stays as quiet as it can */}
      {proxy?.state === 'none' && (
        <span
          title={proxy.reason ? proxyFailedTitle(proxy.reason) : i18n._(NO_PROXY_TITLE)}
          className='h-2 w-2 rounded-full border border-dashed border-white bg-local shadow-[0_0_0_1.5px_rgba(0,0,0,0.45)]'
        />
      )}
      {file.moments && (
        <span
          title={jumpTitle(clock(file.moments.exit))}
          className={OVER}>
          ↓
        </span>
      )}
      {/* a rectangle is invisible on a thumbnail of the whole frame, so it is said rather than
          shown */}
      {!isWholeFrame(file.frame) && (
        <span
          title={t`Framed`}
          className={OVER}>
          ▣
        </span>
      )}
      {file.copyOf && (
        <span
          title={i18n._(COPY_TITLE)}
          className={OVER}>
          ⧉
        </span>
      )}
      {strayed && (
        <span
          title={i18n._(GAP_TITLE)}
          className={OVER}>
          ⧗
        </span>
      )}
      <span className='ml-auto flex items-center gap-1.5'>
        {locked && (
          <span
            title={locked}
            className={`pointer-events-auto inline-flex items-center py-px ${OVER}`}>
            <Icon
              name='lock'
              size={10}
            />
          </span>
        )}
        <WhileLive
          id={file.id}
          filename={file.filename}
          short
          otherwise={
            <span
              title={statusName(status)}
              className={`size-[9px] rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.85)] ${DOT[status]}`}
            />
          }
        />
      </span>
    </span>
    {!locked && (
      <PickMark
        picked={picked}
        onPick={() => onPick(file)}
      />
    )}
  </div>
)

/* Ctrl or ⌘ with the wheel over the thumbnails draws them bigger or smaller. A listener of the page's
   own, since only one that is not passive can keep the wheel from zooming the whole window instead. */
const zoomWithWheel = (grid: HTMLDivElement | null) => {
  if (!grid) return
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    stepTileSize(e.deltaY < 0 ? 1 : -1)
  }
  grid.addEventListener('wheel', onWheel, { passive: false })
  return () => grid.removeEventListener('wheel', onWheel)
}

/* one run of files, already in order: the list itself, a page at a time */
/* The next page is drawn as the end of this one comes near, so a long day scrolls on by itself
   rather than waiting on a button — a page at a time, so opening it never draws a thousand files at
   once. The buttons below stay, for the keyboard and for going straight to all of it. */
const DrawMoreWhenNear = ({ onNear }: { onNear: () => void }) => {
  const mark = useRef<HTMLSpanElement | null>(null)
  const near = useEffectEvent(onNear)
  useEffect(() => {
    const at = mark.current
    if (!at || typeof IntersectionObserver === 'undefined') return
    const watch = new IntersectionObserver(
      (seen) => {
        if (seen.some((one) => one.isIntersecting)) near()
      },
      { rootMargin: '600px 0px' }
    )
    watch.observe(at)
    return () => watch.disconnect()
  }, [])
  return (
    <span
      ref={mark}
      aria-hidden='true'
      className='block h-px'
    />
  )
}

/* what a run of files is and how many it holds, as a line of type over it */
const LaneTitle = ({ label, count }: { label: string; count: string }) => (
  <p className={`m-0 flex items-center gap-3 ${label ? 'mb-2.5' : 'mb-2'}`}>
    {label && <b className='text-[12px] font-bold text-ink-3'>{label}</b>}
    <span className='text-[12px] font-medium text-ink-3'>{count}</span>
  </p>
)

/* The heading over a list of rows: what it is and how many. The columns have no names of their own —
   a row says what it is. */
const TableHead = ({ label, count, bare }: { label: string; count: string; bare?: boolean }) =>
  bare ? null : (
    <LaneTitle
      label={label}
      count={count}
    />
  )

/* how many a run of files holds, in the word for what it holds */
const countOf = (lane: ManifestFile[], kind: Kind) =>
  kind === 'video'
    ? plural(lane.length, { one: '# video', other: '# videos' })
    : kind === 'photo'
      ? plural(lane.length, { one: '# photo', other: '# photos' })
      : plural(lane.length, { one: '# file', other: '# files' })

const Lane = ({
  lane,
  laneKind,
  title = '',
  about,
  bare,
  joined,
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
  offGap
}: Omit<Props, 'files' | 'kind' | 'sortKey'> & {
  lane: ManifestFile[]
  laneKind: Kind
}) => {
  const [shown, setShown] = useState(PAGE[shape])
  const tileSize = useTileSize()
  if (lane.length === 0) {
    return <p className='px-3 py-1 text-[13px] font-medium text-ink-3'>{t`Nothing here.`}</p>
  }
  const page = Math.min(shown, lane.length)
  const drawn = lane.slice(0, page)
  const pickedSet = new Set(picked)
  const total = lane.length
  const more = Math.min(PAGE[shape], lane.length - page)
  const counted = about ? `${about} · ${countOf(lane, laneKind)}` : countOf(lane, laneKind)
  return (
    <>
      {shape === 'rows' ? (
        <TableHead
          label={title}
          count={counted}
          bare={bare}
        />
      ) : (
        (title || laneKind !== 'all') && (
          <LaneTitle
            label={title}
            count={counted}
          />
        )
      )}
      <div
        ref={shape === 'grid' ? zoomWithWheel : undefined}
        className={
          shape === 'rows'
            ? joined
              ? 'flex flex-col rounded-[18px] bg-pane px-3.5 py-1.5 shadow-[0_0_0_1px_var(--color-line)]'
              : 'flex flex-col gap-2'
            : 'grid gap-3'
        }
        style={
          shape === 'grid'
            ? {
                gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`
              }
            : undefined
        }>
        {drawn.map((file) => {
          const context = statusContext(file)
          const locked = lockReason(file, context)
          return shape === 'rows' ? (
            <Row
              key={file.id ?? file.path}
              file={file}
              lane={lane}
              picked={Boolean(file.id && pickedSet.has(file.id))}
              locked={locked}
              status={shownStatus(file, context)}
              proxy={proxies[file.path]}
              name={deliveredName(file)}
              previewed={Boolean(file.id && file.id === previewed)}
              offGap={Boolean(file.id && offGap.has(file.id))}
              joined={joined}
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
              picked={Boolean(file.id && pickedSet.has(file.id))}
              locked={locked}
              status={shownStatus(file, context)}
              proxy={proxies[file.path]}
              previewed={Boolean(file.id && file.id === previewed)}
              offGap={Boolean(file.id && offGap.has(file.id))}
              picture={pictureWidthFor(tileSize)}
              onFile={onFile}
              onPick={onPick}
              onOpen={onOpen}
              onDragFile={onDragFile}
            />
          )
        })}
      </div>
      {page < lane.length && (
        /* a mark of its own per page, so one still in view after a page is drawn asks again */
        <DrawMoreWhenNear
          key={page}
          onNear={() => setShown(page + PAGE[shape])}
        />
      )}
      {lane.length > PAGE[shape] && (
        <div className='mt-3 flex flex-wrap items-center gap-2 px-3 text-[12.5px] font-medium text-ink-2'>
          <span className='mr-0.5 tabular-nums'>
            <b className='font-semibold text-ink'>{page}</b> {t`of ${total} shown`}
          </span>
          {page < lane.length && (
            <Mini onClick={() => setShown(page + PAGE[shape])}>{t`Show ${more} more`}</Mini>
          )}
          {/* the rest in one go, for when looking through all of it is the point */}
          {lane.length - page > PAGE[shape] && (
            <Mini onClick={() => setShown(lane.length)}>{t`Show all ${total}`}</Mini>
          )}
          {page > PAGE[shape] && <Mini onClick={() => setShown(PAGE[shape])}>{t`Show fewer`}</Mini>}
        </div>
      )}
    </>
  )
}

/* Videos and photos are two different jobs, so showing all of them is showing both: the clips and
   the stills each in their own run, in their own order and with their own "show more". Picking a
   range stays within a run, since a range across the two would mean nothing. One kind picked is that
   kind alone; a list of only one kind is simply that list. Rows need the width of their columns, so
   the two runs of rows stand one above the other unless the pane is wide enough for two, which
   putting the details away makes it; thumbnails stand side by side as soon as there is room. */
const FileList = ({ files, kind, sortKey, ...rest }: Props) => {
  /* in one card the clips and the stills are one list, clips first */
  const lanes = rest.joined ? [lanesOf(files, kind, sortKey).flat()] : lanesOf(files, kind, sortKey)
  if (lanes.length === 1)
    return (
      <Lane
        {...rest}
        lane={lanes[0] ?? []}
        laneKind={kind}
      />
    )
  return (
    <div
      className={`flex flex-col gap-y-5 ${
        rest.shape === 'rows' ? '@5xl:flex-row @5xl:gap-x-4' : '@3xl:flex-row @3xl:gap-x-4'
      }`}>
      {lanes.map((lane, i) => (
        <div
          key={i}
          className='@container/lane min-w-0 flex-1'>
          <Lane
            {...rest}
            lane={lane}
            laneKind={i === 0 ? 'video' : 'photo'}
          />
        </div>
      ))}
    </div>
  )
}

export { FileList, kindOf, lanesOf, lockReason, shownStatus }
export type { FileShape, Kind, Modifiers }
