import { t } from '@lingui/core/macro'
import { clipLength, filmLength, heardSpans, musicLevelAt } from '@skydock/scripts/client'
import type { EditSource, FilmEdit, MusicSource } from '@skydock/scripts/client'
import { useState } from 'react'
import { clockOf, moveClip, nearestBoundary, placed, trimClip } from '../helpers/filmTimeline'
import { Icon } from './icons'
import { getThumbUrl } from './utils'

type Picked = { kind: 'clip' | 'music' | 'text'; id: string } | null

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120]
const TICK_ROOM = 70
const ENVELOPE_STEP = 0.25
const SHORTEST_TEXT = 0.5
const SHORTEST_MUSIC = 1
const DOUBLE_CLICK = 350
const CLIP_DRAG = 'skydock/clip'

const markName = (which: 'exit' | 'opening' | 'canopy' | 'landing') =>
  which === 'exit'
    ? t`Exit`
    : which === 'opening'
      ? t`Opening`
      : which === 'canopy'
        ? t`Canopy`
        : t`Landing`

const stepFor = (pps: number) => STEPS.find((step) => step * pps >= TICK_ROOM) ?? 300

const Lane = ({
  name,
  icon,
  tall,
  children
}: {
  name: string
  icon: 'play' | 'text' | 'music'
  tall?: boolean
  children: React.ReactNode
}) => (
  <div className={`flex ${tall ? 'h-18' : 'h-11'} border-b border-line`}>
    <span className='sticky left-0 z-10 flex w-28 flex-none items-center gap-2 border-r border-line bg-pane px-3 text-small font-semibold text-ink-2'>
      <Icon
        name={icon}
        size={12}
      />
      {name}
    </span>
    <div className='relative flex-1'>{children}</div>
  </div>
)

