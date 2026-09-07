import { useRef, useState } from 'react'

type VideoCropperProps = {
  duration: number
  currentTime: number
  bufferedRanges: Array<{ start: number; end: number }>
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  onSeek: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const VideoCropper = ({
  duration,
  currentTime,
  cropStart,
  cropEnd,
  zoom,
  onSeek,
  onCropChange,
  onApply,
  onZoomChange
}: VideoCropperProps) => {
  const barRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef<'start' | 'end' | 'playhead' | null>(null)
  const [viewOffset, setViewOffset] = useState(0)

  const safeDuration = duration || 1
  const zoomClamped = clamp(zoom, 1, 5)
  const visibleDuration = safeDuration / zoomClamped
  const maxOffset = Math.max(0, safeDuration - visibleDuration)

  const clampOffset = (offset: number) => clamp(offset, 0, maxOffset)

  const computeVisibleRange = (offset: number) => {
    let clamped = clampOffset(offset)
    if (visibleDuration >= safeDuration) {
      clamped = 0
    } else if (currentTime < clamped) {
      clamped = currentTime
    } else if (currentTime > clamped + visibleDuration) {
      clamped = currentTime - visibleDuration
    }
    clamped = clampOffset(clamped)
    return { offset: clamped, visibleDuration }
  }

  const { offset, visibleDuration: vd } = computeVisibleRange(viewOffset)

  const timeFromPosition = (clientX: number) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return offset + ratio * vd
  }

  const positionFromTime = (time: number) => clamp((time - offset) / vd, 0, 1) * 100

  const seekTo = (time: number) => {
    const t = clamp(time, 0, safeDuration)
    onSeek(t)
  }

  const handleBarDown = (e: React.PointerEvent) => {
    if (draggingRef.current) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = 'playhead'
    const t = timeFromPosition(e.clientX)
    seekTo(t)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const el = barRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cursorTime = offset + clamp((e.clientX - rect.left) / rect.width, 0, 1) * vd
    const delta = -e.deltaY * 0.001
    const nextZoom = clamp(zoomClamped + delta, 1, 5)
    const nextVd = safeDuration / nextZoom
    const nextMax = Math.max(0, safeDuration - nextVd)
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const nextOffset = clamp(cursorTime - ratio * nextVd, 0, nextMax)
    setViewOffset(nextOffset)
    onZoomChange(nextZoom)
  }

  const handleCropHandleDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = which
    e.preventDefault()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dragging = draggingRef.current
    if (!dragging) return
    const t = timeFromPosition(e.clientX)
    seekTo(t)
    if (dragging === 'start') {
      onCropChange({ cropStart: clamp(t, 0, cropEnd ?? safeDuration), cropEnd })
    } else if (dragging === 'end') {
      onCropChange({ cropStart, cropEnd: clamp(t, cropStart ?? 0, safeDuration) })
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

  const playheadPct = positionFromTime(currentTime)
  const startPct = cropStart === null ? null : positionFromTime(cropStart)
  const endPct = cropEnd === null ? null : positionFromTime(cropEnd)

  return (
    <div
      data-video-cropper='true'
      className='w-full select-none'>
      <div className='flex items-center gap-2 mb-2 text-xs text-gray-500'>
        <span data-zoom-display='true'>{zoomClamped.toFixed(1)}x</span>
        <span data-current-time='true'>{currentTime.toFixed(2)}s</span>
        <span>/</span>
        <span data-duration='true'>{safeDuration.toFixed(2)}s</span>
      </div>
      <div
        ref={barRef}
        data-crop-bar='true'
        onPointerDown={handleBarDown}
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className='relative h-12 bg-gray-100 border border-gray-200 rounded-lg overflow-hidden cursor-crosshair'>
        <div
          data-playhead='true'
          className='absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-30 pointer-events-none'
          style={{ left: `${playheadPct}%` }}>
          <div className='absolute left-1/2 top-0 bottom-0 w-0.5 -ml-px bg-blue-600 pointer-events-none' />
        </div>
        {startPct !== null && (
          <div
            data-crop-start-handle='true'
            onPointerDown={handleCropHandleDown('start')}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize z-20 hover:bg-amber-600 transition-colors'
            style={{ left: `${startPct}%` }}
          />
        )}
        {endPct !== null && (
          <div
            data-crop-end-handle='true'
            onPointerDown={handleCropHandleDown('end')}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize z-20 hover:bg-amber-600 transition-colors'
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
          className='px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200 transition-colors'>
          Start here
        </button>
        <button
          type='button'
          data-action='end-here'
          onClick={handleEndHere}
          className='px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200 transition-colors'>
          End here
        </button>
        <button
          type='button'
          data-action='apply'
          onClick={handleApply}
          className='px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors'>
          Apply
        </button>
      </div>
    </div>
  )
}

export { VideoCropper }
export type { VideoCropperProps }
