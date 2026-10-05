import { t } from '@lingui/core/macro'
import { MOMENTS } from '@skydock/scripts'
import type { Moment } from '@skydock/scripts'
import { clamp, MAX_ZOOM, slidView, zoomedView } from '../helpers/zoomView'
import { useEffect, useRef, useState } from 'react'
import { Go, Mini } from './buttons'

/* The moments of the jump, in seconds: what the camera measured, or what somebody moved it to. */

type Moments = Partial<Record<Moment, number>>

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
  /* where the jump is in this clip; absent when nothing found it */
  moments?: Moments | null
  /* Given, the marks can be dragged: this is where the music will start, so it is never beyond
     argument. Not given, they are shown and left alone. */
  onMomentChange?: (which: Moment, seconds: number) => void
  onSeek: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
  /* where the shown stretch starts, when whoever draws the graph under it holds that too, so that either
     can zoom or slide it and the other follows */
  /* the graph sits directly under the bar, joined to it: the bar's bottom corners are square */
  joined?: boolean
  /* the playhead's time at which the shown stretch was last moved or zoomed by hand: until the playhead
     moves again the stretch stays where it was put, rather than being pulled back to the playhead */
  freeAt?: number | null
  onFree?: (at: number) => void
  viewOffset?: number
  onViewOffset?: (offset: number) => void
  /* the stretch of the clip the bar shows now, so what is drawn beside it can show the same stretch */
  onView?: (view: { from: number; span: number }) => void
}

const THUMB_COUNT = 8

/* The opening and the canopy are two ends of one thing and sit three or four seconds apart, which on
   a three-minute bar is a few pixels: their labels are hung low so the pair can both be read. */
const HUNG_LOW: Record<Moment, boolean> = {
  exit: false,
  opening: true,
  canopy: false,
  landing: true
}

