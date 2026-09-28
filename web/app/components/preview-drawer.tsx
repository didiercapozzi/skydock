import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { fitRatio, FrameCropper } from './frame-cropper'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Danger, Go, Mini } from './buttons'
import { typingInField } from '../helpers/keys'
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
import { JumpGraph } from './jump-graph'
import { useJumpTrack } from '../hooks/useJumpTrack'
import { VideoCropper } from './video-cropper'

type VideoRef = {
  seek: (time: number) => void
}

/* One block of the side panel: a quiet heading and whatever it is about. */
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h5 className='mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase'>
      {title}
    </h5>
    {children}
  </div>
)

const KV = ({ children }: { children: React.ReactNode }) => (
  <div className='font-mono text-[12px] text-ink-2'>{children}</div>
)

const V = ({ children }: { children: React.ReactNode }) => (
  <b className='font-semibold text-ink'>{children}</b>
)

/* a share of the whole, as the preview says it: to the percent, and never 0% for something kept */
const percent = (share: number) => `${Math.max(share > 0 ? 1 : 0, Math.round(share * 100))}%`

/* `label` is how the code knows the shape; `name`, where there is one, is how it is said */
type RatioOption = {
  label: string
  name?: MessageDescriptor
  ratio: number | null
  title: MessageDescriptor
}

/* `Same` is the one that matters most: a clip with a mount in the corner is cropped and stays the
   shape it was, which is what keeps a 16:9 jump 16:9 all the way to the passenger. */
const RATIOS: RatioOption[] = [
  {
    label: 'None',
    name: msg`None`,
    ratio: null,
    title: msg`Whole frame — the whole picture goes out as shot`
  },
  { label: 'Same', name: msg`Same`, ratio: null, title: msg`Keep the shape this clip already has` },
  { label: '9:16', ratio: 9 / 16, title: msg`Upright, for a phone` },
  { label: '4:5', ratio: 4 / 5, title: msg`Portrait` },
  { label: '1:1', ratio: 1, title: msg`Square` },
  { label: '16:9', ratio: 16 / 9, title: msg`Widescreen` },
  { label: 'Free', name: msg`Free`, ratio: null, title: msg`Drag the corners to any shape` }
]

/* Whether this browser plays H.264, the format proxies are made in. Some do not — a browser built
   without the licensed codecs, or an editor's built-in one — and then no clip can be shown at all,
   which is worth saying as such rather than clip by clip. */
const playsProxies = () =>
  document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') !== ''

/* The shape a rectangle already has, as the buttons name it: none for the whole picture, `Same` for
   the picture's own shape, a named ratio, or `Free` for any other. Measured on the picture as it
   comes out, turned, which is what the rectangle is a part of. */
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

