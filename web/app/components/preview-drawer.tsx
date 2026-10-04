import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { fitRatio, FrameCropper } from './frame-cropper'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Danger, Go, Mini, Seg } from './buttons'
import { typingInField } from '../helpers/keys'
import { afterNote, estimatedSize } from '../helpers/sizes'
import { createScrub } from '../helpers/scrub'
import { Modal, Spacer } from './modal'
import {
  cropToPixels,
  cutFrom,
  jumpTrim,
  isQuarterTurn,
  isWholeFrame,
  sameFrame,
  nameOfMoment,
  turnBy,
  turnedSize
} from '@skydock/scripts'
import type { FrameCrop, ProxyFact, Rotation } from '@skydock/scripts'
import type { ManifestFile } from './types'
import {
  clock,
  dateLabel,
  formatSize,
  formatTime,
  getFileUrl,
  getPlaybackUrl,
  getThumbUrl,
  isVideoFile
} from './utils'
import { StatusChip } from './file-status'
import { WindowControls } from './window-bar'
import type { ShownStatus } from './file-status'
import { Icon } from './icons'
import { JumpGraph, phaseAt } from './jump-graph'
import { useJumpTrack } from '../hooks/useJumpTrack'
import { VideoCropper } from './video-cropper'

type VideoRef = {
  seek: (time: number) => void
}

const Part = ({
  title,
  aside,
  children
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) => (
  <section className='flex flex-col gap-2 px-5 py-3'>
    <h5 className='m-0 flex items-center justify-between text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase'>
      {title}
      {aside}
    </h5>
    {children}
  </section>
)

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className='text-[11.5px] leading-[1.5] text-ink-3'>{children}</div>
)

const V = ({ children }: { children: React.ReactNode }) => (
  <b className='font-medium text-ink-2'>{children}</b>
)

const MARK_DOT = {
  exit: 'bg-sky-600',
  opening: 'bg-amber-600',
  canopy: 'bg-emerald-600',
  landing: 'bg-slate-500'
} as const

const SizeAfter = ({ before, after }: { before: number; after: number }) =>
  Math.abs(after - before) < Math.max(1, before * 0.01) ? null : (
    <div className='flex items-center justify-between gap-2 rounded-[10px] bg-accent-soft px-2.5 py-2 text-[12px] text-accent-ink'>
      <span>{t`Size after`}</span>
      <span className='font-mono tabular-nums'>
        {formatSize(before)} → <b className='font-semibold'>~{formatSize(after)}</b>
      </span>
    </div>
  )

const Key = ({ children }: { children: React.ReactNode }) => (
  <span className='rounded-[5px] bg-well px-1.5 font-sans text-[10.5px] leading-4 font-semibold text-ink-3'>
    {children}
  </span>
)

