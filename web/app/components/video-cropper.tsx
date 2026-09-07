import { useEffect, useRef, useState } from 'react'

type VideoCropperProps = {
  duration: number
  currentTime: number
  bufferedRanges: Array<{ start: number; end: number }>
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  readOnly?: boolean
  thumbSrc?: (seekSeconds: number) => string
  onSeek: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
}

const THUMB_COUNT = 8

const MAX_ZOOM = 10

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const VideoCropper = ({
  duration,
  currentTime,
  cropStart,
  cropEnd,
  zoom,
  readOnly = false,
  thumbSrc,
  onSeek,
  onCropChange,
  onApply,
  onZoomChange
}: VideoCropperProps) => {
  const barRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef<'start' | 'end' | 'playhead' | null>(null)
  const [viewOffset, setViewOffset] = useState(0)

  const safeDuration = duration || 1
  const zoomClamped = clamp(zoom, 1, MAX_ZOOM)
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

  const handleBarResetZoom = () => {
    draggingRef.current = null
    setViewOffset(0)
    onZoomChange(1)
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

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cursorTime = offset + clamp((e.clientX - rect.left) / rect.width, 0, 1) * vd
      const deltaY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const nextZoom = clamp(zoomClamped * Math.exp(-deltaY * 0.002), 1, MAX_ZOOM)
      const nextVd = safeDuration / nextZoom
      const nextMax = Math.max(0, safeDuration - nextVd)
      const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
      const nextOffset = clamp(cursorTime - ratio * nextVd, 0, nextMax)
      setViewOffset(nextOffset)
      onZoomChange(nextZoom)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [offset, vd, zoomClamped, safeDuration, onZoomChange])

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

  const thumbs =
    thumbSrc && safeDuration > 0
      ? Array.from({ length: THUMB_COUNT }, (_, i) => {
          const t = offset + ((i + 0.5) / THUMB_COUNT) * vd
          const rounded = Math.round(t * 2) / 2
          return { key: i, src: thumbSrc(rounded) }
        })
      : []

  return (
    <div
      data-video-cropper='true'
      className='w-full select-none'>
      <div className='flex items-center gap-2 mb-2 text-xs text-gray-500'>
        <span data-zoom-display='true'>{zoomClamped.toFixed(1)}x</span>
        {zoomClamped !== 1 && (
          <button
            type='button'
            data-action='reset-zoom'
            onClick={handleBarResetZoom}
            className='px-1.5 py-0.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors'>
            Reset
          </button>
        )}
        <span data-current-time='true'>{currentTime.toFixed(2)}s</span>
        <span>/</span>
        <span data-duration='true'>{safeDuration.toFixed(2)}s</span>
      </div>
      <div
        ref={barRef}
        data-crop-bar='true'
        onPointerDown={handleBarDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className='relative h-12 bg-gray-100 border border-gray-200 rounded-lg overflow-hidden cursor-crosshair'>
        {thumbs.length > 0 && (
          <div
            data-thumbs='true'
            className='absolute inset-0 flex pointer-events-none'>
            {thumbs.map((thumb) => (
              <img
                key={thumb.key}
                data-thumb='true'
                src={thumb.src}
                alt=''
                draggable={false}
                decoding='async'
                className='h-full object-cover pointer-events-none'
                style={{ width: `${100 / THUMB_COUNT}%` }}
              />
            ))}
          </div>
        )}
        <div
          data-playhead='true'
          className='absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-30 pointer-events-none'
          style={{ left: `${playheadPct}%` }}>
          <div className='absolute left-1/2 top-0 bottom-0 w-0.5 -ml-px bg-blue-600 pointer-events-none' />
        </div>
        {!readOnly && startPct !== null && (
          <div
            data-crop-start-handle='true'
            onPointerDown={handleCropHandleDown('start')}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize z-20 hover:bg-amber-600 transition-colors'
            style={{ left: `${startPct}%` }}
          />
        )}
        {!readOnly && endPct !== null && (
          <div
            data-crop-end-handle='true'
            onPointerDown={handleCropHandleDown('end')}
            className='absolute top-0 bottom-0 w-3 -ml-1.5 bg-amber-500 rounded cursor-ew-resize z-20 hover:bg-amber-600 transition-colors'
            style={{ left: `${endPct}%` }}
          />
        )}
        {!readOnly && startPct !== null && endPct !== null && (
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
      {!readOnly && (
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
      )}
    </div>
  )
}

export { VideoCropper }
export type { VideoCropperProps }
