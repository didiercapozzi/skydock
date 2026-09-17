import { useEffect, useRef, useState } from 'react'

type VideoCropperProps = {
  duration: number
  currentTime: number
  bufferedRanges?: Array<{ start: number; end: number }>
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  readOnly?: boolean
  /* inside the preview the trim readouts and the buttons live in the side panel and the footer, so
     the timeline shows only the timeline and nothing is offered twice */
  compact?: boolean
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
  compact = false,
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
  const hasCrop = cropStart !== null || cropEnd !== null
  const handleResetCrop = () => {
    onCropChange({ cropStart: null, cropEnd: null })
    onApply({ cropStart: null, cropEnd: null })
  }

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
      {/* the cropper sits on the dark stage, so its own controls are lit from the same side */}
      <div className='mb-2 flex items-center gap-2.5 font-mono text-[11.5px] text-white/70 tabular-nums'>
        <span data-zoom-display='true'>{zoomClamped.toFixed(1)}x</span>
        {zoomClamped !== 1 && (
          <button
            type='button'
            data-action='reset-zoom'
            onClick={handleBarResetZoom}
            className='rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[11.5px] text-white hover:bg-white/20'>
            Reset
          </button>
        )}
        {!compact && (
          <>
            <span data-current-time='true'>{currentTime.toFixed(2)}s</span>
            <span>/</span>
            <span data-duration='true'>{safeDuration.toFixed(2)}s</span>
          </>
        )}
      </div>
      <div
        ref={barRef}
        data-crop-bar='true'
        onPointerDown={handleBarDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className='relative h-12 cursor-crosshair overflow-hidden rounded-md border border-white/20 bg-white/[0.08]'>
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
          <div className='pointer-events-none absolute top-0 bottom-0 left-1/2 -ml-px w-0.5 bg-white' />
        </div>
        {!readOnly && startPct !== null && (
          <div
            data-crop-start-handle='true'
            onPointerDown={handleCropHandleDown('start')}
            className='absolute top-0 bottom-0 z-20 -ml-1.5 w-3 cursor-ew-resize rounded bg-accent hover:brightness-110'
            style={{ left: `${startPct}%` }}
          />
        )}
        {!readOnly && endPct !== null && (
          <div
            data-crop-end-handle='true'
            onPointerDown={handleCropHandleDown('end')}
            className='absolute top-0 bottom-0 z-20 -ml-1.5 w-3 cursor-ew-resize rounded bg-accent hover:brightness-110'
            style={{ left: `${endPct}%` }}
          />
        )}
        {!readOnly && startPct !== null && endPct !== null && (
          <div
            data-crop-range='true'
            className='absolute top-0 bottom-0 border-x border-accent bg-accent/30'
            style={{
              left: `${Math.min(startPct, endPct)}%`,
              width: `${Math.abs(endPct - startPct)}%`
            }}
          />
        )}
      </div>
      {!readOnly && !compact && (
        <div className='mt-3 flex flex-wrap gap-2'>
          <button
            type='button'
            data-action='start-here'
            onClick={handleStartHere}
            className='rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20'>
            Start here
          </button>
          <button
            type='button'
            data-action='end-here'
            onClick={handleEndHere}
            className='rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20'>
            End here
          </button>
          <button
            type='button'
            data-action='apply'
            onClick={handleApply}
            className='rounded-[5px] border border-accent bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:brightness-110'>
            Apply
          </button>
          {hasCrop && (
            <button
              type='button'
              data-action='reset-crop'
              onClick={handleResetCrop}
              className='rounded-[5px] border border-white/30 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20'>
              Reset crop
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { VideoCropper }
export type { VideoCropperProps }
