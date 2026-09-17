import { useEffect, useRef, useState } from 'react'
import { Go, Mini } from './buttons'
import { Spacer } from './modal'
import type { ProxyFact } from '@skydock/scripts'
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

const RATIOS = ['None', 'Same', '9:16', '4:5', '1:1', '16:9', 'Free']

const PreviewDrawer = ({
  files,
  index,
  status,
  proxy,
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
  onVideoRef
}: {
  files: ManifestFile[]
  index: number
  /* what the file reads as right now — the same word its row shows */
  status?: string
  /* the server's look at whether this clip has its small copy, and which file to play */
  proxy?: ProxyFact
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
}) => {
  const file = files[index]
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)

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
  const video = isVideoFile(file.filename)
  const from = cropStart ?? 0
  const to = cropEnd ?? duration
  /* what is on screen against what is on the file: the one tells you there is something to save */
  const dirty =
    (cropStart ?? null) !== (file.cropStart ?? null) || (cropEnd ?? null) !== (file.cropEnd ?? null)
  const saved = file.cropStart != null || file.cropEnd != null

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
                <video
                  ref={videoRef}
                  src={fileUrl}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget
                    if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
                  }}
                  className='max-h-full max-w-full rounded-md'
                />
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
                    onCropChange={onCropChange}
                    onApply={onApply}
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
                <div className='mt-1.5 flex flex-wrap gap-1.5'>
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
              <div className='flex flex-wrap gap-1.5'>
                {RATIOS.map((ratio) => (
                  <Mini
                    key={ratio}
                    disabled
                    title={NOT_YET}
                    onClick={() => {}}>
                    {ratio}
                  </Mini>
                ))}
              </div>
              <div className='mt-1 text-[12px] text-ink-2'>
                Drag the frame to move it, a corner to resize.
              </div>
            </Panel>

            <Panel title='On the file'>
              <div className='text-[12px] text-ink-2'>
                {saved
                  ? `Crop saved: ${clock(file.cropStart ?? 0)} – ${clock(file.cropEnd ?? duration)}. It is applied the next time this file is prepared.`
                  : 'No crop — the file goes out as shot.'}
              </div>
            </Panel>
          </div>
        </div>

        <div className='flex flex-none flex-wrap items-center gap-2.5 border-t border-line px-3.5 py-2.5'>
          {video && (
            <Mini
              disabled={!saved && !dirty}
              onClick={() => {
                onCropChange({ cropStart: null, cropEnd: null })
                onApply({ cropStart: null, cropEnd: null })
              }}>
              Reset crop
            </Mini>
          )}
          {dirty && <span className='text-[11.5px] font-semibold text-local'>Unsaved changes</span>}
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          {video && (
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
