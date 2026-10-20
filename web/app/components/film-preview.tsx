import { t } from '@lingui/core/macro'
import { layerFadesOf, rampAt, textLookAt } from '@skydock/scripts/client'
import type { EditLayer, EditText, FilmEdit, TextFont } from '@skydock/scripts/client'
import { getFileUrl } from './utils'
import { useState } from 'react'

const CENTRE_PULL = 0.02

const FONT_LOOK: Record<TextFont, string> = {
  clean: 'font-sans font-medium',
  bold: 'font-sans font-bold',
  elegant: 'font-serif italic',
  hand: 'film-hand'
}

const dragPointer = (
  e: React.PointerEvent<HTMLElement>,
  move: (event: PointerEvent) => void,
  end?: () => void
) => {
  const target = e.currentTarget
  target.setPointerCapture(e.pointerId)
  const done = () => {
    end?.()
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', done)
    target.removeEventListener('pointercancel', done)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', done)
  target.addEventListener('pointercancel', done)
}

const dragOnStage = (
  e: React.PointerEvent<HTMLElement>,
  onPick: () => void,
  onPoint: (x: number, y: number) => void,
  onEnd?: () => void
) => {
  const stage = e.currentTarget.parentElement?.getBoundingClientRect()
  if (!stage) return
  e.preventDefault()
  e.stopPropagation()
  onPick()
  dragPointer(
    e,
    (move) =>
      onPoint((move.clientX - stage.left) / stage.width, (move.clientY - stage.top) / stage.height),
    onEnd
  )
}

const within = (fraction: number) => Math.min(1, Math.max(0, fraction))

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
  const grab = (e: React.PointerEvent<HTMLDivElement>) =>
    dragOnStage(
      e,
      onPick,
      (rawX, rawY) => {
        const snapX = Math.abs(rawX - 0.5) < CENTRE_PULL
        const snapY = Math.abs(rawY - 0.5) < CENTRE_PULL
        onGuides({ x: snapX, y: snapY })
        onMove(snapX ? 0.5 : within(rawX), snapY ? 0.5 : within(rawY))
      },
      () => onGuides({ x: false, y: false })
    )
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

const urlOfImage = (images: Array<{ name: string; path: string }>, name: string | undefined) => {
  const found = images.find((one) => one.name === name)
  return found ? getFileUrl(found.path) : null
}

const LayerOnFilm = ({
  layer,
  url,
  at,
  picked,
  onPick,
  onMove
}: {
  layer: EditLayer
  url: string | null
  at: number
  picked: boolean
  onPick: () => void
  onMove: (x: number, y: number) => void
}) => {
  const into = at - layer.at
  if (into < 0 || into > layer.seconds) return null
  const { fadeIn, fadeOut } = layerFadesOf(layer)
  const opacity = rampAt(into, layer.seconds, fadeIn, fadeOut)
  if (layer.colour !== undefined)
    return (
      <div
        data-layer=''
        style={{ background: layer.colour, opacity }}
        className='pointer-events-none absolute inset-0'
      />
    )
  const grab = (e: React.PointerEvent<HTMLImageElement>) =>
    dragOnStage(e, onPick, (x, y) => onMove(within(x), within(y)))
  return url === null ? null : (
    <img
      data-layer=''
      src={url}
      alt=''
      draggable={false}
      onPointerDown={grab}
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.width * 100}%`,
        opacity: picked ? Math.max(opacity, 0.55) : opacity,
        transform: 'translate(-50%, -50%)'
      }}
      className={`absolute max-h-none max-w-none cursor-move ${picked ? 'outline-2 outline-offset-2 outline-pick outline-dashed' : ''}`}
    />
  )
}

const FilmPreview = ({
  edit,
  at,
  upright,
  picked,
  heard,
  blank,
  mix,
  fading,
  evenFront,
  onReady,
  framed,
  videoRef,
  underRef,
  images,
  pickedLayer,
  onPickText,
  onMoveText,
  onPickLayer,
  onMoveLayer,
  onShape
}: {
  edit: FilmEdit
  at: number
  upright: boolean
  picked: string | null
  heard: string
  blank: boolean
  mix: number
  fading: boolean
  evenFront: boolean
  onReady: () => void
  framed: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  underRef: React.RefObject<HTMLVideoElement | null>
  images: Array<{ name: string; path: string }>
  pickedLayer: string | null
  onPickText: (id: string) => void
  onMoveText: (id: string, x: number, y: number) => void
  onPickLayer: (id: string) => void
  onMoveLayer: (id: string, x: number, y: number) => void
  onShape: (upright: boolean) => void
}) => {
  const [guides, setGuides] = useState({ x: false, y: false })
  const deck = (front: boolean) =>
    `absolute inset-0 h-full w-full object-contain ${front ? (blank ? 'invisible' : 'z-10') : fading ? '' : 'invisible'}`
  return (
    <div className='film-room relative grid min-h-0 flex-1 place-items-center p-3'>
      <div
        style={{
          aspectRatio: upright ? '9 / 16' : '16 / 9',
          width: upright
            ? 'min(100cqw, calc(100cqh * 9 / 16))'
            : 'min(100cqw, calc(100cqh * 16 / 9))'
        }}
        className='film-stage relative overflow-hidden rounded-corner bg-stage'>
        <div className='absolute inset-0 isolate'>
          <video
            ref={underRef}
            playsInline
            muted
            preload='auto'
            onSeeked={onReady}
            onError={onReady}
            onLoadedData={onReady}
            style={{ opacity: evenFront ? 1 : mix }}
            className={deck(!evenFront)}
          />
          <video
            ref={videoRef}
            playsInline
            muted
            preload='auto'
            onSeeked={onReady}
            onError={onReady}
            onLoadedData={onReady}
            style={{ opacity: evenFront ? mix : 1 }}
            onLoadedMetadata={(e) =>
              onShape(e.currentTarget.videoHeight > e.currentTarget.videoWidth)
            }
            className={deck(evenFront)}
          />
        </div>
        {framed && <div className='film-safe pointer-events-none absolute' />}
        {guides.x && (
          <div className='pointer-events-none absolute inset-y-0 left-1/2 w-px bg-pick' />
        )}
        {guides.y && (
          <div className='pointer-events-none absolute inset-x-0 top-1/2 h-px bg-pick' />
        )}
        {(edit.layers ?? []).map((layer) => (
          <LayerOnFilm
            key={layer.id}
            layer={layer}
            url={urlOfImage(images, layer.name)}
            at={at}
            picked={pickedLayer === layer.id}
            onPick={() => onPickLayer(layer.id)}
            onMove={(x, y) => onMoveLayer(layer.id, x, y)}
          />
        ))}
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
        <span className='absolute top-3 left-3 rounded-full bg-scrim px-3 py-1 text-small font-semibold text-paper'>
          {heard}
        </span>
      </div>
    </div>
  )
}

export { dragPointer, FilmPreview, FONT_LOOK }
