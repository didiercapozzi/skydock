import { t } from '@lingui/core/macro'
import type { EditClip, EditSource } from '@skydock/scripts/client'
import { useEffect, useRef, useState } from 'react'
import { clockOf, snapPart } from '../helpers/filmTimeline'
import { Go, Mini } from './buttons'
import { Icon } from './icons'
import { markName } from './film-timeline'
import { Modal } from './modal'
import { getFileUrl, getThumbUrl } from './utils'

const FRAMES = 10
const SNAP_REACH = 0.04
const SHORTEST = 0.5

const FilmPart = ({
  clip,
  source,
  onPlace,
  onRemove,
  onClose
}: {
  clip: EditClip
  source: EditSource
  onPlace: (start: number, end: number) => void
  onRemove: () => void
  onClose: () => void
}) => {
  const [part, setPart] = useState({ start: clip.start, end: clip.end })
  const [playing, setPlaying] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const length = part.end - part.start
  const marks = source.marks.map((mark) => mark.at)
  const percent = (seconds: number) => `${(seconds / source.seconds) * 100}%`

  const show = (seconds: number) => {
    if (video.current) video.current.currentTime = seconds
  }

  useEffect(() => {
    const player = video.current
    if (!playing || !player) return
    player.currentTime = part.start
    player.playbackRate = 2
    void player.play().catch(() => setPlaying(false))
    const watch = () => {
      if (player.currentTime >= part.end) setPlaying(false)
    }
    player.addEventListener('timeupdate', watch)
    return () => {
      player.removeEventListener('timeupdate', watch)
      player.pause()
      player.playbackRate = 1
    }
  }, [playing, part.start, part.end])

  const drag = (e: React.PointerEvent<HTMLElement>, side: 'body' | 'start' | 'end') => {
    const bar = strip.current?.getBoundingClientRect()
    if (!bar) return
    e.preventDefault()
    e.stopPropagation()
    setPlaying(false)
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    const was = part
    const follow = (move: PointerEvent) => {
      const by = ((move.clientX - x0) / bar.width) * source.seconds
      const next =
        side === 'body'
          ? (() => {
              const start = snapPart(
                was.start + by,
                was.end - was.start,
                source.seconds,
                marks,
                SNAP_REACH * source.seconds
              )
              return { start, end: start + was.end - was.start }
            })()
          : side === 'start'
            ? { start: Math.min(was.end - SHORTEST, Math.max(0, was.start + by)), end: was.end }
            : {
                start: was.start,
                end: Math.max(was.start + SHORTEST, Math.min(source.seconds, was.end + by))
              }
      setPart(next)
      show(side === 'end' ? next.end : next.start)
    }
    const done = () => {
      target.removeEventListener('pointermove', follow)
      target.removeEventListener('pointerup', done)
      target.removeEventListener('pointercancel', done)
    }
    target.addEventListener('pointermove', follow)
    target.addEventListener('pointerup', done)
    target.addEventListener('pointercancel', done)
  }

  return (
    <Modal
      label={t`Choose the part of ${clip.name}`}
      title={t`Choose the part`}
      sub={t`Drag the blue part over what the film shows. It snaps just before each jump mark.`}
      full={880}
      onClose={onClose}
      footer={
        <>
          <Mini onClick={onRemove}>{t`Remove the clip`}</Mini>
          <span className='flex-1' />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Go onClick={() => onPlace(part.start, part.end)}>{t`Use this part`}</Go>
        </>
      }>
      <div className='flex min-h-0 flex-col gap-4 overflow-auto p-5'>
        <div className='relative aspect-video w-full overflow-hidden rounded-corner bg-stage'>
          <video
            ref={video}
            src={getFileUrl(source.play)}
            muted
            playsInline
            preload='auto'
            onLoadedMetadata={() => show(part.start)}
            className='h-full w-full object-contain'
          />
        </div>
        <div
          ref={strip}
          className='relative h-16 overflow-hidden rounded-corner bg-well'>
          <div className='absolute inset-0 flex'>
            {Array.from({ length: FRAMES }, (_, i) => (
              <img
                key={i}
                src={getThumbUrl(source.play, ((i + 0.5) / FRAMES) * source.seconds, 160)}
                alt=''
                draggable={false}
                className='h-full min-w-0 flex-1 object-cover opacity-60'
              />
            ))}
          </div>
          {source.marks.map((mark) => (
            <span
              key={mark.which}
              style={{ left: percent(mark.at) }}
              className='pointer-events-none absolute inset-y-0 w-0.5 bg-local-bar'>
              <span className='absolute bottom-1 left-1 rounded-full bg-local-bar px-1.5 text-micro font-semibold text-here'>
                {markName(mark.which)}
              </span>
            </span>
          ))}
          <div
            onPointerDown={(e) => drag(e, 'body')}
            aria-label={t`The part the film shows`}
            style={{ left: percent(part.start), width: percent(length) }}
            className='absolute inset-y-0 cursor-grab rounded-corner bg-accent/25 shadow-inset-ring-accent'>
            <span
              onPointerDown={(e) => drag(e, 'start')}
              aria-label={t`Move the start`}
              className='absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-accent'
            />
            <span
              onPointerDown={(e) => drag(e, 'end')}
              aria-label={t`Move the end`}
              className='absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-accent'
            />
          </div>
        </div>
        <div className='flex items-center gap-3 text-body text-ink-2'>
          <Mini onClick={() => setPlaying(!playing)}>
            <Icon
              name={playing ? 'pause' : 'play'}
              size={12}
            />
            {playing ? t`Stop` : t`Play the part, twice as fast`}
          </Mini>
          <span className='tabular-nums'>
            {clockOf(part.start)} – {clockOf(part.end)} · {clockOf(length)}
          </span>
        </div>
      </div>
    </Modal>
  )
}

export { FilmPart }