/* The picture inside the box shaped like it will come out: as it is, or — for a quarter turn —
   sized the other way round, so that once turned it fills the box exactly. In percentages of the
   box, which is the turned shape: its width across becomes its height, and the other way round. */
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
  onPlayOutside,
  montage = false
}: {
  files: ManifestFile[]
  index: number
  /* what the file reads as right now — the same word its row shows */
  status?: string
  /* the server's look at whether this clip has its small copy, and which file to play */
  proxy?: ProxyFact
  /* the part of the picture to keep, or nothing for the whole of it */
  frame?: FrameCrop | null
  onFrameChange: (frame: FrameCrop | null) => void
  /* every other clip in the jump gets the same rectangle; absent for a file in no jump */
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
  /* where the footage has got to by itself, as it plays */
  onTime?: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
  onDurationChange: (duration: number) => void
  onVideoRef: (ref: VideoRef) => void
  /* how far the picture is turned clockwise — a draft, saved with the rest */
  rotation: Rotation
  onRotate: (rotation: Rotation) => void
  /* every file of the same kind in the jump gets the same turn; absent for a file in no jump */
  onRotationApplyToJump?: () => void
  /* why this file cannot be changed any more, when it cannot — then it is only looked at */
  locked?: string | null
  /* one of the jump's moments, moved on the timeline */
  onMomentChange?: (which: 'exit' | 'opening' | 'canopy' | 'landing', seconds: number) => void
  /* hand this file to the machine's own player; absent for a file this machine no longer holds */
  onPlayOutside?: () => void
  /* Whether this clip's jump is a montage, which decides where a cut starts from: a montage is its own
     subject and is cut on the instant the camera's wearer left, a fun jump a second earlier, where
     the group is going out of the door ahead of whoever is filming. */
  montage?: boolean
}) => {
  const file = files[index]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  /* the clip's own pixel size, read off the video once it has loaded — a ratio is measured against
     the picture, and until it is known the rectangle cannot be shaped */
  const [shape, setShape] = useState({ width: 16, height: 9 })
  /* the shape picked here, for the file it was picked on */
  const [picked, setPicked] = useState<{
    key: string
    label: string
    ratio: number | null
  } | null>(null)
  /* A browser cannot draw every clip: 4K HEVC off a DJI or a recent GoPro plays its sound and no
     picture, or nothing at all. The proxy is H.264 and always plays, and until it exists the preview
     says so rather than showing a black box. Kept by the address that failed, so it is gone the
     moment the proxy lands and the preview switches to it — and so that a clip its browser will not
     draw full size is remembered apart from the small copy that does. */
  const [unplayable, setUnplayable] = useState<string[]>([])
  const cannotPlay = (url: string) => unplayable.includes(url)
  const wontPlay = (url: string) =>
    setUnplayable((were) => (were.includes(url) ? were : [...were, url]))
  /* the picture on its own, filling the screen: for looking at it rather than deciding anything */
  const [big, setBig] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)
  /* seeks while the timeline is dragged, sent one at a time so the picture keeps up */
  const [scrub] = useState(createScrub)

  /* The picture as it will come out: turned. Its shape is what the box on screen takes, what the
     rectangle is drawn over and measured against, and what "Same" means. */
  const turned = turnedSize(shape.width, shape.height, rotation)
  const quarter = isQuarterTurn(rotation)

  /* Until a shape is picked, it is read off the rectangle the file already has: a frame saved
     earlier opens drawn and pressed on its own shape, and the next file starts from its own rather
     than from the last one's pick. */
  const fileKey = file ? (file.id ?? file.path) : ''
  const choice = picked?.key === fileKey ? picked : null
  const hasShape = savedShape(frame, turned)
  const shown = choice?.label ?? hasShape.label
  const ratio = choice ? choice.ratio : hasShape.ratio
  const pick = (label: string, next: number | null) =>
    setPicked({ key: fileKey, label, ratio: next })

  /* A landscape fill stays through whatever is done to the rectangle — dragged, reshaped, taken
     away — since it is about how the picture is delivered, not what is cut out of it. Only Reset
     and its own switch take it away. */
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
        : rest && { x: rest.x, y: rest.y, width: rest.width, height: rest.height }
    )
  }

  /* A quarter turn swaps the picture's shape, so a rectangle on it is fitted again at the shape it
     had — "Same" becoming the new shape — rather than left the wrong way round. */
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
  /* The browser's own full screen where it is allowed — a page can only ask for it from a press —
     and the whole window where it is not, which is the same picture at the same size in a window
     that is already full. Either way one state says which, and leaving is Escape. */
  const showBig = () => {
    setBig(true)
    void stage.current?.requestFullscreen?.().catch(() => undefined)
  }
  const leaveBig = () => {
    setBig(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }
  /* full screen is the browser's to give and to take away — F11, Escape, the window losing it —
     so what it says is followed rather than assumed */
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
      /* paused again before it got going, or nothing it can play: either way it is not playing */
      v.play().catch(() => setPlaying(false))
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }
  /* Escape leaves full screen, or closes when there is none to leave; F fills the screen with the
     picture; R turns a quarter clockwise, as the button does; space plays and pauses a clip,
     whichever button was pressed last — never while a field has the keyboard. One listener on the
     window, set once, which reads the latest turn each time a key comes. */
  /* where it was going when it was stopped to ask about unsaved changes */
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  /* What is on screen against what is on the file: the one tells you there is something to save.
     Both halves count: watching only the trim would leave the button dead after a rectangle had
     been dragged, which reads as "it did not work" — and the rectangle is the half with no other way
     of telling. */
  const sameRectangle = sameFrame(frame, file?.frame)
  const dirty =
    (cropStart ?? null) !== (file?.cropStart ?? null) ||
    (cropEnd ?? null) !== (file?.cropEnd ?? null) ||
    !sameRectangle ||
    rotation !== (file?.rotation ?? 0)
  /* Leaving with changes not saved asks first — Esc, a click outside, Close, Prev and Next all leave —
     rather than dropping a trim somebody spent a minute on (RULES, Cropping and turning). */
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
  /* a rectangle is on screen whenever there is one to show; `None` takes it away */
  const framing = frame != null && shown !== 'None'

  /* `Same` and `Free` are the clip's own shape and no shape at all; the rest are named ratios.
     Picking one reshapes the rectangle there and then, so the shape is never a promise the
     rectangle has yet to keep. */
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
  /* Full screen shows the file itself rather than the small copy the crop bar scrubs: a proxy is
     640 across, which is what makes dragging a timeline answer at once and quite the wrong thing to
     judge a picture by. A photo is already itself here, so only a clip has anywhere to go — and a
     clip this browser has no decoder for falls back to the small copy, which is better than a black
     rectangle, and says so. */
  const fullUrl = video ? getFileUrl(file.path) : fileUrl
  const fullSize = big && fullUrl !== fileUrl && !cannotPlay(fullUrl)
  const playUrl = fullSize ? fullUrl : fileUrl
  const shrunk = big && !fullSize && fullUrl !== fileUrl
  const cannotShow = cannotPlay(playUrl)
  /* what the camera measured across this clip, for the graph under the timeline */
  const track = useJumpTrack(video ? file.path : null)

  /* Where a cut would start, which is the mark as it is shown and dragged: the measured instant on a
     montage, a second before it on a fun jump (RULES, Where the jump is in a clip). */
  const cutAt = file.moments ? cutFrom(file.moments, montage) : 0
  const shownMoments = file.moments && { ...file.moments, exit: cutAt }
  const from = cropStart ?? 0
  const to = cropEnd ?? duration
  /* named, so a translator reads what each one is */
  const proxyFailure = proxy?.reason ?? ''
  const trimmedFrom = clock(file.cropStart ?? 0)
  const trimmedTo = clock(file.cropEnd ?? duration)
  const turnedBy = file.rotation ?? 0
  const saved =
    file.cropStart != null ||
    file.cropEnd != null ||
    !isWholeFrame(file.frame) ||
    Boolean(file.rotation)

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && leave(onClose)}
      className='fixed inset-0 z-40 grid place-items-center bg-[rgba(8,12,16,0.64)] p-4'>
      <div
        data-preview-drawer='true'
        role='dialog'
        aria-modal='true'
        aria-label={t`Preview`}
        className='relative flex max-h-full w-[min(1040px,100%)] flex-col overflow-hidden rounded-xl bg-pane text-ink shadow-[0_20px_60px_rgba(0,0,0,0.4)]'>
        {/* head and foot stay put; only the body scrolls, so Save crop is never below the fold */}
        <div className='flex flex-none flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-2.5'>
          <span className='truncate font-mono text-[13px] font-semibold'>{file.filename}</span>
          <span className='text-[12px] text-ink-2'>
            {dateLabel(file.mtime)} · {formatTime(file.mtime)} · {formatSize(file.size)}
            {status ? ` · ${status}` : ''}
          </span>
          <Spacer />
          <span className='font-mono text-[12px] text-ink-2 tabular-nums'>
            {index + 1} / {files.length}
          </span>
          <Mini
            disabled={index === 0}
            onClick={() => leave(onPrevious)}>
            {t`‹ Prev`}
          </Mini>
          <Mini
            disabled={index === files.length - 1}
            onClick={() => leave(onNext)}>
            {t`Next ›`}
          </Mini>
          <Mini
            title={
              video
                ? t`See the clip full screen, at its own size (F)`
                : t`See the photo full screen, at its own size (F)`
            }
            onClick={showBig}>
            {t`⛶ Full screen`}
          </Mini>
          {onPlayOutside && (
            <Mini
              title={
                video
                  ? t`Open the clip in this machine's own player — the file as it was shot, whatever the browser can decode`
                  : t`Open the photo in this machine's own player — the file as it was shot, whatever the browser can decode`
              }
              onClick={onPlayOutside}>
              {t`▶ Open in the player`}
            </Mini>
          )}
          <Mini
            title={t`Close (Esc)`}
            onClick={onClose}>
            ✕
          </Mini>
        </div>

        <div className='grid min-h-0 grid-cols-1 overflow-auto sm:grid-cols-[minmax(0,1fr)_300px]'>
          <div className='min-w-0 bg-[#0b0f13] p-3.5'>
            <div
              ref={stage}
              onDoubleClick={() => (big ? leaveBig() : showBig())}
              className={
                big
                  ? 'fixed inset-0 z-50 grid place-items-center bg-black'
                  : 'grid h-[min(46vh,380px)] place-items-center overflow-hidden'
              }>
              {/* A box the shape of the picture as it will come out — turned — with the picture
                  turned inside it, and the rectangle laid over the box: it is drawn on the
                  turned picture, and measured against it. The panel itself is letterboxed, and a
                  rectangle measured against that would mean the wrong part of the frame. */}
              <span
                /* not clipped: the rectangle's corner handles sit half outside the picture */
                className='relative block'
                style={{
                  aspectRatio: `${turned.width} / ${turned.height}`,
                  width: big
                    ? `min(100vw, calc(100vh * ${turned.width / turned.height}))`
                    : `min(100%, calc(min(46vh, 380px) * ${turned.width / turned.height}))`
                }}>
                {video ? (
                  <video
                    /* the way to seek this element is handed up as soon as it exists */
                    ref={(el) => {
                      videoRef.current = el
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
                      /* a trimmed clip starts where its trim does, as the copy made from it will */
                      if (currentTime > 0 && Math.abs(v.currentTime - currentTime) > 0.05)
                        scrub.seek(v, currentTime)
                      if (v.videoWidth && v.videoHeight)
                        setShape({ width: v.videoWidth, height: v.videoHeight })
                      /* sound and no picture: the browser has no decoder for this video */ else
                        wontPlay(playUrl)
                    }}
                    onError={() => wontPlay(playUrl)}
                    style={pictureStyle(shape, rotation)}
                    className='absolute top-1/2 left-1/2 rounded-md transition-transform duration-150'
                  />
                ) : (
                  <img
                    src={playUrl}
                    alt={file.filename}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth && img.naturalHeight)
                        setShape({ width: img.naturalWidth, height: img.naturalHeight })
                    }}
                    style={pictureStyle(shape, rotation)}
                    className='absolute top-1/2 left-1/2 rounded-md transition-transform duration-150'
                  />
                )}
                {video && cannotShow && (
                  <span
                    role='status'
                    className='absolute inset-0 grid place-items-center rounded-md bg-[#0b0f13] p-4 text-center text-[12.5px] text-white/80'>
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
                {/* how much of the picture the rectangle keeps, riding on its corner as it is
                    dragged — out of the way of the handles, and never in the way of a drag */}
                {video && framing && frame && !big && (
                  <span
                    aria-hidden='true'
                    style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%` }}
                    className='pointer-events-none absolute z-10 mt-1 ml-1 rounded-sm bg-black/70 px-1.5 py-px font-mono text-[11px] text-white tabular-nums'>
                    {percent(frame.width)} × {percent(frame.height)}
                  </span>
                )}
              </span>
              {big && (
                <div className='absolute top-3 right-3 flex items-center gap-2'>
                  {shrunk && (
                    <span className='rounded-md bg-black/70 px-2 py-1 text-[11.5px] text-white/80'>
                      {t`This browser has no decoder for the clip itself — the small copy is playing`}
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
                <div className='mt-3 flex items-center gap-2.5 text-[#e7ecf1]'>
                  <button
                    type='button'
                    onClick={toggle}
                    className='min-w-[64px] rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20'>
                    {playing ? t`❚❚ Pause` : t`▶ Play`}
                  </button>
                  <span className='flex-1' />
                  <span className='min-w-[88px] text-right font-mono text-[11.5px] tabular-nums'>
                    {clock(currentTime)} / {clock(duration)}
                  </span>
                </div>
                <div className='mt-3'>
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
                              /* dragged where the cut should start, kept as the instant it stands
                                 for, so what is written down is still a measurement */
                              which === 'exit'
                                ? seconds + (file.moments?.exit ?? 0) - cutAt
                                : seconds
                            ))
                    }
                    onSeek={onSeek}
                    onCropChange={locked ? () => {} : onCropChange}
                    onApply={locked ? () => {} : onApply}
                    onZoomChange={onZoomChange}
                  />
                </div>
                {/* The jump itself, drawn against the same clip and dragged the same way: the force
                    the camera felt, the phases behind it, and the height and speed when the camera
                    knew them. It sits under the timeline because the two are read together. */}
                <div className='mt-3'>
                  <JumpGraph
                    track={track.track}
                    waiting={track.waiting}
                    moments={shownMoments}
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={onSeek}
                  />
                </div>
              </>
            )}
          </div>

          <div className='flex flex-col gap-3.5 border-line p-3.5 max-sm:border-t sm:border-l'>
            {/* Where the jump is, and what the marks on the timeline mean. Each one seeks there,
                since the only way to tell a mark is right is to look at the frame under it. A clip
                the camera said nothing about says so plainly — most clips are not jumps. */}
            {video && file.moments !== undefined && (
              <Panel title={t`The jump`}>
                {file.moments === null ? (
                  <KV>{t`No exit found — nothing to hang a cut on.`}</KV>
                ) : (
                  <div className='flex flex-wrap gap-1.5'>
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
                              className='rounded-[5px] border border-line px-2 py-1 font-mono text-[11.5px] text-ink-2 hover:bg-surface-2'>
                              {moment} <V>{clock(at)}</V>
                            </button>
                          ]
                    })}
                  </div>
                )}
              </Panel>
            )}
            {video && (
              <Panel title={t`Trim`}>
                <KV>
                  {t`Start`} <V>{clock(from)}</V> · {t`End`} <V>{clock(to)}</V>
                </KV>
                <KV>
                  {t`Keeps`} <V>{clock(Math.max(0, to - from))}</V> {t`of`} {clock(duration)}
                  {duration > 0 && (
                    <>
                      {' '}
                      · <V>{percent(Math.max(0, to - from) / duration)}</V>
                    </>
                  )}
                </KV>
                <div className={`mt-1.5 flex flex-wrap gap-1.5 ${locked ? 'hidden' : ''}`}>
                  <Mini onClick={() => onCropChange({ cropStart: currentTime, cropEnd })}>
                    {t`Start at playhead`}
                  </Mini>
                  <Mini onClick={() => onCropChange({ cropStart, cropEnd: currentTime })}>
                    {t`End at playhead`}
                  </Mini>
                  {file.moments && (
                    <Mini
                      title={t`From the exit to a few seconds after the landing`}
                      onClick={() =>
                        file.moments &&
                        onCropChange(jumpTrim(file.moments, montage, cropEnd ?? null))
                      }>
                      {t`Trim to the jump`}
                    </Mini>
                  )}
                </div>
              </Panel>
            )}

            <Panel title={t`Turn`}>
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className='min-w-[38px] font-mono text-[12px] font-semibold'>
                  {rotation}°
                </span>
                {!locked && (
                  <>
                    <Mini
                      title={t`Turn a quarter clockwise (R)`}
                      onClick={() => turn(90)}>
                      ↻ +90°
                    </Mini>
                    <Mini
                      title={t`Turn upside down`}
                      onClick={() => turn(180)}>
                      ↻ +180°
                    </Mini>
                    {rotation !== 0 && (
                      <Mini
                        title={t`Back to as shot`}
                        onClick={() => turn(360 - rotation)}>
                        0°
                      </Mini>
                    )}
                  </>
                )}
              </div>
              <div className='mt-1 text-[12px] text-ink-2'>
                {quarter
                  ? t`For a camera mounted sideways or upside down — a quarter turn makes it portrait.`
                  : t`For a camera mounted sideways or upside down.`}
              </div>
              {!locked && rotation !== 0 && onRotationApplyToJump && (
                <div className='mt-1.5'>
                  <Mini
                    title={
                      video
                        ? t`Turn every clip in this jump the same way — a camera on its side is on its side for the whole jump`
                        : t`Turn every photo in this jump the same way — a camera on its side is on its side for the whole jump`
                    }
                    onClick={onRotationApplyToJump}>
                    {t`Apply to the whole jump`}
                  </Mini>
                </div>
              )}
            </Panel>

            {video && (
              <Panel title={t`Frame`}>
                <div className={`flex flex-wrap gap-1.5 ${locked ? 'hidden' : ''}`}>
                  {RATIOS.map((option) => (
                    <Mini
                      key={option.label}
                      pressed={shown === option.label}
                      title={i18n._(option.title)}
                      onClick={() => pickRatio(option)}>
                      {option.name ? i18n._(option.name) : option.label}
                    </Mini>
                  ))}
                </div>
                {!locked && turned.height > turned.width && (
                  <div className='mt-1.5'>
                    <Mini
                      pressed={filled}
                      title={t`Delivered as a landscape clip: the picture in the middle, the sides filled with it blurred — nothing cut away`}
                      onClick={() => fillSides(!filled)}>
                      {t`Landscape, blurred sides`}
                    </Mini>
                  </div>
                )}
                <div className='mt-1 text-[12px] text-ink-2'>
                  {framing
                    ? t`Drag the rectangle to move it, a corner to resize. What is dimmed is cut away.`
                    : t`Cut a mount or a finger out of the corner. Same keeps the shape the clip already has.`}
                </div>
                {/* What is left, in pixels, and what it is stretched back to. A crop is put back to
                  the size the clip came at, so a small rectangle is a big upscale — which looks
                  soft, and nothing else on screen would say so. */}
                {framing && frame && (
                  <KV>
                    {t`Keeps`} <V>{percent(frame.width)}</V> {t`across`} ·{' '}
                    <V>{percent(frame.height)}</V> {t`down`} ·{' '}
                    <V>{percent(frame.width * frame.height)}</V> {t`of the picture`}
                  </KV>
                )}
                {framing && frame && (
                  <div className='mt-1 font-mono text-[11.5px] text-ink-3'>
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
                {framing && onFrameApplyToJump && (
                  <div className='mt-1.5'>
                    <Mini
                      title={t`Give every other clip in this jump the same rectangle — a badly mounted camera is badly mounted for the whole jump`}
                      onClick={onFrameApplyToJump}>
                      {t`Apply to the whole jump`}
                    </Mini>
                  </div>
                )}
              </Panel>
            )}

            <Panel title={t`On the file`}>
              <div className='text-[12px] text-ink-2'>
                {/* both halves, separately, because a rectangle cannot be read off a row and a
                    panel saying only "crop saved" leaves you guessing which one it meant */}
                {!saved
                  ? t`Not trimmed, framed or turned — the file goes out as shot.`
                  : [
                      file.cropStart != null || file.cropEnd != null
                        ? t`Trimmed to ${trimmedFrom} – ${trimmedTo}.`
                        : null,
                      !isWholeFrame(file.frame) ? t`Framed.` : null,
                      file.rotation ? t`Turned ${turnedBy}°.` : null,
                      t`Applied the next time this file is processed.`
                    ]
                      .filter(Boolean)
                      .join(' ')}
              </div>
            </Panel>
          </div>
        </div>

        <div className='flex flex-none flex-wrap items-center gap-2.5 border-t border-line px-3.5 py-2.5'>
          {locked && <span className='text-[11.5px] text-ink-2'>🔒 {locked}</span>}
          {!locked && (
            <Mini
              disabled={!saved && !dirty}
              onClick={() => {
                onCropChange({ cropStart: null, cropEnd: null })
                /* every part, because one Reset that left another behind would be a trap */
                onFrameChange(null)
                onRotate(0)
                onApply({ cropStart: null, cropEnd: null })
              }}>
              {t`Reset trim, frame and turn`}
            </Mini>
          )}
          {dirty && (
            <span className='text-[11.5px] font-semibold text-local'>{t`Unsaved changes`}</span>
          )}
          <Spacer />
          <Mini onClick={() => leave(onClose)}>{t`Close`}</Mini>
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