const FilmTimeline = ({
  edit,
  sources,
  music,
  pps,
  at,
  picked,
  onSeek,
  onPick,
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
  onSeek: (t: number) => void
  onPick: (picked: Picked) => void
  onChange: (edit: FilmEdit) => void
  onOpenPart: (id: string) => void
  onDropClip: (name: string, index: number) => void
}) => {
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [lastDown, setLastDown] = useState<{ id: string; at: number } | null>(null)
  const total = filmLength(edit)
  const width = Math.max(total, ...edit.music.map((m) => m.at + m.end - m.start)) * pps + 240
  const step = stepFor(pps)
  const ticks = Array.from({ length: Math.floor(width / pps / step) + 1 }, (_, i) => i * step)
  const spans = heardSpans(edit, (clip) => sources.get(clip.name)?.sound === true)

  const timeOf = (e: { clientX: number }, lane: Element) =>
    Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / pps)

  const drag = (
    e: React.PointerEvent<HTMLElement>,
    apply: (seconds: number, original: FilmEdit, ended: boolean, pointer: PointerEvent) => void
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    const original = edit
    const move = (event: PointerEvent) => apply((event.clientX - x0) / pps, original, false, event)
    const up = (event: PointerEvent) => {
      apply((event.clientX - x0) / pps, original, true, event)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const lane = e.currentTarget
    onSeek(timeOf(e, lane))
    drag(e, (_, __, ___, pointer) => onSeek(timeOf(pointer, lane)))
  }

  const pressClip = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    const now = e.timeStamp
    if (lastDown?.id === id && now - lastDown.at < DOUBLE_CLICK) {
      setLastDown(null)
      onOpenPart(id)
      return
    }
    setLastDown({ id, at: now })
    onPick({ kind: 'clip', id })
    const lane = e.currentTarget.parentElement
    if (!lane) return
    drag(e, (seconds, original, ended, pointer) => {
      if (Math.abs(seconds * pps) < 6) {
        setDropAt(null)
        return
      }
      const target = nearestBoundary(original, timeOf(pointer, lane))
      setDropAt(ended ? null : target.at)
      if (ended) onChange(moveClip(original, id, target.index))
    })
  }

  const trim = (e: React.PointerEvent<HTMLSpanElement>, id: string, side: 'start' | 'end') => {
    onPick({ kind: 'clip', id })
    drag(e, (seconds, original) => {
      const clip = original.clips.find((one) => one.id === id)
      const source = clip && sources.get(clip.name)
      if (!clip || !source) return
      onChange(
        trimClip(
          original,
          id,
          side,
          side === 'start' ? clip.start + seconds : clip.end + seconds,
          source.seconds
        )
      )
    })
  }

  const moveText = (e: React.PointerEvent<HTMLElement>, id: string, part: 'body' | 'end') => {
    onPick({ kind: 'text', id })
    drag(e, (seconds, original) =>
      onChange({
        ...original,
        texts: original.texts.map((text) =>
          text.id !== id
            ? text
            : part === 'body'
              ? { ...text, at: Math.max(0, text.at + seconds) }
              : { ...text, seconds: Math.min(60, Math.max(SHORTEST_TEXT, text.seconds + seconds)) }
        )
      })
    )
  }

  const moveMusic = (e: React.PointerEvent<HTMLElement>, id: string, part: 'body' | 'end') => {
    onPick({ kind: 'music', id })
    drag(e, (seconds, original) =>
      onChange({
        ...original,
        music: original.music.map((piece) => {
          if (piece.id !== id) return piece
          if (part === 'body') return { ...piece, at: Math.max(0, piece.at + seconds) }
          const longest = music.get(piece.name)?.seconds ?? piece.end
          return {
            ...piece,
            end: Math.min(longest, Math.max(piece.start + SHORTEST_MUSIC, piece.end + seconds))
          }
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
    <div className='relative min-h-0 flex-1 overflow-auto bg-ground'>
      <div
        style={{ width: width + 112 }}
        className='relative'>
        <div className='sticky top-0 z-20 flex h-7 border-b border-line bg-pane'>
          <span className='sticky left-0 z-10 w-28 flex-none border-r border-line bg-pane' />
          <div
            onPointerDown={scrub}
            aria-label={t`Timeline ruler`}
            className='relative flex-1 cursor-col-resize'>
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{ left: tick * pps }}
                className='absolute top-0 h-full border-l border-line pl-1 text-micro text-ink-3 tabular-nums'>
                {clockOf(tick).replace(/\.0$/, '')}
              </span>
            ))}
          </div>
        </div>

        <Lane
          name={t`Video`}
          icon='play'
          tall>
          <div
            onDragOver={overVideo}
            onDragLeave={() => setDropAt(null)}
            onDrop={dropOnVideo}
            className='absolute inset-0'>
            {placed(edit).map(({ clip, from }) => {
              const source = sources.get(clip.name)
              const length = clipLength(clip)
              const chosen = picked?.kind === 'clip' && picked.id === clip.id
              return (
                <div
                  key={clip.id}
                  onPointerDown={(e) => pressClip(e, clip.id)}
                  title={t`${clip.name} · double-click to choose the part`}
                  style={{ left: from * pps, width: Math.max(4, length * pps - 2) }}
                  className={`absolute inset-y-1.5 cursor-grab overflow-hidden rounded-corner bg-proc-soft ${
                    chosen ? 'shadow-ring-2' : 'shadow-hairline'
                  }`}>
                  {source && (
                    <img
                      src={getThumbUrl(source.play, clip.start + Math.min(1, length / 2), 160)}
                      alt=''
                      draggable={false}
                      className='pointer-events-none absolute inset-y-0 left-0 h-full w-24 object-cover opacity-80'
                    />
                  )}
                  <span className='pointer-events-none absolute top-1 left-26 truncate text-micro font-semibold text-ink'>
                    {clip.name}
                  </span>
                  <span className='pointer-events-none absolute bottom-1 left-26 text-micro text-ink-3 tabular-nums'>
                    {clockOf(length)}
                  </span>
                  {source?.marks
                    .filter((mark) => mark.at >= clip.start && mark.at <= clip.end)
                    .map((mark) => (
                      <span
                        key={mark.which}
                        title={markName(mark.which)}
                        style={{ left: (mark.at - clip.start) * pps }}
                        className='pointer-events-none absolute inset-y-0 w-0.5 bg-local-bar'>
                        <span className='absolute top-0 left-1 rounded-full bg-local-bar px-1.5 text-micro font-semibold text-here'>
                          {markName(mark.which)}
                        </span>
                      </span>
                    ))}
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
                    className={`absolute right-2 bottom-1 grid size-6 place-items-center rounded-full disabled:opacity-40 ${
                      clip.sound ? 'bg-accent text-on-accent' : 'bg-pane text-ink-3'
                    }`}>
                    <Icon
                      name={clip.sound ? 'sound' : 'muted'}
                      size={13}
                    />
                  </button>
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'start')}
                    aria-label={t`Trim the start`}
                    className='absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-accent/0 hover:bg-accent/60'
                  />
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'end')}
                    aria-label={t`Trim the end`}
                    className='absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-accent/0 hover:bg-accent/60'
                  />
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
          name={t`Text`}
          icon='text'>
          {edit.texts.map((text) => (
            <div
              key={text.id}
              onPointerDown={(e) => moveText(e, text.id, 'body')}
              style={{ left: text.at * pps, width: Math.max(8, text.seconds * pps - 2) }}
              className={`absolute inset-y-1.5 cursor-grab truncate rounded-corner bg-accent-soft px-2 text-micro leading-text font-semibold text-accent-ink ${
                picked?.kind === 'text' && picked.id === text.id
                  ? 'shadow-ring-2'
                  : 'shadow-hairline'
              }`}>
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
          icon='music'
          tall>
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
                  `${into * pps},${(1 - musicLevelAt(piece.volume, edit.underSound, spans, piece.at + into)) * 100}`
              )
              .join(' ')
            return (
              <div
                key={piece.id}
                onPointerDown={(e) => moveMusic(e, piece.id, 'body')}
                title={piece.name}
                style={{ left: piece.at * pps, width: Math.max(8, length * pps - 2) }}
                className={`absolute inset-y-1.5 cursor-grab overflow-hidden rounded-corner bg-up-soft ${
                  picked?.kind === 'music' && picked.id === piece.id
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
          style={{ left: 112 + Math.min(at, total) * pps }}
          className='pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-accent'
        />
      </div>
    </div>
  )
}

export { CLIP_DRAG, FilmTimeline, markName }
export type { Picked }
