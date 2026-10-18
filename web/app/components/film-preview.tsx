import { t } from '@lingui/core/macro'
import { textLookAt } from '@skydock/scripts/client'
import type { EditText, FilmEdit, TextFont } from '@skydock/scripts/client'
import { useState } from 'react'

const CENTRE_PULL = 0.02

const FONT_LOOK: Record<TextFont, string> = {
  clean: 'font-sans font-medium',
  bold: 'font-sans font-bold',
  elegant: 'font-serif italic',
  hand: 'film-hand'
}

const TextOnFilm = ({
  text,
  at,
  picked,
  onPick,
  onMove,
  onGuides
}: {
  text: EditText
  at: number
  picked: boolean
  onPick: () => void
  onMove: (x: number, y: number) => void
  onGuides: (guides: { x: boolean; y: boolean }) => void
}) => {
  const look = textLookAt(text, at)
  const showing = look.opacity > 0 || picked
  if (!showing) return null
  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!stage) return
    e.preventDefault()
    e.stopPropagation()
    onPick()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const follow = (move: PointerEvent) => {
      const rawX = (move.clientX - stage.left) / stage.width
      const rawY = (move.clientY - stage.top) / stage.height
      const snapX = Math.abs(rawX - 0.5) < CENTRE_PULL
      const snapY = Math.abs(rawY - 0.5) < CENTRE_PULL
      onGuides({ x: snapX, y: snapY })
      onMove(
        snapX ? 0.5 : Math.min(1, Math.max(0, rawX)),
        snapY ? 0.5 : Math.min(1, Math.max(0, rawY))
      )
    }
    const done = () => {
      onGuides({ x: false, y: false })
      target.removeEventListener('pointermove', follow)
      target.removeEventListener('pointerup', done)
      target.removeEventListener('pointercancel', done)
    }
    target.addEventListener('pointermove', follow)
    target.addEventListener('pointerup', done)
    target.addEventListener('pointercancel', done)
  }
  return (
    <div
      role='button'
      tabIndex={-1}
      aria-label={t`Move the text`}
      onPointerDown={grab}
      style={{
        left: `${(text.x + look.dx) * 100}%`,
        top: `${(text.y + look.dy) * 100}%`,
        fontSize: `${text.size * 100}cqh`,
        color: text.colour,
        opacity: picked ? Math.max(look.opacity, 0.55) : look.opacity,
        transform: `translate(-50%, -50%) scale(${look.scale})`
      }}
      className={`film-text absolute cursor-move leading-title whitespace-pre ${FONT_LOOK[text.font]} ${
        text.effect === 'lower-third' ? 'film-text-box' : ''
      } ${picked ? 'outline-2 outline-offset-4 outline-pick outline-dashed' : ''}`}>
      {text.text || ' '}
    </div>
  )
}

const FilmPreview = ({
  edit,
  at,
  upright,
  picked,
  heard,
  videoRef,
  onPickText,
  onMoveText,
  onShape
}: {
  edit: FilmEdit
  at: number
  upright: boolean
  picked: string | null
  heard: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  onPickText: (id: string) => void
  onMoveText: (id: string, x: number, y: number) => void
  onShape: (upright: boolean) => void
}) => {
  const [guides, setGuides] = useState({ x: false, y: false })
  return (
    <div className='film-room relative grid min-h-0 flex-1 place-items-center p-4'>
      <div
        style={{
          aspectRatio: upright ? '9 / 16' : '16 / 9',
          width: upright
            ? 'min(100cqw, calc(100cqh * 9 / 16))'
            : 'min(100cqw, calc(100cqh * 16 / 9))'
        }}
        className='film-stage relative overflow-hidden rounded-corner bg-stage shadow-card'>
        <video
          ref={videoRef}
          playsInline
          muted
          preload='auto'
          onLoadedMetadata={(e) =>
            onShape(e.currentTarget.videoHeight > e.currentTarget.videoWidth)
          }
          className='absolute inset-0 h-full w-full object-contain'
        />
        <div className='film-safe pointer-events-none absolute' />
        {guides.x && (
          <div className='pointer-events-none absolute inset-y-0 left-1/2 w-px bg-pick' />
        )}
        {guides.y && (
          <div className='pointer-events-none absolute inset-x-0 top-1/2 h-px bg-pick' />
        )}
        {edit.texts.map((text) => (
          <TextOnFilm
            key={text.id}
            text={text}
            at={at}
            picked={picked === text.id}
            onPick={() => onPickText(text.id)}
            onMove={(x, y) => onMoveText(text.id, x, y)}
            onGuides={setGuides}
          />
        ))}
        {edit.clips.length === 0 && (
          <p className='absolute inset-0 grid place-items-center p-6 text-center text-lead text-paper'>
            {t`Drag clips from the left onto the timeline to start the film.`}
          </p>
        )}
        <span className='absolute top-3 right-3 rounded-full bg-scrim px-3 py-1 text-small font-semibold text-paper'>
          {heard}
        </span>
      </div>
    </div>
  )
}

export { FilmPreview, FONT_LOOK }
