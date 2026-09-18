import { fitRatio, FrameCropper } from './frame-cropper'
import { useEffect, useRef, useState } from 'react'
import { Go, Mini } from './buttons'
import { Spacer } from './modal'
import { cropToPixels, isWholeFrame } from '@skydock/scripts'
import type { FrameCrop, ProxyFact } from '@skydock/scripts'
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

/* Turning the footage and reframing it both mean re-encoding the picture, and preparing a file
   copies its stream through untouched. They are drawn because they are part of the decision this
   dialog is for, and held shut because the pipeline behind them has not been built yet — offering
   a control that quietly does nothing would be worse than saying so. */
const NOT_YET =
  'Not built yet: preparing a file copies its video stream as it is, which cannot turn or reframe a picture.'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef({
        seek: (time: number) => {
          if (videoRef.current) videoRef.current.currentTime = time
        }
      })
    }
  }, [file?.path, onVideoRef])

  if (!file) return null

  const fileUrl = getPlaybackUrl(file, proxy)
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
    const next = option.label === 'Free' ? null : (option.ratio ?? shape.width / shape.height)
    setRatio(next)
    onFrameChange(
      next === null
        ? (frame ?? fitRatio(shape.width / shape.height, shape.width, shape.height))
        : fitRatio(next, shape.width, shape.height)
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
    !sameRectangle
  const saved = file.cropStart != null || file.cropEnd != null || !isWholeFrame(file.frame)

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

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
              {video ? (
                /* the rectangle is drawn on the picture, so it is laid over a box the video
                   fills rather than over the whole panel — the panel is letterboxed and a
                   rectangle measured against it would mean the wrong part of the frame */
                <span className='relative inline-block max-h-full max-w-full leading-none'>
                  <video
                    ref={videoRef}
                    src={fileUrl}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
                      if (v.videoWidth && v.videoHeight)
                        setShape({ width: v.videoWidth, height: v.videoHeight })
                    }}
                    className='max-h-[min(46vh,380px)] max-w-full rounded-md'
                  />
                  {framing && (
                    <FrameCropper
                      crop={frame}
                      ratio={ratio}
                      frame={shape}
                      onChange={onFrameChange}
                    />
                  )}
                </span>
              ) : (
                <img
                  src={fileUrl}
                  alt={file.filename}
                  className='max-h-full max-w-full rounded-md object-contain'
                />
              )}
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
                <span className='min-w-[38px] font-mono text-[12px] font-semibold'>0°</span>
                <Mini
                  disabled
                  title={NOT_YET}
                  onClick={() => {}}>
                  ↻ +90°
                </Mini>
                <Mini
                  disabled
                  title={NOT_YET}
                  onClick={() => {}}>
                  ↻ +180°
                </Mini>
              </div>
              <div className='mt-1 text-[12px] text-ink-2'>
                For a camera mounted sideways or upside down.
              </div>
            </Panel>

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
                    const box = cropToPixels(frame, shape.width, shape.height)
                    const stretch = shape.width / box.width
                    return `${box.width}×${box.height} → ${shape.width}×${shape.height}${
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
                      'Applied the next time this file is prepared.'
                    ]
                      .filter(Boolean)
                      .join(' ')}
              </div>
            </Panel>
          </div>
        </div>

        <div className='flex flex-none flex-wrap items-center gap-2.5 border-t border-line px-3.5 py-2.5'>
          {locked && <span className='text-[11.5px] text-ink-2'>🔒 {locked}</span>}
          {video && !locked && (
            <Mini
              disabled={!saved && !dirty}
              onClick={() => {
                onCropChange({ cropStart: null, cropEnd: null })
                /* both halves, because one Reset that left the other behind would be a trap */
                onFrameChange(null)
                onApply({ cropStart: null, cropEnd: null })
              }}>
              Reset crop
            </Mini>
          )}
          {dirty && <span className='text-[11.5px] font-semibold text-local'>Unsaved changes</span>}
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          {video && !locked && (
            <Go
              disabled={!dirty}
              onClick={() => onApply({ cropStart, cropEnd })}>
              Save crop
            </Go>
          )}
        </div>
      </div>
    </div>
  )
}

export { PreviewDrawer }
export type { VideoRef }