const VideoCropper = ({
  duration,
  currentTime,
  cropStart,
  cropEnd,
  zoom,
  readOnly = false,
  compact = false,
  thumbSrc,
  moments,
  onMomentChange,
  onSeek,
  onCropChange,
  onApply,
  onZoomChange,
  joined = false,
  freeAt: heldFree,
  onFree,
  viewOffset: heldOffset,
  onViewOffset,
  onView
}: VideoCropperProps) => {
  const barRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef<'start' | 'end' | 'playhead' | 'slide' | Moment | null>(null)
  /* where a slide began: the pointer and the start of the stretch then */
  const slidFrom = useRef<{ x: number; offset: number } | null>(null)
  /* the shown stretch keeps the playhead in view while it moves — and lets go of it while somebody is
     sliding the stretch away to look elsewhere, until the playhead moves again */
  const [ownFree, setOwnFree] = useState<number | null>(null)
  const slidAt = heldFree === undefined ? ownFree : heldFree
  const setSlidAt = onFree ?? setOwnFree
  const following = slidAt === null || slidAt !== currentTime
  const [ownOffset, setOwnOffset] = useState(0)
  const viewOffset = heldOffset ?? ownOffset
  const setViewOffset = onViewOffset ?? setOwnOffset

  const safeDuration = duration || 1
  const zoomClamped = clamp(zoom, 1, MAX_ZOOM)
  const visibleDuration = safeDuration / zoomClamped
  const maxOffset = Math.max(0, safeDuration - visibleDuration)

  const clampOffset = (offset: number) => clamp(offset, 0, maxOffset)

  const computeVisibleRange = (offset: number) => {
    let clamped = clampOffset(offset)
    if (visibleDuration >= safeDuration) {
      clamped = 0
    } else if (!following) {
      /* slid away on purpose: where it was put stays */
    } else if (currentTime < clamped) {
      clamped = currentTime
    } else if (currentTime > clamped + visibleDuration) {
      clamped = currentTime - visibleDuration
    }
    clamped = clampOffset(clamped)
    return { offset: clamped, visibleDuration }
  }

  const { offset, visibleDuration: vd } = computeVisibleRange(viewOffset)
  useEffect(() => {
    onView?.({ from: offset, span: vd })
  }, [offset, vd, onView])

  const timeFromPosition = (clientX: number) => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return offset + ratio * vd
  }

  const positionFromTime = (time: number) => clamp((time - offset) / vd, 0, 1) * 100

  const seekTo = (time: number) => {
    onSeek(clamp(time, 0, safeDuration))
  }

  const handleBarResetZoom = () => {
    draggingRef.current = null
    setViewOffset(0)
    onZoomChange(1)
  }

  const handleBarDown = (e: React.PointerEvent) => {
    if (draggingRef.current) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    /* ctrl held, a drag slides the shown stretch along the clip instead of moving the playhead */
    if (e.ctrlKey || e.metaKey) {
      draggingRef.current = 'slide'
      slidFrom.current = { x: e.clientX, offset }
      return
    }
    draggingRef.current = 'playhead'
    seekTo(timeFromPosition(e.clientX))
  }

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const deltaY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const next = zoomedView({
        duration: safeDuration,
        zoom: zoomClamped,
        offset,
        ratio: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        deltaY
      })
      /* zoomed where the pointer is, and left there: the stretch does not run back to the playhead */
      setSlidAt(currentTime)
      setViewOffset(next.offset)
      onZoomChange(next.zoom)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [offset, vd, zoomClamped, safeDuration, onZoomChange, setViewOffset, setSlidAt, currentTime])

  const handleMomentDown = (which: Moment) => (e: React.PointerEvent) => {
    if (!onMomentChange) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = which
    e.preventDefault()
    e.stopPropagation()
    seekTo(timeFromPosition(e.clientX))
  }

  const handleCropHandleDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = which
    e.preventDefault()
    /* pressing an end shows the frame under it — and a handle resting on the bar's edge must not
       stop a click there from reaching the clip's first or last moment */
    seekTo(timeFromPosition(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dragging = draggingRef.current
    if (!dragging) return
    if (dragging === 'slide') {
      const from = slidFrom.current
      const width = barRef.current?.getBoundingClientRect().width
      if (!from || !width) return
      setSlidAt(currentTime)
      setViewOffset(
        slidView({
          duration: safeDuration,
          zoom: zoomClamped,
          offset: from.offset,
          dx: e.clientX - from.x,
          width
        })
      )
      return
    }
    const time = timeFromPosition(e.clientX)
    seekTo(time)
    if (dragging === 'start') {
      onCropChange({
        cropStart: clamp(time, 0, cropEnd ?? safeDuration),
        cropEnd
      })
    } else if (dragging === 'end') {
      onCropChange({
        cropStart,
        cropEnd: clamp(time, cropStart ?? 0, safeDuration)
      })
    } else if (dragging !== 'playhead') {
      onMomentChange?.(dragging, clamp(time, 0, safeDuration))
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    draggingRef.current = null
    slidFrom.current = null
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
  /* the stretches cut away — positions are already held to the bar, so zoomed in an end that sits
     off the edge simply dims all or none of that side */
  const keptFrom =
    startPct === null ? null : endPct === null ? startPct : Math.min(startPct, endPct)
  const keptTo = endPct === null ? null : startPct === null ? endPct : Math.max(startPct, endPct)
  const cut = [
    ...(keptFrom !== null && keptFrom > 0 ? [['before', 0, keptFrom] as const] : []),
    ...(keptTo !== null && keptTo < 100 ? [['after', keptTo, 100] as const] : [])
  ]

  const thumbs =
    thumbSrc && safeDuration > 0
      ? Array.from({ length: THUMB_COUNT }, (_, i) => {
          const time = offset + ((i + 0.5) / THUMB_COUNT) * vd
          const rounded = Math.round(time * 2) / 2
          return { key: i, src: thumbSrc(rounded) }
        })
      : []

  return (
    <div
      data-video-cropper='true'
      className='w-full select-none'>
      <div className='mb-1.5 flex items-center gap-2.5 font-mono text-micro text-ink-3 tabular-nums'>
        <span data-zoom-display='true'>
          {/* a hair of zoom is still zoom: said to the hundredth until it is plain */}
          {zoomClamped.toFixed(zoomClamped < 2 ? 2 : 1)}x
        </span>
        {zoomClamped !== 1 && (
          <button
            type='button'
            data-action='reset-zoom'
            onClick={handleBarResetZoom}
            className='rounded-chip bg-well px-2 font-sans text-micro leading-5 font-semibold text-ink-2 hover:bg-line hover:text-ink'>
            {t`Reset`}
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
        /* a drag the browser takes back — a lost capture, a gesture — ends like one let go */
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={() => {
          draggingRef.current = null
        }}
        className={`relative h-12 cursor-crosshair overflow-hidden bg-well ${joined ? 'rounded-t-control' : 'rounded-control'}`}>
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
        {/* Where the jump is: the door, the canopy, the ground. Drawn on the timeline rather than
            written beside it, because their whole use is being seen against the footage — and
            dragged, since the exit is where the music will start and the camera is not always right.
            Above the trim's dimming, so a mark in a cut stretch is still visible. */}
        {(duration > 0 ? MOMENTS : [])
          .flatMap(({ which, name: label }) => {
            const at = moments?.[which]
            return at === undefined ? [] : [{ which, label, low: HUNG_LOW[which], at }]
          })
          .map(({ which, label, low, at }) => {
            const seconds = at.toFixed(1)
            return (
              <div
                key={which}
                data-moment={which}
                onPointerDown={handleMomentDown(which)}
                title={
                  onMomentChange
                    ? t`${label} — ${seconds}s, drag to correct`
                    : t`${label} — ${seconds}s`
                }
                className={`absolute top-0 bottom-0 z-20 w-3 -ml-1.5 ${
                  onMomentChange ? 'cursor-ew-resize' : 'pointer-events-none'
                }`}
                style={{ left: `${positionFromTime(at)}%` }}>
                <div className='pointer-events-none absolute top-0 bottom-0 left-1/2 -ml-px w-0.5 bg-ink' />
                <span
                  className={`pointer-events-none absolute rounded-bar bg-ink px-1 font-mono text-micro leading-3.5 font-medium tracking-eyebrow text-pane whitespace-nowrap uppercase ${
                    /* a mark near the end of the bar is named on its left, where there is room, rather
                       than cut off by the edge */
                    positionFromTime(at) > 88 ? 'right-1.5' : 'left-1.5'
                  } ${low ? 'bottom-0.5' : 'top-0.5'}`}>
                  {label}
                </span>
              </div>
            )
          })}
        <div
          data-playhead='true'
          className='absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-30 pointer-events-none'
          style={{ left: `${playheadPct}%` }}>
          <div className='pointer-events-none absolute top-0 bottom-0 left-1/2 -ml-px w-0.5 bg-accent' />
        </div>
        {/* Both ends are always there to grab, sitting at the clip's own start and end until they
            are moved — a trim is a drag from the edge, not a button to find first. One not yet set is
            drawn fainter, since standing at the edge it cuts nothing. */}
        {!readOnly &&
          (
            [
              ['start', startPct ?? positionFromTime(0)],
              ['end', endPct ?? positionFromTime(safeDuration)]
            ] as const
          ).map(([which, pct]) => {
            const set = (which === 'start' ? startPct : endPct) !== null
            return (
              <div
                key={which}
                {...(which === 'start'
                  ? { 'data-crop-start-handle': 'true' }
                  : { 'data-crop-end-handle': 'true' })}
                data-set={set}
                onPointerDown={handleCropHandleDown(which)}
                title={
                  set
                    ? undefined
                    : which === 'start'
                      ? t`Drag to trim the start`
                      : t`Drag to trim the end`
                }
                className={`absolute top-0 bottom-0 z-20 w-3 cursor-ew-resize rounded-bar border-2 border-accent bg-pane hover:bg-accent-soft ${
                  set ? '' : 'opacity-60 hover:opacity-100'
                }`}
                /* centred on its moment, but never half off the bar at either edge */
                style={{
                  left: `clamp(0px, calc(${pct}% - 6px), calc(100% - 12px))`
                }}
              />
            )
          })}
        {/* What the trim throws away, shown going: everything before the start and after the end is
            dimmed and blurred, each side as soon as its own end is set, so the part that stays is the
            only part left sharp. Shown read-only too — it is what the file will be, not a control. */}
        {cut.map(([side, from, to]) => (
          <div
            key={side}
            data-crop-cut={side}
            className='pointer-events-none absolute top-0 bottom-0 z-10 bg-black/55 backdrop-blur-[3px] backdrop-grayscale'
            style={{ left: `${from}%`, width: `${to - from}%` }}
          />
        ))}
        {!readOnly && startPct !== null && endPct !== null && (
          <div
            data-crop-range='true'
            className='pointer-events-none absolute top-0 bottom-0 border-x border-accent'
            style={{
              left: `${Math.min(startPct, endPct)}%`,
              width: `${Math.abs(endPct - startPct)}%`
            }}
          />
        )}
      </div>
      {!readOnly && !compact && (
        <div className='mt-2.5 flex flex-wrap gap-1.5'>
          <Mini onClick={handleStartHere}>{t`Start here`}</Mini>
          <Mini onClick={handleEndHere}>{t`End here`}</Mini>
          <Go onClick={handleApply}>{t`Apply`}</Go>
          {hasCrop && <Mini onClick={handleResetCrop}>{t`Reset trim`}</Mini>}
        </div>
      )}
    </div>
  )
}

export { VideoCropper }
