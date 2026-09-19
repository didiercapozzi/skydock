import { fitRatio, FrameCropper } from './frame-cropper'
import { useEffect, useRef, useState } from 'react'
import { Go, Mini } from './buttons'
import { Spacer } from './modal'
import { cropToPixels, isQuarterTurn, isWholeFrame, turnBy, turnedSize } from '@skydock/scripts'
import type { FrameCrop, ProxyFact, Rotation } from '@skydock/scripts'
import type { ManifestFile } from './types'
import {
  clock,
  dateLabel,
  formatSize,
  formatTime,
  getPlaybackUrl,
  getThumbUrl,
  isVideoFile
} from './utils'
import { VideoCropper } from './video-cropper'

type VideoRef = {
  seek: (time: number) => void
}

/* One block of the side panel: a quiet heading and whatever it is about. */
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h5 className='mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase'>
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

type RatioOption = { label: string; ratio: number | null; title: string }

/* `Same` is the one that matters most: a clip with a mount in the corner is cropped and stays the
   shape it was, which is what keeps a 16:9 jump 16:9 all the way to the passenger. */
const RATIOS: RatioOption[] = [
  { label: 'None', ratio: null, title: 'No crop — the whole picture goes out as shot' },
  { label: 'Same', ratio: null, title: 'Keep the shape this clip already has' },
  { label: '9:16', ratio: 9 / 16, title: 'Upright, for a phone' },
  { label: '4:5', ratio: 4 / 5, title: 'Portrait' },
  { label: '1:1', ratio: 1, title: 'Square' },
  { label: '16:9', ratio: 16 / 9, title: 'Widescreen' },
  { label: 'Free', ratio: null, title: 'Drag the corners to any shape' }
]

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
  onCropChange,
  onApply,
  onZoomChange,
  onDurationChange,
  onVideoRef,
  rotation,
  onRotate,
  onRotationApplyToJump,
  locked
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
}) => {
  const file = files[index]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  /* the clip's own pixel size, read off the video once it has loaded — a ratio is measured against
     the picture, and until it is known the rectangle cannot be shaped */
  const [shape, setShape] = useState({ width: 16, height: 9 })
  const [shown, setShown] = useState('None')
  const [ratio, setRatio] = useState<number | null>(null)
  /* A browser cannot draw every clip: 4K HEVC off a DJI or a recent GoPro plays its sound and no
     picture, or nothing at all. The proxy is H.264 and always plays, and until it exists the preview
     says so rather than showing a black box. Kept by the address that failed, so it is gone the
     moment the proxy lands and the preview switches to it. */
  const [unplayable, setUnplayable] = useState<string | null>(null)

  /* The picture as it will come out: turned. Its shape is what the box on screen takes, what the
     rectangle is drawn over and measured against, and what "Same" means. */
  const turned = turnedSize(shape.width, shape.height, rotation)
  const quarter = isQuarterTurn(rotation)

  /* A quarter turn swaps the picture's shape, so a rectangle on it is fitted again at the shape it
     had — "Same" becoming the new shape — rather than left the wrong way round. */
  const turn = (by: number) => {
    if (locked) return
    const next = turnBy(rotation, by)
    if (frame && isQuarterTurn(next) !== quarter) {
      const after = turnedSize(shape.width, shape.height, next)
      const keep = shown === 'Same' || ratio === null ? after.width / after.height : ratio
      if (shown === 'Same') setRatio(keep)
      onFrameChange(fitRatio(keep, after.width, after.height))
    }
    onRotate(next)
  }
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
  /* Escape closes; R turns a quarter clockwise, as the button does; space plays and pauses a clip,
     whichever button was pressed last — never while a field has the keyboard. One listener on the
     window, renewed each render so it sees the latest turn. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
        return
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        turn(90)
      }
      if (e.key === ' ' && videoRef.current) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!file) return null

  const fileUrl = getPlaybackUrl(file, proxy)
  const cannotShow = unplayable === fileUrl
  /* a rectangle is on screen whenever there is one to show; `None` takes it away */
  const framing = frame != null && shown !== 'None'

  /* `Same` and `Free` are the clip's own shape and no shape at all; the rest are named ratios.
     Picking one reshapes the rectangle there and then, so the shape is never a promise the
     rectangle has yet to keep. */
  const pickRatio = (option: RatioOption) => {
    setShown(option.label)
    if (option.label === 'None') {
      setRatio(null)
      onFrameChange(null)
      return
    }
    const next = option.label === 'Free' ? null : (option.ratio ?? turned.width / turned.height)
    setRatio(next)
    onFrameChange(
      next === null
        ? (frame ?? fitRatio(turned.width / turned.height, turned.width, turned.height))
        : fitRatio(next, turned.width, turned.height)
    )
  }
  const video = isVideoFile(file.filename)
  const from = cropStart ?? 0
  const to = cropEnd ?? duration
  /* What is on screen against what is on the file: the one tells you there is something to save.
     Both halves count. Watching only the trim left the button dead after a rectangle had been
     dragged, which reads as "it did not work" — and the rectangle is the half with no other way
     of telling. */
  const sameRectangle =
    isWholeFrame(frame) === isWholeFrame(file.frame) &&
    (isWholeFrame(frame) ||
      (frame?.x === file.frame?.x &&
        frame?.y === file.frame?.y &&
        frame?.width === file.frame?.width &&
        frame?.height === file.frame?.height))
  const dirty =
    (cropStart ?? null) !== (file.cropStart ?? null) ||
    (cropEnd ?? null) !== (file.cropEnd ?? null) ||
    !sameRectangle ||
    rotation !== (file.rotation ?? 0)
  const saved =
    file.cropStart != null ||
    file.cropEnd != null ||
    !isWholeFrame(file.frame) ||
    Boolean(file.rotation)

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className='fixed inset-0 z-40 grid place-items-center bg-[rgba(8,12,16,0.64)] p-4'>
      <div
        data-preview-drawer='true'
        role='dialog'
        aria-modal='true'
        aria-label='Preview'
        className='flex max-h-full w-[min(1040px,100%)] flex-col overflow-hidden rounded-xl bg-pane text-ink shadow-[0_20px_60px_rgba(0,0,0,0.4)]'>
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
            onClick={onPrevious}>
            ‹ Prev
          </Mini>
          <Mini
            disabled={index === files.length - 1}
            onClick={onNext}>
            Next ›
          </Mini>
          <Mini
            title='Close (Esc)'
            onClick={onClose}>
            ✕
          </Mini>
        </div>

        <div className='grid min-h-0 grid-cols-1 overflow-auto sm:grid-cols-[minmax(0,1fr)_300px]'>
          <div className='min-w-0 bg-[#0b0f13] p-3.5'>
            <div className='grid h-[min(46vh,380px)] place-items-center overflow-hidden'>
              {/* A box the shape of the picture as it will come out — turned — with the picture
                  turned inside it, and the rectangle laid over the box: it is drawn on the
                  turned picture, and measured against it. The panel itself is letterboxed, and a
                  rectangle measured against that would mean the wrong part of the frame. */}
              <span
                /* not clipped: the rectangle's corner handles sit half outside the picture */
                className='relative block'
                style={{
                  aspectRatio: `${turned.width} / ${turned.height}`,
                  width: `min(100%, calc(min(46vh, 380px) * ${turned.width / turned.height}))`
                }}>
                {video ? (
                  <video
                    /* the way to seek this element is handed up as soon as it exists */
                    ref={(el) => {
                      videoRef.current = el
                      onVideoRef({
                        seek: (time: number) => {
                          if (el) el.currentTime = time
                        }
                      })
                    }}
                    src={fileUrl}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
                      if (v.videoWidth && v.videoHeight)
                        setShape({ width: v.videoWidth, height: v.videoHeight })
                      /* sound and no picture: the browser has no decoder for this video */ else
                        setUnplayable(fileUrl)
                    }}
                    onError={() => setUnplayable(fileUrl)}
                    style={pictureStyle(shape, rotation)}
                    className='absolute top-1/2 left-1/2 rounded-md transition-transform duration-150'
                  />
                ) : (
                  <img
                    src={fileUrl}
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
                    {proxy?.state === 'none'
                      ? 'The browser cannot show this clip’s picture — it is in a format only the editor reads, such as 4K HEVC. Its proxy is being made, and the preview plays it as soon as it is ready.'
                      : 'The browser cannot show this clip’s picture. It is copied, processed and uploaded all the same.'}
                  </span>
                )}
                {video && framing && (
                  <FrameCropper
                    crop={frame}
                    ratio={ratio}
                    frame={turned}
                    onChange={onFrameChange}
                  />
                )}
              </span>
            </div>
            {video && (
              <>
                <div className='mt-3 flex items-center gap-2.5 text-[#e7ecf1]'>
                  <button
                    type='button'
                    onClick={toggle}
                    className='min-w-[64px] rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20'>
                    {playing ? '❚❚ Pause' : '▶ Play'}
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
                    thumbSrc={(seek) => getThumbUrl(file.path, seek)}
                    onSeek={onSeek}
                    onCropChange={locked ? () => {} : onCropChange}
                    onApply={locked ? () => {} : onApply}
                    onZoomChange={onZoomChange}
                  />
                </div>
              </>
            )}
          </div>

          <div className='flex flex-col gap-3.5 border-line p-3.5 max-sm:border-t sm:border-l'>
            {video && (
              <Panel title='Trim'>
                <KV>
                  Start <V>{clock(from)}</V> · End <V>{clock(to)}</V>
                </KV>
                <KV>
                  Keeps <V>{clock(Math.max(0, to - from))}</V> of {clock(duration)}
                </KV>
                <div className={`mt-1.5 flex flex-wrap gap-1.5 ${locked ? 'hidden' : ''}`}>
                  <Mini onClick={() => onCropChange({ cropStart: currentTime, cropEnd })}>
                    Start at playhead
                  </Mini>
                  <Mini onClick={() => onCropChange({ cropStart, cropEnd: currentTime })}>
                    End at playhead
                  </Mini>
                </div>
              </Panel>
            )}

            <Panel title='Rotate'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className='min-w-[38px] font-mono text-[12px] font-semibold'>
                  {rotation}°
                </span>
                {!locked && (
                  <>
                    <Mini
                      title='Turn a quarter clockwise (R)'
                      onClick={() => turn(90)}>
                      ↻ +90°
                    </Mini>
                    <Mini
                      title='Turn upside down'
                      onClick={() => turn(180)}>
                      ↻ +180°
                    </Mini>
                    {rotation !== 0 && (
                      <Mini
                        title='Back to as shot'
                        onClick={() => turn(360 - rotation)}>
                        0°
                      </Mini>
                    )}
                  </>
                )}
              </div>
              <div className='mt-1 text-[12px] text-ink-2'>
                For a camera mounted sideways or upside down
                {quarter ? ' — a quarter turn makes it portrait.' : '.'}
              </div>
              {!locked && rotation !== 0 && onRotationApplyToJump && (
                <div className='mt-1.5'>
                  <Mini
                    title={`Turn every ${video ? 'clip' : 'photo'} in this jump the same way — a camera on its side is on its side for the whole jump`}
                    onClick={onRotationApplyToJump}>
                    Apply to the whole jump
                  </Mini>
                </div>
              )}
            </Panel>

            {video && (
              <Panel title='Frame'>
                <div className={`flex flex-wrap gap-1.5 ${locked ? 'hidden' : ''}`}>
                  {RATIOS.map((option) => (
                    <Mini
                      key={option.label}
                      aria-pressed={shown === option.label}
                      title={option.title}
                      onClick={() => pickRatio(option)}>
                      {option.label}
                    </Mini>
                  ))}
                </div>
                <div className='mt-1 text-[12px] text-ink-2'>
                  {framing
                    ? 'Drag the rectangle to move it, a corner to resize. What is dimmed is cut away.'
                    : 'Cut a mount or a finger out of the corner. Same keeps the shape the clip already has.'}
                </div>
                {/* What is left, in pixels, and what it is stretched back to. A crop is put back to
                  the size the clip came at, so a small rectangle is a big upscale — which looks
                  soft, and nothing else on screen would say so. */}
                {framing && frame && (
                  <div className='mt-1 font-mono text-[11.5px] text-ink-3'>
                    {(() => {
                      const box = cropToPixels(frame, turned.width, turned.height)
                      const stretch = turned.width / box.width
                      return `${box.width}×${box.height} → ${turned.width}×${turned.height}${
                        stretch > 1.6 ? ` · ${stretch.toFixed(1)}× upscale, will look soft` : ''
                      }`
                    })()}
                  </div>
                )}
                {framing && onFrameApplyToJump && (
                  <div className='mt-1.5'>
                    <Mini
                      title='Give every other clip in this jump the same rectangle — a badly mounted camera is badly mounted for the whole jump'
                      onClick={onFrameApplyToJump}>
                      Apply to the whole jump
                    </Mini>
                  </div>
                )}
              </Panel>
            )}

            <Panel title='On the file'>
              <div className='text-[12px] text-ink-2'>
                {/* both halves, separately, because a rectangle cannot be read off a row and a
                    panel saying only "crop saved" leaves you guessing which one it meant */}
                {!saved
                  ? 'No crop — the file goes out as shot.'
                  : [
                      file.cropStart != null || file.cropEnd != null
                        ? `Trimmed to ${clock(file.cropStart ?? 0)} – ${clock(file.cropEnd ?? duration)}.`
                        : null,
                      !isWholeFrame(file.frame) ? 'Frame cropped.' : null,
                      file.rotation ? `Turned ${file.rotation}°.` : null,
                      'Applied the next time this file is processed.'
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
              Reset crop
            </Mini>
          )}
          {dirty && <span className='text-[11.5px] font-semibold text-local'>Unsaved changes</span>}
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          {!locked && (
            <Go
              disabled={!dirty}
              onClick={() => onApply({ cropStart, cropEnd })}>
              {video ? 'Save crop' : 'Save'}
            </Go>
          )}
        </div>
      </div>
    </div>
  )
}

export { PreviewDrawer }
export type { VideoRef }