const Ghost = ({
  label,
  title,
  onClick,
  children
}: {
  label?: string
  title?: string
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type='button'
    aria-label={label}
    title={title}
    onClick={onClick}
    className='inline-flex h-8 items-center gap-1.5 rounded-[10px] px-[10px] text-[12.5px] font-semibold whitespace-nowrap text-ink hover:bg-well'>
    {children}
  </button>
)

const Choice = ({
  on,
  label,
  title,
  onClick,
  children
}: {
  on?: boolean
  label?: string
  title?: string
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type='button'
    aria-pressed={on}
    aria-label={label}
    title={title}
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-[9px] text-[12px] font-semibold whitespace-nowrap ${
      on
        ? 'bg-pane text-ink shadow-[0_1px_2px_rgba(24,24,27,0.08),0_0_0_1px_rgba(24,24,27,0.04)]'
        : 'text-ink-2 hover:text-ink'
    }`}>
    {children}
  </button>
)

const CHOICES =
  'inline-flex h-[30px] self-start gap-px rounded-[7px] border border-line-2 bg-well p-[2px]'

const Adj = ({
  saved,
  changed,
  children
}: {
  saved: boolean
  changed: boolean
  children: string
}) => (
  <span
    className={`rounded-[6px] px-[6px] text-[11px] font-semibold text-ink-2 ${
      changed ? 'border-dashed bg-transparent' : saved ? 'bg-well' : 'bg-well opacity-40'
    }`}>
    {children}
  </span>
)

const STAGE_LEAST = 240

const percent = (share: number) => `${Math.max(share > 0 ? 1 : 0, Math.round(share * 100))}%`

type RatioOption = {
  label: string
  name?: MessageDescriptor
  ratio: number | null
  title: MessageDescriptor
}

const RATIOS: RatioOption[] = [
  {
    label: 'None',
    name: msg`None`,
    ratio: null,
    title: msg`Whole frame — the whole picture goes out as shot`
  },
  {
    label: 'Same',
    name: msg`Same`,
    ratio: null,
    title: msg`Keep the shape this clip already has`
  },
  { label: '9:16', ratio: 9 / 16, title: msg`Upright, for a phone` },
  { label: '4:5', ratio: 4 / 5, title: msg`Portrait` },
  { label: '1:1', ratio: 1, title: msg`Square` },
  { label: '16:9', ratio: 16 / 9, title: msg`Widescreen` },
  {
    label: 'Free',
    name: msg`Free`,
    ratio: null,
    title: msg`Drag the corners to any shape`
  }
]

const playsProxies = () =>
  document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') !== ''

const savedShape = (
  frame: FrameCrop | null | undefined,
  turned: { width: number; height: number }
) => {
  if (!frame || isWholeFrame(frame)) return { label: 'None', ratio: null }
  const aspect = (frame.width * turned.width) / (frame.height * turned.height)
  const near = (r: number) => Math.abs(r - aspect) / r < 0.02
  const own = turned.width / turned.height
  if (near(own)) return { label: 'Same', ratio: own }
  const named = RATIOS.find((o) => o.ratio !== null && near(o.ratio))
  return named ? { label: named.label, ratio: named.ratio } : { label: 'Free', ratio: null }
}

const pictureStyle = (
  shape: { width: number; height: number },
  rotation: Rotation
): React.CSSProperties =>
  isQuarterTurn(rotation)
    ? {
        width: `${(shape.width / shape.height) * 100}%`,
        height: `${(shape.height / shape.width) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`
      }
    : {
        width: '100%',
        height: '100%',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`
      }

const PreviewDrawer = ({
  windowed = false,
  files,
  index,
  status,
  proxy,
  frame,
  onFrameChange,
  onFrameApplyToJump,
  onClose,
  onPrevious,
  onNext,
  cropStart,
  cropEnd,
  zoom,
  currentTime,
  duration,
  onSeek,
  onTime,
  onCropChange,
  onApply,
  onZoomChange,
  onDurationChange,
  onVideoRef,
  rotation,
  onRotate,
  onRotationApplyToJump,
  locked,
  onMomentChange,
  onMomentsReset,
  onMomentsRedo,
  onPlayOutside,
  montage = false
}: {
  windowed?: boolean
  files: ManifestFile[]
  index: number
  status?: ShownStatus
  proxy?: ProxyFact
  frame?: FrameCrop | null
  onFrameChange: (frame: FrameCrop | null) => void
  onFrameApplyToJump?: () => void
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  onTime?: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
  onDurationChange: (duration: number) => void
  onVideoRef: (ref: VideoRef) => void
  rotation: Rotation
  onRotate: (rotation: Rotation) => void
  onRotationApplyToJump?: () => void
  locked?: string | null
  onMomentChange?: (which: 'exit' | 'opening' | 'canopy' | 'landing', seconds: number) => void
  onMomentsReset?: () => void
  onMomentsRedo?: () => void
  onPlayOutside?: () => void
  montage?: boolean
}) => {
  const file = files[index]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<{ from: number; span: number } | null>(null)
  const [viewOffset, setViewOffset] = useState(0)
  const [freeAt, setFreeAt] = useState<number | null>(null)
  const [shape, setShape] = useState({ width: 16, height: 9 })
  const [picked, setPicked] = useState<{
    key: string
    label: string
    ratio: number | null
  } | null>(null)
  const [unplayable, setUnplayable] = useState<string[]>([])
  const cannotPlay = (url: string) => unplayable.includes(url)
  const wontPlay = (url: string) =>
    setUnplayable((were) => (were.includes(url) ? were : [...were, url]))
  const [big, setBig] = useState(false)
  const [original, setOriginal] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)
  const [scrub] = useState(createScrub)

  const turned = turnedSize(shape.width, shape.height, rotation)
  const quarter = isQuarterTurn(rotation)

  const fileKey = file ? (file.id ?? file.path) : ''
  const choice = picked?.key === fileKey ? picked : null
  const hasShape = savedShape(frame, turned)
  const shown = choice?.label ?? hasShape.label
  const ratio = choice ? choice.ratio : hasShape.ratio
  const pick = (label: string, next: number | null) =>
    setPicked({ key: fileKey, label, ratio: next })

  const filled = frame?.fill === 'blur'
  const reframe = (next: FrameCrop | null) =>
    onFrameChange(
      filled ? { ...(next ?? { x: 0, y: 0, width: 1, height: 1 }), fill: 'blur' } : next
    )
  const fillSides = (on: boolean) => {
    const rest = frame && !isWholeFrame({ ...frame, fill: undefined }) ? frame : null
    onFrameChange(
      on
        ? { ...(rest ?? { x: 0, y: 0, width: 1, height: 1 }), fill: 'blur' }
        : rest && {
            x: rest.x,
            y: rest.y,
            width: rest.width,
            height: rest.height
          }
    )
  }

  const turn = (by: number) => {
    if (locked) return
    const next = turnBy(rotation, by)
    if (frame && isQuarterTurn(next) !== quarter) {
      const after = turnedSize(shape.width, shape.height, next)
      const keep = shown === 'Same' || ratio === null ? after.width / after.height : ratio
      if (shown === 'Same') pick('Same', keep)
      reframe(fitRatio(keep, after.width, after.height))
    }
    onRotate(next)
  }
  const showBig = () => {
    setOriginal(false)
    setBig(true)
    void stage.current?.requestFullscreen?.().catch(() => undefined)
  }
  const leaveBig = () => {
    setBig(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setBig(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => setPlaying(false))
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const sameRectangle = sameFrame(frame, file?.frame)
  const dirty =
    (cropStart ?? null) !== (file?.cropStart ?? null) ||
    (cropEnd ?? null) !== (file?.cropEnd ?? null) ||
    !sameRectangle ||
    rotation !== (file?.rotation ?? 0)
  const leave = (go: () => void) => (dirty ? setLeaving(() => go) : go())
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (leaving) setLeaving(null)
      else if (big) leaveBig()
      else leave(onClose)
    }
    if (typingInField(e)) return
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      if (big) leaveBig()
      else showBig()
    }
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      turn(90)
    }
    if (e.key === ' ' && videoRef.current) {
      e.preventDefault()
      toggle()
    }
  })
  useEffect(() => {
    const listen = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  if (!file) return null

  const fileUrl = getPlaybackUrl(file, proxy)
  const framing = frame != null && shown !== 'None'

  const pickRatio = (option: RatioOption) => {
    if (option.label === 'None') {
      pick('None', null)
      reframe(null)
      return
    }
    const next = option.label === 'Free' ? null : (option.ratio ?? turned.width / turned.height)
    pick(option.label, next)
    reframe(
      next === null
        ? (frame ?? fitRatio(turned.width / turned.height, turned.width, turned.height))
        : fitRatio(next, turned.width, turned.height)
    )
  }
  const video = isVideoFile(file.filename)
  const [tab, setTab] = useState<'cut' | 'frame' | 'turn' | 'info'>('cut')
  const tabs = (
    video
      ? [
          ['cut', t`Cut`],
          ['frame', t`Frame`],
          ['turn', t`Turn`],
          ['info', t`Info`]
        ]
      : [
          ['turn', t`Turn`],
          ['info', t`Info`]
        ]
  ) as [typeof tab, string][]
  const shownTab = tabs.some(([id]) => id === tab) ? tab : tabs[0]![0]
  const fullUrl = video ? getFileUrl(file.path) : fileUrl
  const twoCopies = video && fullUrl !== fileUrl
  const fullSize = big && original && twoCopies && !cannotPlay(fullUrl)
  const playUrl = fullSize ? fullUrl : fileUrl
  const shrunk = big && original && twoCopies && !fullSize
  const cannotShow = cannotPlay(playUrl)
  const track = useJumpTrack(video ? file.path : null)

  const cutAt = file.moments ? cutFrom(file.moments, montage) : 0
  const shownMoments = file.moments && { ...file.moments, exit: cutAt }
  const from = cropStart ?? 0
  const to = cropEnd ?? duration
  const sizeAfter = afterNote(file, {
    kept: video && duration > 0 ? Math.max(0, to - from) / duration : 1,
    frame,
    unsaved: true
  }).replace(/^ → /, '')
  const proxyFailure = proxy?.reason ?? ''
  const trimmedFrom = clock(file.cropStart ?? 0)
  const trimmedTo = clock(file.cropEnd ?? duration)
  const turnedBy = file.rotation ?? 0
  const saved =
    file.cropStart != null ||
    file.cropEnd != null ||
    !isWholeFrame(file.frame) ||
    Boolean(file.rotation)

  const trimSaved = file.cropStart != null || file.cropEnd != null
  const trimChanged =
    (cropStart ?? null) !== (file.cropStart ?? null) || (cropEnd ?? null) !== (file.cropEnd ?? null)
  const frameSaved = !isWholeFrame(file.frame)
  const turnSaved = Boolean(file.rotation)
  const turnChanged = rotation !== (file.rotation ?? 0)
  const upright = turned.height > turned.width

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && leave(onClose)}
      className={
        windowed
          ? 'flex min-h-0 flex-1'
          : 'fixed inset-0 z-40 grid place-items-center bg-[rgba(16,19,26,0.42)] p-4'
      }>
      <div
        data-preview-drawer='true'
        role='dialog'
        aria-modal='true'
        aria-label={t`Preview`}
        className={`relative flex flex-col overflow-hidden rounded-[22px] bg-pane text-ink shadow-float ${
          windowed
            ? 'drag-region h-full w-full rounded-none'
            : 'h-[92vh] max-h-full w-[min(1360px,94vw)]'
        }`}>
        <div
          className={`flex flex-none flex-wrap items-center gap-2.5 border-b border-line-2 bg-pane px-5 py-3 ${windowed ? 'drag-region' : ''}`}>
          <button
            type='button'
            aria-label={t`Previous`}
            disabled={index === 0}
            onClick={() => leave(onPrevious)}
            className='grid h-8 w-8 flex-none place-items-center rounded-[10px] text-ink-2 hover:bg-well hover:text-ink disabled:opacity-40'>
            <Icon
              name='previous'
              size={16}
            />
          </button>
          <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
            <h2 className='m-0 truncate font-display text-[19px] leading-[1.25] font-medium tracking-[-0.03em]'>
              {file.filename}
            </h2>
            <span className='flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3'>
              <span>
                {dateLabel(file.mtime)} · {formatTime(file.mtime)}
              </span>
              <span>·</span>
              <span className='font-mono text-ink-2'>
                {formatSize(file.size)}
                {sizeAfter && (
                  <>
                    {' '}
                    <span className='text-ink-3'>→</span>{' '}
                    <b className='font-medium text-accent-ink'>{sizeAfter}</b>
                  </>
                )}
              </span>
              {status && <StatusChip status={status} />}
              <span>{t`${index + 1} of ${files.length}`}</span>
            </span>
          </div>
          <button
            type='button'
            aria-label={t`Next`}
            disabled={index === files.length - 1}
            onClick={() => leave(onNext)}
            className='grid h-8 w-8 flex-none place-items-center rounded-[10px] text-ink-2 hover:bg-well hover:text-ink disabled:opacity-40'>
            <Icon
              name='next'
              size={16}
            />
          </button>
          <span className='h-[22px] w-px flex-none bg-line' />
          <Ghost
            label={t`⛶ Full screen`}
            title={
              video
                ? t`See the clip full screen, at its own size (F)`
                : t`See the photo full screen, at its own size (F)`
            }
            onClick={showBig}>
            <Icon
              name='fullScreen'
              size={14}
            />
            {t`Full screen`}
            <Key>F</Key>
          </Ghost>
          {onPlayOutside && (
            <Ghost
              title={
                video
                  ? t`Open the clip in this machine's own player — the file as it was shot, whatever the browser can decode`
                  : t`Open the photo in this machine's own player — the file as it was shot, whatever the browser can decode`
              }
              onClick={onPlayOutside}>
              <Icon
                name='open'
                size={14}
              />
              {t`In the machine's player`}
            </Ghost>
          )}
          {windowed ? (
            <>
              <span className='h-[22px] w-px flex-none bg-line' />
              <WindowControls onClose={() => leave(onClose)} />
            </>
          ) : (
            <button
              type='button'
              tabIndex={-1}
              aria-hidden='true'
              title={t`Close (Esc)`}
              onClick={onClose}
              className='grid h-7 w-7 flex-none place-items-center rounded-[9px] text-ink-2 hover:bg-well hover:text-ink'>
              <Icon name='close' />
            </button>
          )}
        </div>

        <div className='grid min-h-0 flex-1 grid-cols-1 overflow-auto sm:grid-cols-[minmax(0,1fr)_372px] sm:overflow-hidden'>
          <div className='flex min-h-0 min-w-0 flex-col gap-3 px-6 pt-[18px] pb-3 sm:overflow-y-auto'>
            <div
              ref={stage}
              onDoubleClick={() => (big ? leaveBig() : showBig())}
              style={big ? undefined : { containerType: 'size', minHeight: STAGE_LEAST }}
              className={
                big
                  ? 'fixed inset-0 z-50 grid place-items-center bg-black'
                  : 'no-drag group relative grid flex-1 place-items-center overflow-hidden rounded-[18px] bg-[#141311] p-3'
              }>
              <span
                className='relative block'
                style={{
                  aspectRatio: `${turned.width} / ${turned.height}`,
                  width: big
                    ? `min(100vw, calc(100vh * ${turned.width / turned.height}))`
                    : `min(calc(100cqw - 24px), calc((100cqh - 24px) * ${turned.width / turned.height}))`
                }}>
                {video ? (
                  <video
                    ref={(el) => {
                      videoRef.current = el
                      if (
                        el &&
                        duration === 0 &&
                        el.readyState >= 1 &&
                        Number.isFinite(el.duration) &&
                        el.duration > 0
                      )
                        onDurationChange(el.duration)
                      onVideoRef({
                        seek: (time: number) => {
                          if (el) scrub.seek(el, time)
                        }
                      })
                    }}
                    onSeeked={(e) => scrub.seeked(e.currentTarget)}
                    onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
                    src={playUrl}
                    controls={big}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
                      if (currentTime > 0 && Math.abs(v.currentTime - currentTime) > 0.05)
                        scrub.seek(v, currentTime)
                      if (v.videoWidth && v.videoHeight)
                        setShape({
                          width: v.videoWidth,
                          height: v.videoHeight
                        })
                      else wontPlay(playUrl)
                    }}
                    onError={() => wontPlay(playUrl)}
                    style={pictureStyle(shape, rotation)}
                    className='absolute top-1/2 left-1/2 rounded-[3px] transition-transform duration-150'
                  />
                ) : (
                  <img
                    src={playUrl}
                    alt={file.filename}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth && img.naturalHeight)
                        setShape({
                          width: img.naturalWidth,
                          height: img.naturalHeight
                        })
                    }}
                    style={pictureStyle(shape, rotation)}
                    className='absolute top-1/2 left-1/2 rounded-[3px] transition-transform duration-150'
                  />
                )}
                {video && cannotShow && (
                  <span
                    role='status'
                    className='absolute inset-0 grid place-items-center rounded-[3px] bg-[#141311] p-4 text-center text-[12.5px] text-white/80'>
                    {!playsProxies()
                      ? t`This browser cannot play H.264 video — the format every proxy is made in — so no clip can be shown here. Open the board in Chrome, Edge or Safari, or in Firefox with its video codecs installed, and the clips play.`
                      : proxy?.state === 'none' && proxy.reason
                        ? t`The browser cannot show this clip’s picture, and its proxy could not be made: ${proxyFailure}. It is copied, processed and uploaded all the same.`
                        : proxy?.state === 'none'
                          ? t`The browser cannot show this clip’s picture — it is in a format only the editor reads, such as 4K HEVC. Its proxy is being made, and the preview plays it as soon as it is ready.`
                          : t`The browser cannot show this clip’s picture. It is copied, processed and uploaded all the same.`}
                  </span>
                )}
                {video && framing && !big && (
                  <FrameCropper
                    crop={frame}
                    ratio={ratio}
                    frame={turned}
                    onChange={reframe}
                  />
                )}
                {video && framing && frame && !big && (
                  <>
                    <span
                      aria-hidden='true'
                      style={{
                        left: `${frame.x * 100}%`,
                        top:
                          frame.y > 0.08
                            ? `calc(${frame.y * 100}% - 26px)`
                            : `calc(${frame.y * 100}% + 8px)`,
                        marginLeft: frame.y > 0.08 ? 0 : 8
                      }}
                      className='pointer-events-none absolute z-10 rounded-[5px] bg-white px-2 py-[3px] font-mono text-[11px] leading-[1.3] text-[#1c1b19] tabular-nums'>
                      {percent(frame.width)} × {percent(frame.height)}
                    </span>
                    <span
                      aria-hidden='true'
                      style={{
                        right: `calc(${(1 - frame.x - frame.width) * 100}% + 8px)`,
                        bottom: `calc(${(1 - frame.y - frame.height) * 100}% + 8px)`
                      }}
                      className='pointer-events-none absolute z-10 rounded-[5px] bg-white px-2 py-[3px] font-mono text-[11px] leading-[1.3] whitespace-nowrap text-[#1c1b19] tabular-nums'>
                      {t`keeps ${percent(frame.width * frame.height)} of the picture`}
                      {shown.includes(':') && ` · ${shown}`}
                    </span>
                  </>
                )}
              </span>
              {video && !big && (
                <>
                  <div className='pointer-events-none absolute top-3.5 left-3.5 flex gap-1.5'>
                    {file.moments && (
                      <span className='rounded-full bg-black/55 px-2.5 py-[3px] text-[11.5px] font-semibold text-white'>
                        {i18n._(phaseAt(shownMoments, currentTime).label)}
                      </span>
                    )}
                    <span className='rounded-full bg-black/55 px-2.5 py-[3px] text-[11.5px] font-semibold text-white'>
                      {shown.includes(':') ? t`frame: ${shown}` : t`frame: whole`}
                    </span>
                  </div>
                  <button
                    type='button'
                    aria-label={playing ? t`❚❚ Pause` : t`▶ Play`}
                    onClick={toggle}
                    className={`absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-accent-ink shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-opacity hover:bg-white ${
                      playing ? 'opacity-0 group-hover:opacity-100' : ''
                    }`}>
                    {playing ? (
                      <svg
                        aria-hidden='true'
                        width='22'
                        height='22'
                        viewBox='0 0 24 24'
                        fill='currentColor'>
                        <rect
                          x='6'
                          y='5'
                          width='4'
                          height='14'
                          rx='1.2'
                        />
                        <rect
                          x='14'
                          y='5'
                          width='4'
                          height='14'
                          rx='1.2'
                        />
                      </svg>
                    ) : (
                      <Icon
                        name='play'
                        size={22}
                        className='ml-1'
                      />
                    )}
                  </button>
                  <div className='pointer-events-none absolute right-0 bottom-0 left-0 flex items-end gap-2.5 bg-gradient-to-t from-black/50 to-transparent px-4 pt-6 pb-2.5 text-[12px] text-white'>
                    <span className='flex items-baseline gap-1.5 font-mono'>
                      <span>{clock(currentTime)}</span>{' '}
                      <span className='opacity-65'>/ {clock(duration)}</span>
                    </span>
                    <span className='flex-1' />
                    <span className='opacity-85'>
                      <Key>space</Key>
                    </span>
                  </div>
                </>
              )}
              {big && (
                <div className='absolute top-3 right-3 flex items-center gap-2'>
                  {shrunk && (
                    <span className='rounded-[8px] bg-black/70 px-2 py-1 text-[11.5px] text-white/80'>
                      {t`This browser has no decoder for the clip itself — the small copy is playing`}
                    </span>
                  )}
                  {twoCopies && (
                    <span
                      role='group'
                      aria-label={t`Quality`}
                      className='inline-flex h-8 gap-0.5 rounded-[10px] bg-black/70 p-[3px] text-[12px] font-semibold text-white/80'>
                      {(
                        [
                          [false, t`Proxy`, t`The small copy, which plays at once`],
                          [true, t`Original`, t`The file itself, at the quality it was shot in`]
                        ] as const
                      ).map(([which, name, hint]) => (
                        <button
                          key={name}
                          type='button'
                          aria-pressed={original === which}
                          title={hint}
                          onClick={() => setOriginal(which)}
                          className={`rounded-[7px] px-2.5 ${original === which ? 'bg-white text-[#1c1b19]' : 'hover:text-white'}`}>
                          {name}
                        </button>
                      ))}
                    </span>
                  )}
                  <Mini
                    title={t`Leave full screen (Esc)`}
                    onClick={leaveBig}>
                    {t`✕ Leave full screen`}
                  </Mini>
                </div>
              )}
            </div>
            {video && (
              <>
                <div className='flex flex-wrap items-center gap-2'>
                  <button
                    type='button'
                    aria-label={t`Back ten seconds`}
                    title={t`Back ten seconds`}
                    onClick={() => onSeek(Math.max(0, currentTime - 10))}
                    className='grid h-[30px] w-[30px] flex-none place-items-center rounded-[10px] bg-well text-ink hover:bg-line'>
                    <svg
                      aria-hidden='true'
                      width='14'
                      height='14'
                      viewBox='0 0 16 16'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.7'
                      strokeLinecap='round'
                      strokeLinejoin='round'>
                      <path d='M3 8a5 5 0 105-5H5M5 1L3 3l2 2' />
                    </svg>
                  </button>
                  <button
                    type='button'
                    aria-label={t`Forward ten seconds`}
                    title={t`Forward ten seconds`}
                    onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                    className='grid h-[30px] w-[30px] flex-none place-items-center rounded-[10px] bg-well text-ink hover:bg-line'>
                    <svg
                      aria-hidden='true'
                      width='14'
                      height='14'
                      viewBox='0 0 16 16'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.7'
                      strokeLinecap='round'
                      strokeLinejoin='round'>
                      <path d='M13 8a5 5 0 11-5-5h3M11 1l2 2-2 2' />
                    </svg>
                  </button>
                  {!locked && (
                    <>
                      <span className='mx-1 h-[18px] w-px bg-line' />
                      <Mini
                        title={t`Start the clip at the playhead`}
                        onClick={() => onCropChange({ cropStart: currentTime, cropEnd })}>
                        {t`Start here`}
                      </Mini>
                      <Mini
                        title={t`End the clip at the playhead`}
                        onClick={() => onCropChange({ cropStart, cropEnd: currentTime })}>
                        {t`End here`}
                      </Mini>
                      {file.moments && (
                        <button
                          type='button'
                          title={t`From the exit to a few seconds after the landing`}
                          onClick={() =>
                            file.moments &&
                            onCropChange(jumpTrim(file.moments, montage, cropEnd ?? null))
                          }
                          className='inline-flex h-[30px] items-center gap-1.5 rounded-[10px] bg-accent-soft px-3 text-[12px] font-medium text-accent-ink hover:brightness-95'>
                          <Icon
                            name='scissors'
                            size={14}
                          />
                          {t`Trim to the jump`}
                        </button>
                      )}
                    </>
                  )}
                  <Spacer />
                  <span className='text-[11.5px] text-ink-3'>
                    {t`Scroll on the timeline to zoom · the graph follows`}
                  </span>
                  <span className='font-mono text-[11.5px] text-ink-2'>{zoom.toFixed(1)}x</span>
                </div>
                <div className='no-drag flex flex-col'>
                  <VideoCropper
                    duration={duration}
                    currentTime={currentTime}
                    cropStart={cropStart}
                    cropEnd={cropEnd}
                    zoom={zoom}
                    compact
                    thumbSrc={(seek) => getThumbUrl(proxy?.play ?? file.proxy ?? file.path, seek)}
                    moments={shownMoments}
                    onMomentChange={
                      locked
                        ? undefined
                        : onMomentChange &&
                          ((which, seconds) =>
                            onMomentChange(
                              which,
                              which === 'exit'
                                ? seconds + (file.moments?.exit ?? 0) - cutAt
                                : seconds
                            ))
                    }
                    onSeek={onSeek}
                    onCropChange={locked ? () => {} : onCropChange}
                    onApply={locked ? () => {} : onApply}
                    onZoomChange={onZoomChange}
                    freeAt={freeAt}
                    onFree={setFreeAt}
                    viewOffset={viewOffset}
                    joined={Boolean(track.track)}
                    onViewOffset={setViewOffset}
                    onView={setView}
                  />
                  <JumpGraph
                    track={track.track}
                    waiting={track.waiting}
                    moments={shownMoments}
                    currentTime={currentTime}
                    duration={duration}
                    view={view}
                    onZoom={(next, offset) => {
                      setFreeAt(currentTime)
                      onZoomChange(next)
                      setViewOffset(offset)
                    }}
                    onSlide={(offset) => {
                      setFreeAt(currentTime)
                      setViewOffset(offset)
                    }}
                    joined={Boolean(track.track)}
                    onSeek={onSeek}
                  />
                </div>
              </>
            )}
          </div>

          <div className='flex min-w-0 flex-col border-line-2 max-sm:border-t sm:overflow-y-auto sm:border-l'>
            <div className='flex-none px-5 pt-4'>
              <Seg
                wide
                label={t`What to change`}
                value={shownTab}
                options={tabs}
                onPick={setTab}
              />
            </div>
            {shownTab === 'cut' && video && (file.moments !== undefined || import.meta.env.DEV) && (
              <Part title={t`The jump`}>
                {file.moments === undefined ? (
                  <Note>{t`The marks have not been found yet.`}</Note>
                ) : file.moments === null ? (
                  <Note>{t`No exit found — nothing to hang a cut on.`}</Note>
                ) : (
                  <div className='flex flex-col gap-0.5'>
                    {(
                      [
                        ['exit', cutAt],
                        ['opening', file.moments.opening],
                        ['canopy', file.moments.canopy],
                        ['landing', file.moments.landing]
                      ] as const
                    ).flatMap(([which, at]) => {
                      const moment = nameOfMoment(which)
                      return at === undefined
                        ? []
                        : [
                            <button
                              key={which}
                              type='button'
                              onClick={() => onSeek(at)}
                              title={t`Go to the ${moment}`}
                              className='flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left text-[12.5px] text-ink hover:bg-well'>
                              <i
                                className={`size-2 flex-none rounded-full ${MARK_DOT[which]}`}
                                aria-hidden='true'
                              />
                              <span className='flex-1 font-medium first-letter:uppercase'>
                                {moment}
                              </span>
                              <span className='font-mono text-ink-3 tabular-nums'>{clock(at)}</span>
                              <span className='text-[11.5px] text-accent-ink'>{t`Go to`}</span>
                            </button>
                          ]
                    })}
                  </div>
                )}
                {import.meta.env.DEV && onMomentsRedo && (
                  <div className='self-start'>
                    <Mini
                      title={t`Development only: forget the marks, moved ones too, and find them again from the footage`}
                      onClick={onMomentsRedo}>
                      <Icon
                        name='scan'
                        size={14}
                      />
                      {t`Find the marks again`}
                    </Mini>
                  </div>
                )}
                {file.foundMoments && onMomentsReset && (
                  <div className='self-start'>
                    <Mini
                      title={t`Put every mark back where the camera measured it`}
                      onClick={onMomentsReset}>
                      <Icon
                        name='back'
                        size={14}
                      />
                      {t`Back to the measured marks`}
                    </Mini>
                  </div>
                )}
              </Part>
            )}
            {shownTab === 'cut' && video && (
              <Part title={t`Trim`}>
                <div className='grid grid-cols-2 gap-2'>
                  <div className='flex flex-col gap-1 rounded-[14px] bg-tile-1 px-3.5 py-3'>
                    <Note>{t`Start`}</Note>{' '}
                    <span className='font-mono text-[22px] leading-none font-medium tracking-[-0.02em] tabular-nums'>
                      {clock(from)}
                    </span>
                  </div>
                  <div className='flex flex-col gap-1 rounded-[14px] bg-tile-2 px-3.5 py-3'>
                    <Note>{t`End`}</Note>{' '}
                    <span className='font-mono text-[22px] leading-none font-medium tracking-[-0.02em] tabular-nums'>
                      {clock(to)}
                    </span>
                  </div>
                </div>
                <div className='flex flex-col gap-2.5 rounded-[14px] border border-line px-3.5 py-3'>
                  <div className='flex items-baseline justify-between'>
                    <span className='text-[12.5px] text-ink-2'>
                      {t`Keeps`} <V>{clock(Math.max(0, to - from))}</V> {t`of`} {clock(duration)}
                    </span>
                    {duration > 0 && (
                      <b className='font-mono text-[12.5px] font-medium text-accent-ink'>
                        {percent(Math.max(0, to - from) / duration)}
                      </b>
                    )}
                  </div>
                  <div className='h-1.5 overflow-hidden rounded-full bg-well'>
                    <i
                      className='block h-full rounded-full bg-accent'
                      style={{
                        width: `${duration > 0 ? Math.round((Math.max(0, to - from) / duration) * 100) : 0}%`
                      }}
                    />
                  </div>
                  <SizeAfter
                    before={file.size}
                    after={estimatedSize({
                      size: file.size,
                      kept: duration > 0 ? Math.max(0, to - from) / duration : 1
                    })}
                  />
                  <Note>
                    {t`Trimming moves no pixels.`}{' '}
                    {file.moments ? t`From the exit to a few seconds after the landing.` : ''}
                  </Note>
                </div>
              </Part>
            )}

            {shownTab === 'turn' && (
              <Part title={t`Turn`}>
                {!locked && (
                  <span
                    role='group'
                    aria-label={t`Turn`}
                    className='grid grid-cols-3 gap-2'>
                    {(
                      [
                        [
                          '0°',
                          '0°',
                          t`As shot`,
                          t`Back to as shot`,
                          rotation === 0,
                          () => rotation !== 0 && turn(360 - rotation)
                        ],
                        [
                          '↻ +90°',
                          '90°',
                          t`Quarter turn`,
                          t`Turn a quarter clockwise (R)`,
                          rotation === 90,
                          () => turn(90)
                        ],
                        [
                          '↻ +180°',
                          '180°',
                          t`Upside down`,
                          t`Turn upside down`,
                          rotation === 180,
                          () => turn(180)
                        ]
                      ] as const
                    ).map(([label, degrees, name, title, on, go]) => (
                      <button
                        key={label}
                        type='button'
                        aria-label={label}
                        aria-pressed={on}
                        title={title}
                        onClick={go}
                        className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[12px] font-medium ${
                          on ? 'bg-accent-soft text-accent-ink' : 'bg-well text-ink hover:bg-line'
                        }`}>
                        <span className='font-mono text-[15px]'>{degrees}</span>
                        {name}
                      </button>
                    ))}
                  </span>
                )}
                <Note>
                  {quarter
                    ? t`For a camera mounted sideways or upside down — a quarter turn makes it portrait.`
                    : t`For a camera mounted sideways or upside down.`}
                </Note>
                {!locked && rotation !== 0 && onRotationApplyToJump && (
                  <div className='self-start'>
                    <Mini
                      title={
                        video
                          ? t`Turn every clip in this jump the same way — a camera on its side is on its side for the whole jump`
                          : t`Turn every photo in this jump the same way — a camera on its side is on its side for the whole jump`
                      }
                      onClick={onRotationApplyToJump}>
                      {video
                        ? t`Give to every clip in the jump`
                        : t`Give to every photo in the jump`}
                    </Mini>
                  </div>
                )}
              </Part>
            )}

            {shownTab === 'frame' && video && (
              <Part title={t`Frame`}>
                {!locked && (
                  <span
                    role='group'
                    aria-label={t`Frame`}
                    className={CHOICES}>
                    {RATIOS.map((option) => (
                      <Choice
                        key={option.label}
                        on={shown === option.label}
                        title={i18n._(option.title)}
                        onClick={() => pickRatio(option)}>
                        {option.name ? i18n._(option.name) : option.label}
                      </Choice>
                    ))}
                  </span>
                )}
                {framing && onFrameApplyToJump && (
                  <div className='self-start'>
                    <Mini
                      title={t`Give every other clip in this jump the same rectangle — a badly mounted camera is badly mounted for the whole jump`}
                      onClick={onFrameApplyToJump}>
                      {t`Give to every clip in the jump`}
                    </Mini>
                  </div>
                )}
                {!locked && (
                  <button
                    type='button'
                    aria-pressed={filled}
                    disabled={!upright}
                    title={t`Delivered as a landscape clip: the picture in the middle, the sides filled with it blurred — nothing cut away`}
                    onClick={() => fillSides(!filled)}
                    className='flex items-center gap-2.5 self-start text-[12.5px] text-ink disabled:opacity-55'>
                    <span
                      className={`relative h-[18px] w-[30px] flex-none rounded-full transition-colors after:absolute after:top-[2px] after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,0.25)] after:transition-transform ${
                        filled ? 'bg-accent after:translate-x-3' : 'bg-line'
                      }`}
                    />
                    {t`Landscape, blurred sides`}
                  </button>
                )}
                {!locked && !upright && (
                  <Note>{t`Only for a clip that stands upright. This one is landscape.`}</Note>
                )}
                <Note>
                  {framing
                    ? t`Drag the rectangle to move it, a corner to resize. What is dimmed is cut away.`
                    : t`Cut a mount or a finger out of the corner. Same keeps the shape the clip already has.`}
                </Note>
                {framing && frame && (
                  <Note>
                    {t`Keeps`} <V>{percent(frame.width)}</V> {t`across`} ·{' '}
                    <V>{percent(frame.height)}</V> {t`down`} ·{' '}
                    <V>{percent(frame.width * frame.height)}</V> {t`of the picture`}
                  </Note>
                )}
                {framing && frame && (
                  <SizeAfter
                    before={file.size}
                    after={estimatedSize({
                      size: file.size,
                      kept: duration > 0 ? Math.max(0, to - from) / duration : 1,
                      frame
                    })}
                  />
                )}
                {framing && frame && (
                  <div className='font-mono text-[11px] text-ink-3'>
                    {(() => {
                      const box = cropToPixels(frame, turned.width, turned.height)
                      const stretch = turned.width / box.width
                      const times = stretch.toFixed(1)
                      return `${box.width}×${box.height} → ${turned.width}×${turned.height}${
                        stretch > 1.6 ? ` · ${t`${times}× upscale, will look soft`}` : ''
                      }`
                    })()}
                  </div>
                )}
              </Part>
            )}

            {shownTab === 'info' && (
              <Part title={t`The file`}>
                <div className='flex flex-col'>
                  {(
                    [
                      [t`Shot`, `${dateLabel(file.mtime)} ${formatTime(file.mtime)}`],
                      [t`Size now`, formatSize(file.size)],
                      ...(sizeAfter
                        ? ([[t`Size after processing`, sizeAfter]] as [string, string][])
                        : []),
                      ...(video && track.track && track.track.force.length > 0
                        ? ([
                            [t`Felt, least`, `${Math.min(...track.track.force).toFixed(2)} g`],
                            [t`Felt, most`, `${Math.max(...track.track.force).toFixed(2)} g`]
                          ] as [string, string][])
                        : []),
                      ...(status ? ([[t`State`, status]] as [string, string][]) : [])
                    ] as [string, string][]
                  ).map(([name, value]) => (
                    <div
                      key={name}
                      className='flex items-baseline justify-between gap-3 border-b border-line-2 py-2.5 text-[12.5px] last:border-b-0'>
                      <span className='text-ink-3'>{name}</span>
                      <span className='font-mono text-ink tabular-nums'>{value}</span>
                    </div>
                  ))}
                </div>
              </Part>
            )}
            {shownTab === 'info' && (
              <Part title={t`On the file now`}>
                <Note>
                  {!saved
                    ? t`Not trimmed, framed or turned — the file goes out as shot.`
                    : [
                        trimSaved ? t`Trimmed to ${trimmedFrom} – ${trimmedTo}.` : null,
                        frameSaved ? t`Framed.` : null,
                        turnSaved ? t`Turned ${turnedBy}°.` : null,
                        t`Applied the next time this file is processed.`
                      ]
                        .filter(Boolean)
                        .join(' ')}{' '}
                  {t`Solid is saved, dashed is not yet.`}
                </Note>
              </Part>
            )}
          </div>
        </div>

        <div className='flex flex-none flex-wrap items-center gap-2.5 border-t border-line-2 bg-pane px-5 py-3'>
          {locked ? (
            <span className='inline-flex items-center gap-1.5 text-[11.5px] text-ink-2'>
              <Icon
                name='lock'
                size={13}
              />
              {locked}
            </span>
          ) : (
            <>
              <span className='text-[12px] text-ink-3'>{t`On the file now`}</span>
              <span className='flex gap-1'>
                {video && (
                  <Adj
                    saved={trimSaved}
                    changed={trimChanged}>
                    {t`trim`}
                  </Adj>
                )}
                {video && (
                  <Adj
                    saved={frameSaved}
                    changed={!sameRectangle}>
                    {t`frame`}
                  </Adj>
                )}
                <Adj
                  saved={turnSaved}
                  changed={turnChanged}>
                  {t`turn`}
                </Adj>
              </span>
              <span className='text-[11.5px] text-ink-3'>{t`Solid is saved, dashed is not yet.`}</span>
            </>
          )}
          <Spacer />
          {!locked && dirty && (
            <span className='text-[12px] font-semibold text-local'>{t`Unsaved changes`}</span>
          )}
          {!locked && (
            <button
              type='button'
              aria-label={t`Reset trim, frame and turn`}
              disabled={!saved && !dirty}
              onClick={() => {
                onCropChange({ cropStart: null, cropEnd: null })
                onFrameChange(null)
                onRotate(0)
                onApply({ cropStart: null, cropEnd: null })
              }}
              className='h-8 rounded-[10px] px-3 text-[12.5px] font-medium text-ink-2 hover:bg-well hover:text-ink disabled:text-ink-3 disabled:hover:bg-transparent'>
              {t`Reset`}
            </button>
          )}
          <Mini onClick={() => leave(onClose)}>{t`Cancel`}</Mini>
          {!locked && (
            <Go
              disabled={!dirty}
              onClick={() => onApply({ cropStart, cropEnd })}>
              {t`Save`}
            </Go>
          )}
        </div>
        {leaving && (
          <Modal
            label={t`Unsaved changes`}
            title={t`Save the changes to this file?`}
            onClose={() => setLeaving(null)}
            footer={
              <>
                <Mini onClick={() => setLeaving(null)}>{t`Keep editing`}</Mini>
                <Spacer />
                <Danger
                  onClick={() => {
                    const go = leaving
                    setLeaving(null)
                    go()
                  }}>
                  {t`Discard`}
                </Danger>
                <Go
                  onClick={() => {
                    const go = leaving
                    setLeaving(null)
                    onApply({ cropStart, cropEnd })
                    go()
                  }}>
                  {t`Save`}
                </Go>
              </>
            }>
            <p className='m-0 text-[12.5px] text-ink-2'>
              {t`The trim, frame or turn you set has not been saved yet.`}
            </p>
          </Modal>
        )}
      </div>
    </div>
  )
}

export { PreviewDrawer }
export type { VideoRef }
