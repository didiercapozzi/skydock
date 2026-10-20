import { t } from '@lingui/core/macro'
import {
  clipLength,
  fadeInOf,
  fadeInto,
  fadeOutOf,
  heardSpans,
  layerFadesOf,
  musicFadesOf,
  musicLevelAt,
  speedOf,
  SLOT,
  textFadesOf
} from '@skydock/scripts/client'
import type { EditClip, EditSource, FilmEdit, MusicSource } from '@skydock/scripts/client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  clockOf,
  FADE,
  fadeMost,
  groupOf,
  layerRows,
  moveClip,
  nearestBoundary,
  placeClip,
  setItemFade,
  shiftItems,
  placed,
  setFade,
  snapPoints,
  snapTo,
  timelineEnd,
  trimClip,
  unturnedFrame,
  zoomAround
} from '../helpers/filmTimeline'
import type { Selected } from '../helpers/filmTimeline'
import { Icon } from './icons'
import { getThumbUrl } from './utils'

type Picked = { kind: 'clip' | 'music' | 'text' | 'layer'; id: string } | null

const ZOOM = { min: 2, max: 80 }
const WHEEL_ZOOM = 0.0015
const LINE = 16
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120]
const TICK_ROOM = 70
const ENVELOPE_STEP = 0.25
const SHORTEST_TEXT = 0.5
const SHORTEST_MUSIC = 1
const DOUBLE_CLICK = 350
const SNAP_REACH = 8
const CLIP_DRAG = 'skydock/clip'

const markName = (which: 'exit' | 'opening' | 'canopy' | 'landing') =>
  which === 'exit'
    ? t`Exit`
    : which === 'opening'
      ? t`Opening`
      : which === 'canopy'
        ? t`Canopy`
        : t`Landing`

const HEAD = 150

const stepFor = (pps: number) => STEPS.find((step) => step * pps >= TICK_ROOM) ?? 300

const Lane = ({
  name,
  tag,
  note,
  height,
  children
}: {
  name: string
  tag: string
  note?: string
  height: string
  children: React.ReactNode
}) => (
  <div className={`flex ${height} border-b border-line`}>
    <span
      style={{ width: HEAD }}
      className='sticky left-0 z-10 flex flex-none flex-col justify-center gap-px border-r border-line bg-pane px-2.5'>
      <span className='flex items-center gap-1.5 text-body font-medium'>
        {name}
        <span className='rounded-corner border border-line px-1 font-mono text-micro text-ink-3'>
          {tag}
        </span>
      </span>
      {note && <span className='text-micro text-ink-3'>{note}</span>}
    </span>
    <div className='relative flex-1'>{children}</div>
  </div>
)

const FRAME = 56
const GRIP = 'after:absolute after:inset-y-[30%] after:w-0.5 after:rounded-corner after:bg-accent'

const ring = (chosen: boolean) => (chosen ? 'border-accent shadow-ring' : 'border-line-strong')

