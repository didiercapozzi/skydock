import { i18n } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { JumpMoments, JumpTrack } from '@skydock/scripts'
import { useRef, useState } from 'react'
import { clock } from './utils'

/* The jump drawn against its own clip, and tied to the frame on screen: the force the camera felt
   from the first frame to the last, the phases of the jump shaded behind it, and — when the camera
   was told where it was — how high it was and how fast it was going. Dragging along it moves the
   footage, so a number and the frame it belongs to are never more than a finger apart
   (RULES, The jump on a graph). */

const HEIGHT = 96

const ALONG = 1000

/* what the force line is drawn against: a gravity sits in the middle, and a hard opening at the
   top. Kept fixed rather than fitted to each clip, so two jumps look the same size as each other. */
const FORCE_TO = 3

/* The parts of a jump, in the order they happen, each starting at the mark of its own name. What
   they are for is reading the graph at a glance — the dip is the door, the long flat is freefall —
   and telling somebody dragging along it where they are. */
const PHASES = [
  { from: null, label: msg`in the plane`, fill: 'fill-ink-3/5' },
  { from: 'exit', label: msg`freefall`, fill: 'fill-sky-400/10' },
  { from: 'opening', label: msg`the opening`, fill: 'fill-amber-400/15' },
  { from: 'canopy', label: msg`under the canopy`, fill: 'fill-emerald-400/10' },
  { from: 'landing', label: msg`on the ground`, fill: 'fill-ink-3/5' }
] as const

type Line = { at: (number | null)[]; low: number; high: number; stroke: string; faint?: boolean }

/* Freefall buffets a camera hard enough to swing it a whole gravity between one reading and the
   next, so the measurement drawn as it stands is a hedge, not a shape. The reading itself is kept,
   drawn faintly, and the jump's shape — the dip at the door, the long flat of freefall, the tug of
   the opening — is drawn over it as what a few seconds averaged out to. */
const SMOOTH_FOR = 3

const smoothed = (values: number[], rate: number) => {
  const span = Math.max(1, Math.round(SMOOTH_FOR * rate))
  return values.map((_, at) => {
    const from = Math.max(0, at - Math.floor(span / 2))
    const upto = Math.min(values.length, from + span)
    let sum = 0
    for (let one = from; one < upto; one++) sum += values[one]
    return sum / (upto - from)
  })
}

/* A line is drawn only where there are readings: a receiver that lost the sky for a few seconds
   leaves a gap, and a gap is honest where a line ruled straight across it would not be. */
const pathOf = ({ at, low, high }: Line) => {
  const span = high - low || 1
  const step = at.length > 1 ? ALONG / (at.length - 1) : ALONG
  return at
    .map((value, point) =>
      value === null
        ? ''
        : `${at[point - 1] === undefined || at[point - 1] === null ? 'M' : 'L'}${(point * step).toFixed(1)} ${(HEIGHT - ((value - low) / span) * HEIGHT).toFixed(1)}`
    )
    .join(' ')
    .trim()
}

const reach = (values: (number | null)[]) => {
  const known = values.filter((one) => one !== null)
  return known.length > 0 ? { low: Math.min(...known), high: Math.max(...known) } : null
}

const at = (values: (number | null)[] | undefined, point: number) => values?.[point] ?? null

