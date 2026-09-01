import { useEffect, useRef, useState } from 'react'
import { useFetcher, useRevalidator } from 'react-router'

type VideoCropperProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  duration: number
  filePath: string
  filmstripDir?: string
  keyframes?: number[]
  initialCropStart?: number
  initialCropEnd?: number
  onApplied?: () => void
}

const VideoCropper = ({
  videoRef,
  duration,
  filePath,
  filmstripDir,
  keyframes,
  initialCropStart,
  initialCropEnd,
  onApplied
}: VideoCropperProps) => {
  const [currentTime, setCurrentTime] = useState(0)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [cropStartOverride, setCropStartOverride] = useState<number | undefined>(
    initialCropStart ?? undefined
  )
  const [cropEndOverride, setCropEndOverride] = useState<number | undefined>(
    initialCropEnd ?? undefined
  )
  const cropStart = cropStartOverride ?? 0
  const cropEnd = cropEndOverride ?? duration
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewOffset, setViewOffset] = useState(0.5)
  const timelineRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const cropFetcher = useFetcher()
  const { revalidate } = useRevalidator()

  useEffect(() => {
    if (cropFetcher.state === 'idle' && cropFetcher.data) {
      revalidate()
      onApplied?.()
    }
  }, [cropFetcher.state, cropFetcher.data, revalidate, onApplied])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const tick = () => {
      if (!dragging) setCurrentTime(vid.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [videoRef, filePath, duration, dragging])

  const visibleDuration = duration / zoomLevel
  const viewStart = Math.max(
    0,
    Math.min(duration - visibleDuration, viewOffset * duration - visibleDuration / 2)
  )
  const viewEnd = Math.min(duration, viewStart + visibleDuration)

  const snapToKeyframe = (t: number): number => {
    if (!keyframes || keyframes.length === 0) return t
    let best = keyframes[0]
    let bestDist = Math.abs(t - best)
    for (const k of keyframes) {
      const d = Math.abs(t - k)
      if (d < bestDist) {
        bestDist = d
        best = k
      }
    }
    return bestDist < 0.5 ? best : t
  }

  const seekTo = (time: number) => {
    const vid = videoRef.current
    if (!vid) return
    const clamped = Math.max(0, Math.min(time, duration))
    vid.currentTime = clamped
    setCurrentTime(clamped)
  }

  const timeFromX = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return viewStart + ratio * (viewEnd - viewStart)
  }

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const hoverTime = viewStart + ratio * (viewEnd - viewStart)
      const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const newZoom = Math.max(1, Math.min(50, zoomLevel * zoomFactor))
      const newVisibleDuration = duration / newZoom
      const newViewStart = Math.max(
        0,
        Math.min(duration - newVisibleDuration, hoverTime - ratio * newVisibleDuration)
      )
      const newViewOffset = (newViewStart + newVisibleDuration / 2) / duration
      setZoomLevel(newZoom)
      setViewOffset(newViewOffset)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [duration, zoomLevel, viewStart, viewEnd])

  const formatTimeCode = (t: number) => {
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60)
    const f = Math.floor((t % 1) * 30)
    if (h > 0)
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
  }

  const handlePointerDown = (
    e: React.PointerEvent,
    target: 'start' | 'end' | 'playhead' | 'timeline'
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const vid = videoRef.current
    if (vid && !vid.paused) vid.pause()
    const time = timeFromX(e.clientX)
    const snapped = snapToKeyframe(time)
    if (target === 'timeline') {
      if (filmstripDir) setScrubTime(snapped)
      else seekTo(snapped)
      setDragging('playhead')
    } else {
      if (filmstripDir && (target === 'start' || target === 'end')) setScrubTime(snapped)
      setDragging(target)
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const time = timeFromX(e.clientX)
    const snapped = snapToKeyframe(time)
    if (dragging === 'start') {
      const clamped = Math.min(snapped, cropEnd - 0.1)
      setCropStartOverride(Math.max(0, clamped))
      if (filmstripDir) setScrubTime(snapped)
    } else if (dragging === 'end') {
      const clamped = Math.max(snapped, cropStart + 0.1)
      setCropEndOverride(Math.min(duration, clamped))
      if (filmstripDir) setScrubTime(snapped)
    } else if (dragging === 'playhead') {
      if (filmstripDir) setScrubTime(snapped)
      else seekTo(snapped)
    }
  }

  const handlePointerUp = () => {
    if (dragging === 'playhead' && scrubTime !== null) {
      seekTo(snapToKeyframe(scrubTime))
    }
    if ((dragging === 'start' || dragging === 'end') && scrubTime !== null) {
      seekTo(snapToKeyframe(scrubTime))
    }
    setDragging(null)
    setScrubTime(null)
  }

  const toPct = (time: number) => {
    if (viewEnd === viewStart) return 0
    return ((time - viewStart) / (viewEnd - viewStart)) * 100
  }

  const startPct = toPct(cropStart)
  const endPct = toPct(cropEnd)
  const displayTime = scrubTime ?? currentTime
  const playheadPct = toPct(displayTime)

  const clipStart = Math.max(0, startPct)
  const clipEnd = Math.min(100, endPct)

  const scrubFrame = filmstripDir && scrubTime !== null ? Math.floor(scrubTime * 1) + 1 : null
  const scrubSrc =
    filmstripDir && scrubFrame !== null
      ? `/api/file?path=${encodeURIComponent(`${filmstripDir}/${String(scrubFrame).padStart(4, '0')}.jpg`)}`
      : null

  return (
    <div className='w-full px-1 select-none'>
      <div className='flex items-center justify-between text-[10px] text-gray-400 mb-1 px-0.5'>
        <span>{formatTimeCode(cropStart)}</span>
        <div className='flex items-center gap-2'>
          <span className='text-gray-500'>Crop: {formatTimeCode(cropEnd - cropStart)}</span>
          {filmstripDir && (
            <span className='text-[9px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'>
              filmstrip
            </span>
          )}
          {zoomLevel > 1 && (
            <button
              type='button'
              onClick={() => {
                setZoomLevel(1)
                setViewOffset(0.5)
              }}
              className='text-[9px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'>
              Reset zoom
            </button>
          )}
        </div>
        <span>{formatTimeCode(cropEnd)}</span>
      </div>
      {scrubSrc && dragging && (
        <div className='flex justify-center mb-1'>
          <div className='relative'>
            <img
              src={scrubSrc}
              alt=''
              className='h-16 w-auto rounded border border-gray-300 dark:border-gray-600 bg-black object-contain'
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <span className='absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] px-1 rounded bg-black/70 text-white'>
              {formatTimeCode(displayTime)}
            </span>
          </div>
        </div>
      )}
      <div
        ref={timelineRef}
        className='relative h-8 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer group'
        onPointerDown={(e) => handlePointerDown(e, 'timeline')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}>
        <div
          className='absolute top-0 bottom-0 bg-gray-300 dark:bg-gray-600'
          style={{ left: 0, width: `${Math.max(0, clipStart)}%` }}
        />
        <div
          className='absolute top-0 bottom-0 bg-blue-200/40 dark:bg-blue-800/30'
          style={{ left: `${clipStart}%`, width: `${Math.max(0, clipEnd - clipStart)}%` }}
        />
        <div
          className='absolute top-0 bottom-0 bg-gray-300 dark:bg-gray-600'
          style={{ left: `${Math.min(100, clipEnd)}%`, right: 0 }}
        />
        <div
          className='absolute top-0 bottom-0 w-0.5 bg-white shadow-sm z-10'
          style={{ left: `${playheadPct}%` }}
        />
        <div
          className='absolute top-1/2 -translate-y-1/2 w-3 h-5 bg-white border border-gray-400 rounded-sm cursor-ew-resize z-20 shadow-sm hover:bg-gray-100'
          style={{ left: `${startPct}%`, transform: 'translate(-50%, -50%)' }}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div
          className='absolute top-1/2 -translate-y-1/2 w-3 h-5 bg-white border border-gray-400 rounded-sm cursor-ew-resize z-20 shadow-sm hover:bg-gray-100'
          style={{ left: `${endPct}%`, transform: 'translate(-50%, -50%)' }}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className='flex items-center justify-center gap-2 mt-2'>
        <button
          type='button'
          onClick={() => {
            const vid = videoRef.current
            if (vid && !vid.paused) vid.pause()
            const t = snapToKeyframe(currentTime)
            setCropStartOverride(t)
            seekTo(t)
          }}
          className='text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'>
          Start here
        </button>
        <button
          type='button'
          onClick={() => {
            const vid = videoRef.current
            if (vid && !vid.paused) vid.pause()
            const t = snapToKeyframe(currentTime)
            setCropEndOverride(t)
            seekTo(t)
          }}
          className='text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'>
          End here
        </button>
        <button
          type='button'
          onClick={() => {
            const snappedStart = snapToKeyframe(cropStart)
            const snappedEnd = snapToKeyframe(cropEnd)
            cropFetcher.submit(
              { action: 'set-crop', filePath, cropStart: snappedStart, cropEnd: snappedEnd },
              { method: 'POST', encType: 'application/json', action: '/api/manifest' }
            )
          }}
          disabled={cropFetcher.state !== 'idle'}
          className='text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'>
          Apply
        </button>
      </div>
    </div>
  )
}

export { VideoCropper }
