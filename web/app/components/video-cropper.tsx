import { useRef } from 'react'

type VideoCropperProps = {
  duration: number
  currentTime: number
  bufferedRanges: Array<{ start: number; end: number }>
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  onSeek: (time: number) => void
  onCommitOffset: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const isBuffered = (time: number, ranges: Array<{ start: number; end: number }>) =>
  ranges.some((r) => time >= r.start && time <= r.end)

const timeFromPosition = (clientX: number, rect: DOMRect, duration: number, zoom: number) => {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
  return clamp((ratio * duration) / clamp(zoom, 1, 5), 0, duration)
}

const VideoCropper = ({
  duration,
  currentTime,
  bufferedRanges,
  cropStart,
  cropEnd,
  zoom,
  onSeek,
  onCommitOffset,
  onCropChange,
  onApply,
  onZoomChange
}: VideoCropperProps) => {
  const barRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)

  const seekTo = (time: number) => {
    const t = clamp(time, 0, duration)
    if (isBuffered(t, bufferedRanges)) onSeek(t)
    else onCommitOffset(t)
  }

  const handleBarClick = (e: React.MouseEvent) => {
    const el = barRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const t = timeFromPosition(e.clientX, rect, duration, zoom)
    seekTo(t)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const el = barRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cursorTime = timeFromPosition(e.clientX, rect, duration, zoom)
    const delta = -e.deltaY * 0.001
    const nextZoom = clamp(zoom + delta, 1, 5)
    onZoomChange(nextZoom)
    const nextTime = timeFromPosition(e.clientX, rect, duration, nextZoom)
    const diff = cursorTime - nextTime
    if (Math.abs(diff) > 0.001) seekTo(currentTime + diff)
  }

  const handlePointerDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = which
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dragging = draggingRef.current
    if (!dragging) return
    const el = barRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const t = timeFromPosition(e.clientX, rect, duration, zoom)
    if (dragging === 'start') {
      const next = clamp(t, 0, cropEnd ?? duration)
      onCropChange({ cropStart: next, cropEnd })
    } else {
      const next = clamp(t, cropStart ?? 0, duration)
      onCropChange({ cropStart, cropEnd: next })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = null
  }

  const handleStartHere = () => onCropChange({ cropStart: currentTime, cropEnd })
  const handleEndHere = () => onCropChange({ cropStart, cropEnd: currentTime })
  const handleApply = () => onApply({ cropStart, cropEnd })

  const safeDuration = duration || 1
  const zoomClamped = clamp(zoom, 1, 5)
  const progress = clamp(currentTime / safeDuration, 0, 1) * 100
  const startPct =
    cropStart === null ? null : clamp(cropStart / safeDuration, 0, 1) * 100 * zoomClamped
  const endPct = cropEnd === null ? null : clamp(cropEnd / safeDuration, 0, 1) * 100 * zoomClamped

  return (
    <div
      data-video-cropper='true'
      className='w-full select-none'>
      <div className='flex items-center gap-2 mb-2 text-xs text-gray-500'>
        <span data-zoom-display='true'>{zoomClamped.toFixed(1)}x</span>
        <span data-current-time='true'>{currentTime.toFixed(2)}s</span>
        <span>/</span>
        <span data-duration='true'>{duration.toFixed(2)}s</span>
      </div>
      <div
        ref={barRef}
        data-crop-bar='true'
        onClick={handleBarClick}
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className='relative h-12 bg-gray-100 border border-gray-200 rounded-lg overflow-hidden'
        style={{ width: '100%' }}>
        <div
          data-playhead='true'
          className='absolute top-0 bottom-0 w-0.5 bg-blue-600'
          style={{ left: `${progress}%` }}
        />
        {startPct !== null && (
          <div
            data-crop-start-handle='true'
            onPointerDown={handlePointerDown('start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize'
            style={{ left: `${startPct}%` }}
          />
        )}
        {endPct !== null && (
          <div
            data-crop-end-handle='true'
            onPointerDown={handlePointerDown('end')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize'
            style={{ left: `${endPct}%` }}
          />
        )}
        {startPct !== null && endPct !== null && (
          <div
            data-crop-range='true'
            className='absolute top-0 bottom-0 bg-amber-200/50 border-x border-amber-500'
            style={{
              left: `${Math.min(startPct, endPct)}%`,
              width: `${Math.abs(endPct - startPct)}%`
            }}
          />
        )}
      </div>
      <div className='flex gap-2 mt-3'>
        <button
          type='button'
          data-action='start-here'
          onClick={handleStartHere}
          className='px-3 py-1.5 text-sm bg-gray-100 rounded'>
          Start here
        </button>
        <button
          type='button'
          data-action='end-here'
          onClick={handleEndHere}
          className='px-3 py-1.5 text-sm bg-gray-100 rounded'>
          End here
        </button>
        <button
          type='button'
          data-action='apply'
          onClick={handleApply}
          className='px-3 py-1.5 text-sm bg-blue-600 text-white rounded'>
          Apply
        </button>
      </div>
    </div>
  )
}

export { VideoCropper }
export type { VideoCropperProps }