const JumpGraph = ({
  track,
  waiting,
  moments,
  currentTime,
  duration,
  onSeek
}: {
  track: JumpTrack | null
  waiting: boolean
  /* as the timeline shows them, so a mark on the graph sits under its mark on the bar */
  moments?: JumpMoments | null
  currentTime: number
  duration: number
  onSeek: (seconds: number) => void
}) => {
  const frame = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const seconds = track?.seconds ?? duration
  const timeAt = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return Math.min(seconds, Math.max(0, ((clientX - box.left) / box.width) * seconds))
  }

  const handleDown = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    setDragging(true)
    onSeek(timeAt(e.clientX))
  }

  const handleMove = (e: React.PointerEvent) => {
    if (dragging) onSeek(timeAt(e.clientX))
  }

  const handleUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    setDragging(false)
  }

  if (waiting)
    return (
      <div className='font-mono text-[11px] text-ink-3'>{t`Reading what the camera measured…`}</div>
    )
  if (!track) return null

  const point = Math.min(
    track.force.length - 1,
    Math.max(0, Math.round((currentTime / (seconds || 1)) * track.force.length))
  )
  const along = (time: number) => `${Math.min(100, Math.max(0, (time / (seconds || 1)) * 100))}%`

  const felt = { low: 0, high: FORCE_TO, stroke: 'stroke-sky-400' }
  const force: Line[] = [
    { ...felt, at: track.force, faint: true },
    { ...felt, at: smoothed(track.force, track.rate) }
  ]
  const height = track.altitude && reach(track.altitude)
  const pace = track.speed && reach(track.speed)
  const lines = [
    ...force,
    ...(track.altitude && height
      ? [{ at: track.altitude, ...height, stroke: 'stroke-amber-400' } satisfies Line]
      : []),
    ...(track.speed && pace
      ? [{ at: track.speed, low: 0, high: pace.high, stroke: 'stroke-emerald-400' } satisfies Line]
      : [])
  ]

  /* where the person is, in the jump's own words */
  const phase = PHASES.reduce(
    (found, one) => {
      const from = one.from === null ? 0 : moments?.[one.from]
      return from !== undefined && currentTime >= from ? one : found
    },
    PHASES[0] as (typeof PHASES)[number]
  )

  const shading = PHASES.flatMap((one, index) => {
    const from = one.from === null ? 0 : moments?.[one.from]
    if (from === undefined) return []
    const next = PHASES.slice(index + 1).find((later) =>
      later.from === null ? false : moments?.[later.from] !== undefined
    )
    const upto = next?.from ? (moments?.[next.from] ?? seconds) : seconds
    return [{ ...one, from, upto }]
  })

  const shown = at(track.altitude, point)
  const fast = at(track.speed, point)

  return (
    <div className='flex flex-col gap-1'>
      <div
        ref={frame}
        data-jump-graph='true'
        aria-label={t`The jump against the clip`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className='relative cursor-ew-resize touch-none overflow-hidden rounded-[5px] border border-line bg-surface-2'
        style={{ height: HEIGHT }}>
        <svg
          width='100%'
          height={HEIGHT}
          viewBox={`0 0 ${ALONG} ${HEIGHT}`}
          preserveAspectRatio='none'
          className='absolute inset-0'>
          {shading.map(({ fill, from, upto }, index) => (
            <rect
              key={index}
              className={fill}
              x={(from / (seconds || 1)) * ALONG}
              width={Math.max(0, ((upto - from) / (seconds || 1)) * ALONG)}
              y={0}
              height={HEIGHT}
            />
          ))}
          {/* a gravity, which is what the plane, freefall and a canopy ride all weigh */}
          <line
            x1={0}
            x2={ALONG}
            y1={HEIGHT - (1 / FORCE_TO) * HEIGHT}
            y2={HEIGHT - (1 / FORCE_TO) * HEIGHT}
            className='stroke-line'
            strokeWidth={1}
            strokeDasharray='4 4'
            vectorEffect='non-scaling-stroke'
          />
          {lines.map((line, drawn) => (
            <path
              key={`${line.stroke}${drawn}`}
              d={pathOf(line)}
              fill='none'
              strokeWidth={line.faint ? 1 : 1.75}
              strokeOpacity={line.faint ? 0.3 : 1}
              vectorEffect='non-scaling-stroke'
              className={line.stroke}
            />
          ))}
        </svg>
        <span
          className='pointer-events-none absolute left-1 font-mono text-[10px] text-ink-3'
          style={{ top: HEIGHT - (1 / FORCE_TO) * HEIGHT - 12 }}>
          1 g
        </span>
        <div
          data-graph-playhead='true'
          className='pointer-events-none absolute top-0 bottom-0 w-0.5 -ml-px bg-white mix-blend-difference'
          style={{ left: along(currentTime) }}
        />
      </div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-3'>
        <span
          data-graph-readout='true'
          className='text-ink-2'>
          {clock(currentTime)} ·{' '}
          <b className='font-semibold text-sky-500'>{(at(track.force, point) ?? 0).toFixed(2)} g</b>
          {shown === null ? '' : ` · ${Math.round(shown)} m`}
          {fast === null ? '' : ` · ${Math.round(fast)} km/h`} · {i18n._(phase.label)}
        </span>
        {track.altitude ? (
          <>
            <span className='text-amber-500'>{t`— height`}</span>
            <span className='text-emerald-500'>{t`— speed`}</span>
          </>
        ) : (
          <span>{t`no height or speed — this camera wrote none`}</span>
        )}
      </div>
    </div>
  )
}

export { JumpGraph }