const Ramps = ({ fadeIn, fadeOut, pps }: { fadeIn: number; fadeOut: number; pps: number }) => (
  <>
    {fadeIn > 0 && (
      <span
        aria-hidden='true'
        data-fade='in'
        style={{ width: fadeIn * pps, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
        className='pointer-events-none absolute inset-y-0 left-0 bg-scrim'
      />
    )}
    {fadeOut > 0 && (
      <span
        aria-hidden='true'
        data-fade='out'
        style={{ width: fadeOut * pps, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
        className='pointer-events-none absolute inset-y-0 right-0 bg-scrim'
      />
    )}
  </>
)

const thumbLook = (clip: EditClip): React.CSSProperties => {
  const rotation = clip.rotation ?? 0
  const box = clip.frame ? unturnedFrame(clip.frame, rotation) : null
  const view = box
    ? {
        objectViewBox: `inset(${box.y * 100}% ${(1 - box.x - box.width) * 100}% ${(1 - box.y - box.height) * 100}% ${box.x * 100}%)`
      }
    : {}
  return rotation % 180 !== 0
    ? {
        ...view,
        left: '50%',
        top: '50%',
        width: '100cqh',
        height: '100cqw',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`
      }
    : {
        ...view,
        inset: 0,
        width: '100%',
        height: '100%',
        ...(rotation ? { transform: `rotate(${rotation}deg)` } : {})
      }
}

const FadeHandle = ({
  side,
  value,
  pps,
  label,
  chosen,
  onGrab,
  onNudge
}: {
  side: 'in' | 'out'
  value: number
  pps: number
  label: string
  chosen: boolean
  onGrab: (e: React.PointerEvent<HTMLSpanElement>) => void
  onNudge: (seconds: number) => void
}) => (
  <span
    role='slider'
    tabIndex={0}
    aria-label={label}
    aria-valuemin={0}
    aria-valuenow={value}
    aria-valuetext={clockOf(value)}
    onPointerDown={onGrab}
    onKeyDown={(e) => {
      const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (by === 0) return
      e.preventDefault()
      e.stopPropagation()
      onNudge((side === 'in' ? by : -by) * (e.shiftKey ? 1 : 0.1))
    }}
    style={side === 'in' ? { left: value * pps + 6 } : { right: value * pps + 6 }}
    className={`absolute top-0.5 z-5 size-3 cursor-ew-resize touch-none rounded-full border-2 border-accent bg-pane focus-visible:opacity-100 group-hover:opacity-100 ${
      chosen ? 'opacity-100' : 'opacity-0'
    }`}
  />
)

const FilmTimeline = ({
  edit,
  sources,
  music,
  pps,
  at,
  picked,
  also,
  snap,
  ripple,
  onSeek,
  onZoom,
  onPick,
  onAlso,
  onChange,
  onOpenPart,
  onDropClip
}: {
  edit: FilmEdit
  sources: Map<string, EditSource>
  music: Map<string, MusicSource>
  pps: number
  at: number
  picked: Picked
  also: Selected[]
  snap: boolean
  ripple: boolean
  onSeek: (t: number) => void
  onZoom: (pps: number) => void
  onPick: (picked: Picked) => void
  onAlso: (item: Selected | null) => void
  onChange: (edit: FilmEdit) => void
  onOpenPart: (id: string) => void
  onDropClip: (name: string, index: number) => void
}) => {
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [lastDown, setLastDown] = useState<{ id: string; at: number } | null>(null)
  const [room, setRoom] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const asked = useRef<{ pps: number; scroll: number } | null>(null)
  const shown = useRef(pps)
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const apart = useRef(0)
  const dragging = useRef(new Set<number>())
  const cancels = useRef(new Set<() => void>())
  const layers = edit.layers ?? []
  const rows = layerRows(layers)
  const rowCount = Math.max(1, ...[...rows.values()].map((row) => row + 1))
  const textRows = layerRows(edit.texts)
  const textRowCount = Math.max(1, ...[...textRows.values()].map((row) => row + 1))
  const total = timelineEnd(edit)
  const width = Math.max(room - HEAD, total * pps + 240)
  const step = stepFor(pps)
  const ticks = Array.from({ length: Math.floor(width / pps / (step / 2)) + 1 }, (_, i) => i)
  const spans = heardSpans(edit, (clip) => sources.get(clip.name)?.sound === true)

  const zoomBy = (factor: number, clientX: number) => {
    const el = box.current
    if (!el) return
    const from = asked.current?.pps ?? pps
    const to = Math.min(ZOOM.max, Math.max(ZOOM.min, from * factor))
    if (to === from) return
    const anchor = Math.max(0, clientX - el.getBoundingClientRect().left - HEAD)
    asked.current = {
      pps: to,
      scroll: zoomAround(asked.current?.scroll ?? el.scrollLeft, anchor, from, to)
    }
    onZoom(to)
  }

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setRoom(el.clientWidth)
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const playhead = useRef(at)
  useLayoutEffect(() => {
    playhead.current = at
  })

  useLayoutEffect(() => {
    const el = box.current
    if (el)
      el.scrollLeft =
        asked.current?.scroll ??
        zoomAround(
          el.scrollLeft,
          playhead.current * shown.current - el.scrollLeft,
          shown.current,
          pps
        )
    shown.current = pps
  }, [pps])

  useLayoutEffect(() => {
    asked.current = null
  })

  const zoomer = useRef(zoomBy)
  useLayoutEffect(() => {
    zoomer.current = zoomBy
  })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomer.current(Math.exp(-e.deltaY * (e.deltaMode === 1 ? LINE : 1) * WHEEL_ZOOM), e.clientX)
    }
    const forget = () => fingers.current.clear()
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', forget)
    return () => {
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', forget)
    }
  }, [])

  const pinch = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !fingers.current.has(e.pointerId)) return
    const before = fingers.current.get(e.pointerId)!
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.current.size === 1 && !dragging.current.has(e.pointerId) && box.current) {
      box.current.scrollLeft -= e.clientX - before.x
      box.current.scrollTop -= e.clientY - before.y
    }
    if (fingers.current.size !== 2) return
    const [a, b] = [...fingers.current.values()] as [
      { x: number; y: number },
      { x: number; y: number }
    ]
    const gap = Math.hypot(a.x - b.x, a.y - b.y)
    if (apart.current > 0) zoomBy(gap / apart.current, (a.x + b.x) / 2)
    apart.current = gap
  }

  const lift = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId)
    apart.current = 0
  }

  const edgeAt = (original: FilmEdit, value: number, skip?: string) =>
    snap ? snapTo(snapPoints(original, sources, at, skip), value, SNAP_REACH / pps) : value

  const blockAt = (original: FilmEdit, id: string, start: number, length: number) => {
    const head = edgeAt(original, start, id)
    const tail = edgeAt(original, start + length, id) - length
    if (head === start) return tail
    return tail === start || Math.abs(head - start) <= Math.abs(tail - start) ? head : tail
  }

  const timeOf = (e: { clientX: number }, lane: Element) =>
    Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / pps)

  const drag = (
    e: React.PointerEvent<HTMLElement>,
    apply: (seconds: number, original: FilmEdit, ended: boolean, pointer: PointerEvent) => void,
    changes = true
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    const original = edit
    let stopped = fingers.current.size >= 2
    let changed = false
    dragging.current.add(e.pointerId)
    const stop = () => {
      if (!stopped && changes && changed) onChange(original)
      stopped = true
    }
    cancels.current.add(stop)
    const move = (event: PointerEvent) => {
      if (fingers.current.size >= 2) stop()
      if (stopped) return
      changed = true
      apply((event.clientX - x0) / pps, original, false, event)
    }
    const end = () => {
      dragging.current.delete(e.pointerId)
      cancels.current.delete(stop)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', end)
      target.removeEventListener('lostpointercapture', end)
    }
    const up = (event: PointerEvent) => {
      if (fingers.current.size >= 2) stop()
      if (!stopped) apply((event.clientX - x0) / pps, original, true, event)
      end()
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', end)
    target.addEventListener('lostpointercapture', end)
  }

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const lane = e.currentTarget
    onSeek(timeOf(e, lane))
    drag(e, (_, __, ___, pointer) => onSeek(timeOf(pointer, lane)), false)
  }

  const pressClip = (e: React.PointerEvent<HTMLDivElement>, id: string, still?: boolean) => {
    const now = e.timeStamp
    if (!still && lastDown?.id === id && now - lastDown.at < DOUBLE_CLICK) {
      setLastDown(null)
      onOpenPart(id)
      return
    }
    if (e.shiftKey) return onAlso({ kind: 'clip', id })
    onAlso(null)
    setLastDown({ id, at: now })
    onPick({ kind: 'clip', id })
    e.currentTarget.focus({ preventScroll: true })
    let moved = false
    drag(e, (seconds, original) => {
      moved ||= Math.abs(seconds * pps) >= 6
      const here = placed(original).find((one) => one.clip.id === id)
      if (!moved || !here) return
      const want = blockAt(original, id, here.from + seconds, clipLength(here.clip))
      const passed = placed(original).filter(
        (one) => one.index < here.index && (one.from + one.to) / 2 > want
      ).length
      onChange(
        passed > 0
          ? moveClip(original, id, here.index - passed)
          : placeClip(original, id, want, ripple)
      )
    })
  }

  const fadeOfItem = (
    original: FilmEdit,
    kind: 'clips' | 'texts' | 'music' | 'layers',
    id: string,
    side: 'fadeIn' | 'fadeOut'
  ) => {
    if (kind === 'clips') {
      const index = original.clips.findIndex((one) => one.id === id)
      return side === 'fadeIn' ? fadeInOf(original.clips, index) : fadeOutOf(original.clips, index)
    }
    const layer = (original.layers ?? []).find((one) => one.id === id)
    if (kind === 'layers') return layer ? layerFadesOf(layer)[side] : 0
    const text = original.texts.find((one) => one.id === id)
    const piece = original.music.find((one) => one.id === id)
    return kind === 'texts'
      ? text
        ? textFadesOf(text)[side]
        : 0
      : piece
        ? musicFadesOf(piece)[side]
        : 0
  }

  const fadeHandle = (
    kind: 'clips' | 'texts' | 'music' | 'layers',
    id: string,
    side: 'fadeIn' | 'fadeOut',
    name: string,
    chosen: boolean
  ) => (
    <FadeHandle
      side={side === 'fadeIn' ? 'in' : 'out'}
      value={fadeOfItem(edit, kind, id, side)}
      pps={pps}
      label={side === 'fadeIn' ? t`Fade in of ${name}` : t`Fade out of ${name}`}
      chosen={chosen}
      onGrab={(e) => {
        onPick({
          kind:
            kind === 'clips'
              ? 'clip'
              : kind === 'texts'
                ? 'text'
                : kind === 'layers'
                  ? 'layer'
                  : 'music',
          id
        })
        const start = fadeOfItem(edit, kind, id, side)
        drag(e, (seconds, original) =>
          onChange(
            setItemFade(original, kind, id, side, start + (side === 'fadeIn' ? seconds : -seconds))
          )
        )
      }}
      onNudge={(seconds) =>
        onChange(setItemFade(edit, kind, id, side, fadeOfItem(edit, kind, id, side) + seconds))
      }
    />
  )

  const trim = (e: React.PointerEvent<HTMLSpanElement>, id: string, side: 'start' | 'end') => {
    onPick({ kind: 'clip', id })
    drag(e, (seconds, original) => {
      const clip = original.clips.find((one) => one.id === id)
      const source = clip && sources.get(clip.name)
      if (!clip || !source) return
      const value = (side === 'start' ? clip.start : clip.end) + seconds * speedOf(clip)
      const marks = source.marks.map((mark) => mark.at)
      onChange(
        trimClip(
          original,
          id,
          side,
          snap ? snapTo(marks, value, SNAP_REACH / pps) : value,
          source.seconds,
          ripple
        )
      )
    })
  }

  const lit = (kind: Selected['kind'], id: string) =>
    also.some((one) => one.kind === kind && one.id === id) ||
    (picked !== null &&
      (picked.kind === 'text' || picked.kind === 'layer'
        ? groupOf(edit, { kind: picked.kind, id: picked.id }).some(
            (one) => one.kind === kind && one.id === id
          )
        : false))

  const moveText = (e: React.PointerEvent<HTMLElement>, id: string, part: 'body' | 'end') => {
    if (e.shiftKey) return onAlso({ kind: 'text', id })
    onAlso(null)
    onPick({ kind: 'text', id })
    drag(e, (seconds, original) => {
      const text = original.texts.find((one) => one.id === id)
      if (!text) return
      onChange(
        part === 'body'
          ? shiftItems(
              original,
              groupOf(original, { kind: 'text', id }),
              Math.max(0, blockAt(original, id, text.at + seconds, text.seconds)) - text.at
            )
          : {
              ...original,
              texts: original.texts.map((one) =>
                one.id !== id
                  ? one
                  : {
                      ...one,
                      seconds: Math.min(
                        60,
                        Math.max(
                          SHORTEST_TEXT,
                          edgeAt(original, one.at + one.seconds + seconds, id) - one.at
                        )
                      )
                    }
              )
            }
      )
    })
  }

  const moveLayer = (e: React.PointerEvent<HTMLElement>, id: string, part: 'body' | 'end') => {
    if (e.shiftKey) return onAlso({ kind: 'layer', id })
    onAlso(null)
    onPick({ kind: 'layer', id })
    drag(e, (seconds, original) => {
      const layer = original.layers?.find((one) => one.id === id)
      if (!layer) return
      onChange(
        part === 'body'
          ? shiftItems(
              original,
              groupOf(original, { kind: 'layer', id }),
              Math.max(0, blockAt(original, id, layer.at + seconds, layer.seconds)) - layer.at
            )
          : {
              ...original,
              layers: (original.layers ?? []).map((one) =>
                one.id !== id
                  ? one
                  : {
                      ...one,
                      seconds: Math.min(
                        600,
                        Math.max(
                          SHORTEST_TEXT,
                          edgeAt(original, one.at + one.seconds + seconds, id) - one.at
                        )
                      )
                    }
              )
            }
      )
    })
  }

  const moveMusic = (e: React.PointerEvent<HTMLElement>, id: string, part: 'body' | 'end') => {
    if (e.shiftKey) return onAlso({ kind: 'music', id })
    onAlso(null)
    onPick({ kind: 'music', id })
    drag(e, (seconds, original) =>
      onChange({
        ...original,
        music: original.music.map((piece) => {
          if (piece.id !== id) return piece
          const length = piece.end - piece.start
          if (part === 'body')
            return { ...piece, at: Math.max(0, blockAt(original, id, piece.at + seconds, length)) }
          const longest = music.get(piece.name)?.seconds ?? piece.end
          const end = edgeAt(original, piece.at + length + seconds, id) - piece.at + piece.start
          return { ...piece, end: Math.min(longest, Math.max(piece.start + SHORTEST_MUSIC, end)) }
        })
      })
    )
  }

  const overVideo = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(CLIP_DRAG)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropAt(nearestBoundary(edit, timeOf(e, e.currentTarget)).at)
  }

  const dropOnVideo = (e: React.DragEvent<HTMLDivElement>) => {
    const name = e.dataTransfer.getData(CLIP_DRAG)
    setDropAt(null)
    if (!name) return
    e.preventDefault()
    onDropClip(name, nearestBoundary(edit, timeOf(e, e.currentTarget)).index)
  }

  return (
    <div
      ref={box}
      onPointerDownCapture={(e) => {
        if (e.pointerType === 'touch')
          fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (fingers.current.size >= 2) cancels.current.forEach((cancel) => cancel())
        apart.current = 0
      }}
      onPointerMove={pinch}
      onPointerUp={lift}
      onPointerCancel={lift}
      onLostPointerCapture={(e) => dragging.current.has(e.pointerId) || lift(e)}
      className='relative min-h-0 flex-1 touch-none overflow-auto bg-ground'>
      <div
        style={{ width: width + HEAD }}
        className='relative'>
        <div className='sticky top-0 z-20 flex h-7 border-b border-line bg-well'>
          <span
            style={{ width: HEAD }}
            className='sticky left-0 z-10 flex-none border-r border-line bg-well'
          />
          <div
            onPointerDown={scrub}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                onSeek(at + (e.key === 'ArrowLeft' ? -1 : 1))
              }
            }}
            role='slider'
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={at}
            aria-label={t`Timeline ruler`}
            className='relative flex-1 cursor-pointer'>
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{ left: (tick * step * pps) / 2 }}
                className={`absolute bottom-0 border-l border-line-strong pl-1 font-mono text-micro text-ink-3 tabular-nums ${
                  tick % 2 === 0 ? 'top-0' : 'top-5'
                }`}>
                {tick % 2 === 0 && clockOf((tick * step) / 2).replace(/\.0$/, '')}
              </span>
            ))}
          </div>
        </div>

        <Lane
          name={t`Video`}
          tag='V1'
          note={t`Linked to Camera sound`}
          height='h-14.5'>
          <div
            onDragOver={overVideo}
            onDragLeave={() => setDropAt(null)}
            onDrop={dropOnVideo}
            className='absolute inset-0'>
            {placed(edit).map(({ clip, from }) =>
              clip.gap ? (
                <span
                  key={`gap-${clip.id}`}
                  style={{ left: (from - clip.gap) * pps, width: Math.max(0, clip.gap * pps - 2) }}
                  className='pointer-events-none absolute inset-y-1.25 rounded-corner border border-dashed border-line-strong'
                />
              ) : null
            )}
            {placed(edit).map(({ clip, index, from }) => {
              const source = sources.get(clip.name)
              const lead = fadeInto(edit.clips, index) * pps
              const length = clipLength(clip)
              const chosen =
                lit('clip', clip.id) || (picked?.kind === 'clip' && picked.id === clip.id)
              if (clip.id === SLOT)
                return (
                  <span
                    key={clip.id}
                    style={{ left: from * pps, width: Math.max(4, length * pps - 2) }}
                    className='absolute inset-y-1.25 flex items-center overflow-hidden rounded-corner border border-line-strong bg-well px-2 text-micro font-medium text-ink-3'>
                    {t`Your clips`}
                  </span>
                )
              return (
                <div
                  key={clip.id}
                  onPointerDown={(e) => pressClip(e, clip.id, source?.still)}
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') && onPick({ kind: 'clip', id: clip.id })
                  }
                  role='button'
                  tabIndex={0}
                  aria-pressed={chosen}
                  title={
                    source?.still ? clip.name : t`${clip.name} · double-click to choose the part`
                  }
                  style={{ left: from * pps, width: Math.max(4, length * pps - 2) }}
                  className={`group absolute inset-y-1.25 cursor-grab overflow-hidden rounded-corner border bg-proc-soft ${ring(chosen)}`}>
                  {source && (
                    <span className='pointer-events-none absolute inset-0 flex'>
                      {Array.from({ length: Math.ceil((length * pps) / FRAME) }, (_, i) => (
                        <span
                          key={i}
                          className='relative h-full w-14 flex-none overflow-hidden border-r border-black/20 bg-well [container-type:size]'>
                          <img
                            src={getThumbUrl(
                              source.play,
                              Math.max(
                                0,
                                Math.min(
                                  clip.end - 0.1,
                                  Math.round(clip.start + (i * FRAME * speedOf(clip)) / pps)
                                )
                              ),
                              160
                            )}
                            alt=''
                            loading='lazy'
                            draggable={false}
                            style={thumbLook(clip)}
                            className='absolute object-cover'
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <Ramps
                    fadeIn={fadeInOf(edit.clips, index)}
                    fadeOut={fadeOutOf(edit.clips, index)}
                    pps={pps}
                  />
                  {fadeInto(edit.clips, index) === 0 &&
                    fadeHandle('clips', clip.id, 'fadeIn', clip.name, chosen)}
                  {fadeInto(edit.clips, index + 1) === 0 &&
                    fadeHandle('clips', clip.id, 'fadeOut', clip.name, chosen)}
                  <span
                    style={{ marginLeft: lead }}
                    className='pointer-events-none absolute top-0.75 right-1.75 left-1.75 truncate text-micro font-medium text-here [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'>
                    {clip.name}
                  </span>
                  {source?.marks
                    .filter((mark) => mark.at >= clip.start && mark.at <= clip.end)
                    .map((mark) => (
                      <span
                        key={mark.which}
                        title={markName(mark.which)}
                        style={{ left: ((mark.at - clip.start) / speedOf(clip)) * pps }}
                        className='pointer-events-none absolute inset-y-0 w-0.5 bg-local-bar'>
                        <span className='absolute top-0 left-1 rounded-full bg-local-bar px-1.5 text-micro font-semibold text-here'>
                          {markName(mark.which)}
                        </span>
                      </span>
                    ))}
                  {(clip.markers ?? [])
                    .filter((mark) => mark.at >= clip.start && mark.at <= clip.end)
                    .map((mark) => (
                      <span
                        key={mark.id}
                        data-marker=''
                        title={mark.label}
                        style={{ left: ((mark.at - clip.start) / speedOf(clip)) * pps }}
                        className='pointer-events-none absolute inset-y-0 w-0.5 bg-accent'>
                        <span className='absolute bottom-1 left-1 max-w-24 truncate rounded-full bg-accent px-1.5 text-micro font-semibold text-on-accent'>
                          {mark.label}
                        </span>
                      </span>
                    ))}
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'start')}
                    aria-label={t`Trim the start`}
                    className={`absolute inset-y-0 left-0 w-2 z-5 cursor-ew-resize ${chosen ? GRIP + ' after:left-0.75' : ''}`}
                  />
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'end')}
                    aria-label={t`Trim the end`}
                    className={`absolute inset-y-0 right-0 w-2 z-5 cursor-ew-resize ${chosen ? GRIP + ' after:right-0.75' : ''}`}
                  />
                </div>
              )
            })}
            {placed(edit).map(({ clip, index, from }) => {
              const fade = fadeInto(edit.clips, index)
              if (!fade) return null
              const set = (seconds: number) =>
                onChange(setFade(edit, clip.id, Math.round(seconds * 1000) / 1000, ripple))
              return (
                <div
                  key={`fade-${clip.id}`}
                  role='slider'
                  tabIndex={0}
                  aria-label={t`Fade into ${clip.name}`}
                  aria-valuemin={FADE.least}
                  aria-valuemax={fadeMost(edit, clip.id)}
                  aria-valuenow={fade}
                  title={t`Drag to make the fade longer or shorter`}
                  onPointerDown={(e) => {
                    onPick({ kind: 'clip', id: clip.id })
                    drag(e, (seconds, original) =>
                      onChange(
                        setFade(original, clip.id, Math.max(FADE.least, fade - seconds), ripple)
                      )
                    )
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                    e.preventDefault()
                    set(
                      Math.max(
                        FADE.least,
                        fade + (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? 1 : -1)
                      )
                    )
                  }}
                  style={{
                    left: from * pps,
                    width: Math.max(8, fade * pps),
                    clipPath: 'polygon(0 0, 100% 0, 85% 100%, 0 100%)'
                  }}
                  className='absolute inset-y-1.25 cursor-ew-resize bg-accent-soft text-accent focus-visible:outline-2 focus-visible:outline-accent'>
                  <svg
                    aria-hidden='true'
                    preserveAspectRatio='none'
                    viewBox='0 0 100 100'
                    className='pointer-events-none absolute inset-0 h-full w-full'>
                    <path
                      d='M0 100 L100 0'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      vectorEffect='non-scaling-stroke'
                    />
                  </svg>
                </div>
              )
            })}
            {dropAt !== null && (
              <span
                style={{ left: dropAt * pps - 1 }}
                className='pointer-events-none absolute inset-y-0 w-1 rounded-full bg-accent shadow-glow'
              />
            )}
          </div>
        </Lane>

        <Lane
          name={t`Camera sound`}
          tag='A1'
          note={t`From the cameras`}
          height='h-11'>
          {placed(edit).map(({ clip, from }) => {
            const source = sources.get(clip.name)
            if (clip.id === SLOT) return null
            return (
              <div
                key={clip.id}
                onPointerDown={() => onPick({ kind: 'clip', id: clip.id })}
                style={{ left: from * pps, width: Math.max(4, clipLength(clip) * pps - 2) }}
                className={`absolute inset-y-1.25 flex items-center gap-1 overflow-hidden rounded-corner border bg-well pr-1 pl-1.75 ${ring(
                  picked?.kind === 'clip' && picked.id === clip.id
                )}`}>
                <span
                  className={`min-w-0 flex-1 truncate text-micro font-medium ${clip.sound ? 'text-ink' : 'text-ink-3'}`}>
                  {clip.name}
                </span>
                <button
                  type='button'
                  disabled={!source?.sound}
                  aria-pressed={clip.sound}
                  aria-label={clip.sound ? t`Mute the camera sound` : t`Hear this clip`}
                  title={
                    !source?.sound
                      ? t`This clip has no sound`
                      : clip.sound
                        ? t`Camera sound heard, the music dips under it`
                        : t`Hear this clip: the music dips under it`
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    onChange({
                      ...edit,
                      clips: edit.clips.map((one) =>
                        one.id === clip.id ? { ...one, sound: !one.sound } : one
                      )
                    })
                  }
                  className={`grid size-7 flex-none place-items-center rounded-full disabled:opacity-40 ${
                    clip.sound ? 'bg-accent text-on-accent' : 'bg-pane text-ink-3'
                  }`}>
                  <Icon
                    name={clip.sound ? 'sound' : 'muted'}
                    size={13}
                  />
                </button>
              </div>
            )
          })}
          {placed(edit).map(({ clip, index, from }) => {
            const fade = fadeInto(edit.clips, index)
            return fade ? (
              <span
                key={`sound-fade-${clip.id}`}
                aria-hidden='true'
                style={{ left: from * pps, width: Math.max(8, fade * pps) }}
                className='pointer-events-none absolute inset-y-1.25 border-l border-accent bg-linear-to-br from-transparent to-accent-soft'
              />
            ) : null
          })}
        </Lane>

        {layers.length > 0 && (
          <Lane
            name={t`Images`}
            tag='I1'
            note={t`Over the video`}
            height={['h-10', 'h-10', 'h-20', 'h-30', 'h-40'][Math.min(4, rowCount)]!}>
            {layers.map((layer) => {
              const row = rows.get(layer.id) ?? 0
              const chosen =
                lit('layer', layer.id) || (picked?.kind === 'layer' && picked.id === layer.id)
              return (
                <div
                  key={layer.id}
                  title={layer.name ?? layer.colour}
                  onPointerDown={(e) => moveLayer(e, layer.id, 'body')}
                  style={{
                    left: layer.at * pps,
                    width: Math.max(8, layer.seconds * pps - 2),
                    top: `${(row / rowCount) * 100}%`,
                    height: `${100 / rowCount}%`
                  }}
                  className='group absolute cursor-grab p-1'>
                  <div
                    className={`relative size-full truncate rounded-corner bg-well px-2 text-micro leading-text font-semibold text-ink-2 ${
                      chosen ? 'shadow-ring-2' : 'shadow-hairline'
                    }`}>
                    <Ramps
                      {...layerFadesOf(layer)}
                      pps={pps}
                    />
                    {fadeHandle(
                      'layers',
                      layer.id,
                      'fadeIn',
                      layer.name ?? layer.colour ?? '',
                      chosen
                    )}
                    {fadeHandle(
                      'layers',
                      layer.id,
                      'fadeOut',
                      layer.name ?? layer.colour ?? '',
                      chosen
                    )}
                    <span className='pointer-events-none flex h-full items-center gap-1.5'>
                      {layer.colour !== undefined && (
                        <i
                          style={{ background: layer.colour }}
                          className='size-3 flex-none rounded-corner shadow-hairline'
                        />
                      )}
                      {layer.name ?? layer.colour}
                    </span>
                    <span
                      onPointerDown={(e) => moveLayer(e, layer.id, 'end')}
                      aria-label={t`Make the picture longer or shorter`}
                      className='absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-accent/40'
                    />
                  </div>
                </div>
              )
            })}
          </Lane>
        )}

        <Lane
          name={t`Text`}
          tag='T1'
          note={t`Your titles`}
          height={['h-10', 'h-10', 'h-20', 'h-30', 'h-40'][Math.min(4, textRowCount)]!}>
          {edit.texts.map((text) => (
            <div
              key={text.id}
              onPointerDown={(e) => moveText(e, text.id, 'body')}
              style={{
                left: text.at * pps,
                width: Math.max(8, text.seconds * pps - 2),
                top: `calc(${((textRows.get(text.id) ?? 0) / textRowCount) * 100}% + 6px)`,
                height: `calc(${100 / textRowCount}% - 12px)`
              }}
              className={`group absolute cursor-grab truncate rounded-corner bg-accent-soft px-2 text-micro leading-text font-semibold text-accent-ink ${
                lit('text', text.id) || (picked?.kind === 'text' && picked.id === text.id)
                  ? 'shadow-ring-2'
                  : 'shadow-hairline'
              }`}>
              <Ramps
                {...textFadesOf(text)}
                pps={pps}
              />
              {fadeHandle(
                'texts',
                text.id,
                'fadeIn',
                text.text || t`Text`,
                picked?.kind === 'text' && picked.id === text.id
              )}
              {fadeHandle(
                'texts',
                text.id,
                'fadeOut',
                text.text || t`Text`,
                picked?.kind === 'text' && picked.id === text.id
              )}
              <span className='pointer-events-none flex h-full items-center'>
                {text.text || t`Text`}
              </span>
              <span
                onPointerDown={(e) => moveText(e, text.id, 'end')}
                aria-label={t`Make the text longer or shorter`}
                className='absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-accent/40'
              />
            </div>
          ))}
        </Lane>

        <Lane
          name={t`Music`}
          tag='M1'
          note={t`From the music`}
          height='h-13'>
          {spans.map((span) => (
            <span
              key={span.from}
              title={t`The music dips under the camera sound here`}
              style={{ left: span.from * pps, width: (span.to - span.from) * pps }}
              className='pointer-events-none absolute inset-y-0 bg-accent-soft'
            />
          ))}
          {edit.music.map((piece) => {
            const length = piece.end - piece.start
            const points = Array.from(
              { length: Math.floor(length / ENVELOPE_STEP) + 1 },
              (_, i) => i * ENVELOPE_STEP
            )
              .map(
                (into) =>
                  `${into * pps},${(1 - musicLevelAt(piece, edit.underSound, spans, piece.at + into)) * 100}`
              )
              .join(' ')
            return (
              <div
                key={piece.id}
                onPointerDown={(e) => moveMusic(e, piece.id, 'body')}
                title={piece.name}
                style={{ left: piece.at * pps, width: Math.max(8, length * pps - 2) }}
                className={`group absolute inset-y-1.5 cursor-grab overflow-hidden rounded-corner bg-up-soft ${
                  lit('music', piece.id) || (picked?.kind === 'music' && picked.id === piece.id)
                    ? 'shadow-ring-2'
                    : 'shadow-hairline'
                }`}>
                <svg
                  aria-hidden='true'
                  preserveAspectRatio='none'
                  viewBox={`0 0 ${Math.max(1, length * pps)} 100`}
                  className='pointer-events-none absolute inset-0 h-full w-full text-up'>
                  <polyline
                    points={points}
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                    vectorEffect='non-scaling-stroke'
                  />
                </svg>
                {fadeHandle(
                  'music',
                  piece.id,
                  'fadeIn',
                  piece.name,
                  picked?.kind === 'music' && picked.id === piece.id
                )}
                {fadeHandle(
                  'music',
                  piece.id,
                  'fadeOut',
                  piece.name,
                  picked?.kind === 'music' && picked.id === piece.id
                )}
                {(piece.markers ?? [])
                  .filter((mark) => mark.at >= piece.start && mark.at <= piece.end)
                  .map((mark) => (
                    <span
                      key={mark.id}
                      data-marker=''
                      title={mark.label}
                      style={{ left: (mark.at - piece.start) * pps }}
                      className='pointer-events-none absolute inset-y-0 w-0.5 bg-accent'>
                      <span className='absolute bottom-1 left-1 max-w-24 truncate rounded-full bg-accent px-1.5 text-micro font-semibold text-on-accent'>
                        {mark.label}
                      </span>
                    </span>
                  ))}
                <span className='pointer-events-none absolute top-1 left-2 truncate text-micro font-semibold text-up'>
                  {piece.name} · {Math.round(piece.volume * 100)}%
                </span>
                <span
                  onPointerDown={(e) => moveMusic(e, piece.id, 'end')}
                  aria-label={t`Make the music longer or shorter`}
                  className='absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-up/40'
                />
              </div>
            )
          })}
        </Lane>

        <span
          style={{ left: HEAD + Math.min(at, total) * pps }}
          className='pointer-events-none absolute top-0 bottom-0 z-5 w-px bg-accent'>
          <span
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)' }}
            className='absolute -left-1.5 top-0 h-3 w-3 bg-accent'
          />
        </span>
      </div>
    </div>
  )
}

export { CLIP_DRAG, ZOOM, FilmTimeline, markName }
export type { Picked }
