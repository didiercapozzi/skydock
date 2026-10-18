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
  const ticks = Array.from({ length: Math.floor(width / pps / (step / 2)) + 1 }, (_, i) => i)
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
            {placed(edit).map(({ clip, from }) => {
              const source = sources.get(clip.name)
              const length = clipLength(clip)
              const chosen = picked?.kind === 'clip' && picked.id === clip.id
              return (
                <div
                  key={clip.id}
                  onPointerDown={(e) => pressClip(e, clip.id)}
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') && onPick({ kind: 'clip', id: clip.id })
                  }
                  role='button'
                  tabIndex={0}
                  aria-pressed={chosen}
                  title={t`${clip.name} · double-click to choose the part`}
                  style={{ left: from * pps, width: Math.max(4, length * pps - 2) }}
                  className={`absolute inset-y-1.25 cursor-grab overflow-hidden rounded-corner border bg-proc-soft ${ring(chosen)}`}>
                  {source && (
                    <span className='pointer-events-none absolute inset-0 flex'>
                      {Array.from({ length: Math.ceil((length * pps) / FRAME) }, (_, i) => (
                        <img
                          key={i}
                          src={getThumbUrl(
                            source.play,
                            Math.max(
                              0,
                              Math.min(clip.end - 0.1, Math.round(clip.start + (i * FRAME) / pps))
                            ),
                            160
                          )}
                          alt=''
                          loading='lazy'
                          draggable={false}
                          className='h-full w-14 flex-none border-r border-black/20 bg-well object-cover'
                        />
                      ))}
                    </span>
                  )}
                  <span className='pointer-events-none absolute top-0.75 right-1.75 left-1.75 truncate text-micro font-medium text-here [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'>
                    {clip.name}
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
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'start')}
                    aria-label={t`Trim the start`}
                    className={`absolute inset-y-0 left-0 w-2 cursor-ew-resize ${chosen ? GRIP + ' after:left-0.75' : ''}`}
                  />
                  <span
                    onPointerDown={(e) => trim(e, clip.id, 'end')}
                    aria-label={t`Trim the end`}
                    className={`absolute inset-y-0 right-0 w-2 cursor-ew-resize ${chosen ? GRIP + ' after:right-0.75' : ''}`}
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
          name={t`Camera sound`}
          tag='A1'
          note={t`From the cameras`}
          height='h-11'>
          {placed(edit).map(({ clip, from }) => {
            const source = sources.get(clip.name)
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
        </Lane>

        <Lane
          name={t`Text`}
          tag='T1'
          note={t`Your titles`}
          height='h-10'>
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

export { CLIP_DRAG, FilmTimeline, markName }
export type { Picked }
