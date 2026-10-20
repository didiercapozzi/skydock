import { plural, t } from '@lingui/core/macro'
import {
  applyTemplate,
  captureTemplate,
  clipLength,
  clipLevelAt,
  DAY_TOKEN,
  editAnswerSchema,
  DUCK_RAMP,
  fadeInOf,
  fadeInto,
  fadeOutOf,
  filmLength,
  layerFadesOf,
  filmTemplatesAnswerSchema,
  heardSpans,
  musicCrossfadeOf,
  musicFadesOf,
  musicLevelAt,
  CRF_RANGE,
  OUTPUT_CRF,
  OUTPUT_FPS,
  NAME_TOKEN,
  SLOT,
  slotEdit,
  speedOf,
  imageAsStill,
  STILL_SECONDS,
  TEXT_FADE,
  textFadesOf
} from '@skydock/scripts/client'
import type {
  EditClip,
  EditLayer,
  EditMusic,
  EditSource,
  EditText,
  FilmEdit,
  ImageSource,
  MusicSource,
  TextEffect,
  TextFont
} from '@skydock/scripts/client'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  boundaries,
  clipAt,
  clockOf,
  FADE,
  fadeAt,
  fadeBlock,
  fadeMost,
  fitItemFades,
  insertClip,
  nextId,
  placeClip,
  placed,
  removeClip,
  setFade,
  addMarkerAt,
  importMarkers,
  removeMarker,
  renameMarker,
  setClipFrame,
  setPart,
  setSpeed,
  splitClip,
  splitMusic,
  timelineEnd,
  lookGeometry,
  unturnedFrame,
  groupItems,
  changeLike,
  groupOf,
  moveLook,
  musicFadeBlock,
  patchItems,
  setMusicFade,
  ungroup,
  withoutItems,
  TILE_LOOP,
  trimClip
} from '../helpers/filmTimeline'
import { refusalSchema } from '../hooks/useBoardState'
import { useJobs } from '../hooks/liveStore'
import { useLiveJobs } from '../hooks/useLiveProgress'
import { useRoundedWindow } from '../hooks/useWindowFrame'
import { routingEngine } from '../helpers/routing'
import { Go, Mini, Seg } from './buttons'
import { FilmPart, SPEEDS } from './film-part'
import { askFilmTemplates, FilmTemplateModal, FilmTemplatePicker } from './film-template-modals'
import type { Listed } from './film-template-modals'
import { FONT_LOOK, FilmPreview } from './film-preview'
import { FilmShortcuts } from './film-shortcuts'
import { partOf, StopButton, stopOf } from './jobs-panel'
import { FILM_ACTIONS, keyLabel, keyNames, type FilmAction } from '../helpers/filmKeys'
import { useFilmKeys } from '../hooks/useFilmKeys'
import {
  resizedTimeline,
  setTimelineHeight,
  TIMELINE_HEIGHT,
  useTimelineHeight
} from '../hooks/useTimelineHeight'
import { CLIP_DRAG, FilmTimeline, markName, ZOOM } from './film-timeline'
import type { Picked } from './film-timeline'
import { Icon } from './icons'
import type { Grouped, Placed, Selected } from '../helpers/filmTimeline'
import { getFileUrl, getThumbUrl } from './utils'

const fadeWhy = (blocked: ReturnType<typeof fadeBlock>) =>
  blocked === 'first'
    ? t`The first clip has no clip before it to fade from`
    : blocked === 'gap'
      ? t`A gap separates the two clips: close it first`
      : blocked === 'short'
        ? t`A clip shorter than 0.4 seconds cannot fade`
        : t`Fade the picked clip in over the end of the clip before it`

type Loaded = Extract<z.infer<typeof editAnswerSchema>, { ok: true }>
type Library = 'clips' | 'music' | 'images' | 'text'

const LENGTH = { min: 5, max: 3600 }
const LAYER_SECONDS = 5
const PICTURE_WIDTH = 0.3
const SAVE_AFTER = 700
const DRIFT = 0.3
const SEEK_EPS = 0.001
const SEEK_TOLERANCE = 0.05
const CUE_WITHIN = 5
const MUSIC_VOLUME = 0.8
const SHORTEST_MUSIC = 5
const UNDOABLE = 50
const ONE_CHANGE = 400

const musicAnswerSchema = z.object({ ok: z.boolean(), error: z.string().optional() })

const TEXT_INPUTS = /^(text|number|search|email|url|tel|password)$/
const REPEATING = /^(Arrow\w+|Enter| )$/
const NATIVE = 'button, a[href], input:not([type=range]), summary'
const PRESSED = 'button, input[type=checkbox]'
const ARROWED = '[role=slider], input[type=range]'

const COLOURS = ['#ffffff', '#ffd84d', '#ff8a5c', '#7fd3ff', '#0f2f47'] as const

const SAMPLE_SIZE = 0.07
const SAMPLE_SCALE = { min: 0.7, max: 1.3 }
const SAMPLE_TOP = { min: 30, max: 65 }

const PRESETS: Array<{
  name: () => string
  effect: TextEffect
  font: TextFont
  x: number
  y: number
  size: number
  seconds: number
  title?: boolean
}> = [
  {
    name: () => t`Title`,
    effect: 'fade',
    font: 'bold',
    x: 0.5,
    y: 0.5,
    size: 0.09,
    seconds: 4,
    title: true
  },
  {
    name: () => t`Subtitle`,
    effect: 'rise',
    font: 'clean',
    x: 0.5,
    y: 0.62,
    size: 0.05,
    seconds: 3
  },
  {
    name: () => t`Lower third`,
    effect: 'lower-third',
    font: 'clean',
    x: 0.3,
    y: 0.85,
    size: 0.045,
    seconds: 4
  },
  {
    name: () => t`Big moment`,
    effect: 'pop',
    font: 'bold',
    x: 0.5,
    y: 0.45,
    size: 0.12,
    seconds: 2.5
  },
  {
    name: () => t`Signature`,
    effect: 'fade',
    font: 'hand',
    x: 0.72,
    y: 0.82,
    size: 0.07,
    seconds: 4
  }
]

const EFFECTS = (): Array<readonly [TextEffect, string]> => [
  ['fade', t`Fade`],
  ['rise', t`Rise`],
  ['pop', t`Pop`],
  ['lower-third', t`Lower third`]
]

const FONTS = (): Array<readonly [TextFont, string]> => [
  ['clean', t`Clean`],
  ['bold', t`Bold`],
  ['elegant', t`Elegant`],
  ['hand', t`Hand`]
]

const Tile = ({
  effect,
  font,
  text,
  x = 0.5,
  y = 0.5,
  size = SAMPLE_SIZE,
  height
}: {
  effect: TextEffect
  font: TextFont
  text: string
  x?: number
  y?: number
  size?: number
  height: string
}) => (
  <span
    data-effect={effect}
    aria-hidden='true'
    className={`fx-tile relative block overflow-hidden rounded-corner ${height}`}>
    <span
      style={{
        left: `${x * 100}%`,
        top: `${Math.min(SAMPLE_TOP.max, Math.max(SAMPLE_TOP.min, 25 + y * 50))}%`
      }}
      className='absolute max-w-full -translate-x-1/2 -translate-y-1/2'>
      <span
        style={{
          animationDuration: `${TILE_LOOP * TEXT_FADE}s`,
          fontSize: `calc(var(--text-subhead) * ${Math.min(SAMPLE_SCALE.max, Math.max(SAMPLE_SCALE.min, size / SAMPLE_SIZE))})`
        }}
        className={`fx-text film-text block truncate text-on-accent ${FONT_LOOK[font]} ${
          effect === 'lower-third' ? 'film-text-box' : ''
        }`}>
        {text}
      </span>
    </span>
  </span>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className='grid gap-1'>
    <span className='text-micro text-ink-2'>{label}</span>
    {children}
  </label>
)

const secondsOf = (text: string) => {
  const [minutes, seconds] = text.includes(':') ? text.split(':') : ['0', text]
  return Number(minutes) * 60 + Number(seconds)
}

const TimeBox = ({
  label,
  value,
  onCommit
}: {
  label: string
  value: number
  onCommit?: (seconds: number) => void
}) => (
  <Field label={label}>
    <input
      key={value}
      type='text'
      aria-label={label}
      readOnly={!onCommit}
      defaultValue={clockOf(value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={(e) => {
        const seconds = secondsOf(e.currentTarget.value)
        if (onCommit && Number.isFinite(seconds) && seconds !== value) onCommit(seconds)
        e.currentTarget.value = clockOf(value)
      }}
      className='min-w-0 rounded-corner border border-line bg-well px-2 py-1 font-mono text-body tabular-nums read-only:text-ink-2'
    />
  </Field>
)

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  shown,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  shown: string
  onChange: (value: number) => void
}) => (
  <Field label={label}>
    <span className='grid grid-cols-[1fr_52px] items-center gap-2'>
      <input
        type='range'
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className='w-full min-w-0 accent-accent'
      />
      <output className='text-right font-mono text-small text-ink-2 tabular-nums'>{shown}</output>
    </span>
  </Field>
)

const Item = ({
  picture,
  name,
  meta,
  trailing,
  ...frame
}: React.HTMLAttributes<HTMLDivElement> & {
  picture: React.ReactNode
  name: string
  meta: React.ReactNode
  trailing: React.ReactNode
}) => (
  <div
    {...frame}
    className='grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-corner border border-transparent p-1.5 hover:bg-well'>
    <span className='grid h-8.5 w-14 place-items-center overflow-hidden rounded-corner bg-well'>
      {picture}
    </span>
    <span className='grid min-w-0'>
      <span
        title={name}
        className='truncate font-medium'>
        {name}
      </span>
      <span className='flex gap-1.5 truncate font-mono text-small text-ink-3'>{meta}</span>
    </span>
    {trailing}
  </div>
)

const Add = ({ title, onClick }: { title?: string; onClick: () => void }) => (
  <button
    type='button'
    title={title}
    onClick={onClick}
    className='h-control-sm rounded-corner px-2 text-small font-bold text-accent-ink hover:bg-accent-soft'>
    {t`Add`}
  </button>
)

const FORMAT_NAMES = { h264: 'H.264', h265: 'H.265', av1: 'AV1' } as const

const Library = ({
  tab,
  onTab,
  sources,
  music,
  images,
  title,
  scratch,
  onAddClip,
  onAddMusic,
  onAddImage,
  onAddBackground,
  onAddText,
  onMusicArrived
}: {
  tab: Library
  onTab: (tab: Library) => void
  sources: EditSource[]
  music: MusicSource[]
  images: ImageSource[]
  title: string
  scratch: boolean
  onAddClip: (name: string) => void
  onAddMusic: (name: string) => void
  onAddImage: (name: string) => void
  onAddBackground: (colour: string) => void
  onAddText: (preset: (typeof PRESETS)[number]) => void
  onMusicArrived: () => void
}) => {
  const [bringing, setBringing] = useState<string | null>(null)
  const bringImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const body = new FormData()
    for (const file of files) body.append('files', file)
    setBringing(t`Bringing the pictures in…`)
    const answer = musicAnswerSchema.safeParse(
      await routingEngine.upload({ url: '/api/images', body }).catch(() => null)
    )
    setBringing(
      answer.success && answer.data.ok
        ? null
        : answer.success
          ? (answer.data.error ?? t`The pictures could not be brought in.`)
          : t`The pictures could not be brought in.`
    )
    onMusicArrived()
  }
  const bring = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const body = new FormData()
    for (const file of files) body.append('files', file)
    setBringing(t`Bringing the music in…`)
    const answer = musicAnswerSchema.safeParse(
      await routingEngine.upload({ url: '/api/music', body }).catch(() => null)
    )
    setBringing(
      answer.success && answer.data.ok
        ? null
        : answer.success
          ? (answer.data.error ?? t`The music could not be brought in.`)
          : t`The music could not be brought in.`
    )
    onMusicArrived()
  }
  return (
    <aside
      aria-label={t`Library`}
      className='flex min-h-0 min-w-0 flex-col border-r border-line bg-pane max-wide:h-72 max-desk:border-r-0 max-desk:border-b'>
      <div
        role='group'
        aria-label={t`Library`}
        className='flex flex-none items-center gap-1 border-b border-line px-2.5 py-2'>
        {(
          [
            ['clips', t`Clips`],
            ['music', t`Music`],
            ['images', t`Images`],
            ['text', t`Text`]
          ] as const
        ).map(([option, name]) => (
          <button
            key={option}
            type='button'
            aria-pressed={tab === option}
            onClick={() => onTab(option)}
            className={`rounded-corner px-2 py-1 font-medium ${
              tab === option ? 'bg-well text-ink' : 'text-ink-2 hover:bg-well'
            }`}>
            {name}
          </button>
        ))}
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto p-2.5'>
        {tab === 'clips' && scratch && (
          <p className='mx-0.5 mt-1 text-small text-ink-3'>
            {t`A film template has no clips. Your clips take the place of the grey bar when it is used.`}
          </p>
        )}
        {tab === 'clips' && !scratch && (
          <>
            <p className='eyebrow mx-0.5 mt-1 mb-1'>
              {t`${title} · ${plural(sources.filter((one) => !one.still).length, { one: '# video', other: '# videos' })}`}
              {sources.some((one) => one.still) &&
                t` · ${plural(sources.filter((one) => one.still).length, { one: '# photo', other: '# photos' })}`}
            </p>
            <p className='mx-0.5 mb-1 text-small text-ink-3'>
              {t`Drag a clip onto the video track, between two clips or at either end.`}
            </p>
            {sources.map((source) => (
              <Item
                key={source.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(CLIP_DRAG, source.name)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                picture={
                  <img
                    src={getThumbUrl(source.play, Math.min(1, source.seconds / 2), 160)}
                    alt=''
                    draggable={false}
                    className='size-full object-cover'
                  />
                }
                name={source.name}
                meta={
                  <>
                    <span>{source.still ? t`Photo` : clockOf(source.seconds)}</span>
                    {source.marks.length > 0 && (
                      <span>
                        {plural(source.marks.length, { one: '# mark', other: '# marks' })}
                      </span>
                    )}
                  </>
                }
                trailing={
                  <Add
                    title={t`Put it at the end of the film`}
                    onClick={() => onAddClip(source.name)}
                  />
                }
              />
            ))}
          </>
        )}
        {tab === 'music' && (
          <>
            <p className='text-small text-ink-3'>
              {t`The music is the film’s sound. Where a clip’s speaker is on, the music dips under the camera sound.`}
            </p>
            {music.map((piece) => (
              <Item
                key={piece.name}
                picture={
                  <Icon
                    name='music'
                    size={18}
                    className='text-ink-3'
                  />
                }
                name={piece.name}
                meta={<span>{clockOf(piece.seconds)}</span>}
                trailing={<Add onClick={() => onAddMusic(piece.name)} />}
              />
            ))}
            {music.length === 0 && (
              <p className='text-small text-ink-3'>{t`No music yet. Bring some in below.`}</p>
            )}
            <label className='mt-2 inline-flex h-control-sm cursor-pointer items-center justify-center gap-1.5 rounded-corner bg-pane px-3.5 text-body font-bold text-accent-ink shadow-card hover:bg-accent-soft'>
              <Icon
                name='plus'
                size={13}
              />
              {t`Bring in music…`}
              <input
                type='file'
                multiple
                accept='audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac'
                className='sr-only'
                onChange={(e) => void bring(e.target.files)}
              />
            </label>
            {bringing && <p className='text-small text-ink-3'>{bringing}</p>}
          </>
        )}
        {tab === 'images' && (
          <>
            <p className='text-small text-ink-3'>
              {t`A picture or a background goes in at the playhead, over the video and under the texts: drag it in the picture to place it. Full frame puts the picture on the video track instead, as a clip of five seconds.`}
            </p>
            <span className='flex gap-2'>
              <Mini onClick={() => onAddBackground('#ffffff')}>{t`White background`}</Mini>
              <Mini onClick={() => onAddBackground('#000000')}>{t`Black background`}</Mini>
            </span>
            {images.map((image) => (
              <Item
                key={image.name}
                picture={
                  <img
                    src={getFileUrl(image.path)}
                    alt=''
                    draggable={false}
                    className='size-full object-contain'
                  />
                }
                name={image.name}
                meta={
                  <span>
                    {image.width}×{image.height}
                  </span>
                }
                trailing={
                  <span className='flex items-center gap-1.5'>
                    <Mini
                      title={t`Put the picture on the video track, filling the frame`}
                      onClick={() => onAddClip(image.name)}>
                      {t`Full frame`}
                    </Mini>
                    <Add onClick={() => onAddImage(image.name)} />
                  </span>
                }
              />
            ))}
            {images.length === 0 && (
              <p className='text-small text-ink-3'>{t`No pictures yet. Bring some in below.`}</p>
            )}
            <label className='mt-2 inline-flex h-control-sm cursor-pointer items-center justify-center gap-1.5 rounded-corner bg-pane px-3.5 text-body font-bold text-accent-ink shadow-card hover:bg-accent-soft'>
              <Icon
                name='plus'
                size={13}
              />
              {t`Bring in pictures…`}
              <input
                type='file'
                multiple
                accept='image/*,.png,.jpg,.jpeg,.webp'
                className='sr-only'
                onChange={(e) => void bringImages(e.target.files)}
              />
            </label>
            {bringing && <p className='text-small text-ink-3'>{bringing}</p>}
          </>
        )}
        {tab === 'text' && (
          <>
            <p className='text-small text-ink-3'>
              {t`A text goes in at the playhead. Drag it in the picture to place it.`}
            </p>
            <span className='grid gap-2'>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name()}
                  type='button'
                  aria-label={preset.name()}
                  onClick={() => onAddText(preset)}
                  className='fx-card grid gap-0.5 rounded-corner border border-line bg-pane p-2 text-left hover:border-line-strong hover:bg-well focus-visible:border-accent'>
                  <Tile
                    effect={preset.effect}
                    font={preset.font}
                    text={preset.title ? title : t`Your text`}
                    x={preset.x}
                    y={preset.y}
                    size={preset.size}
                    height='h-12'
                  />
                  <span className='mt-1 text-body font-medium text-ink'>{preset.name()}</span>
                  <span className='text-micro text-ink-3'>
                    {EFFECTS().find(([effect]) => effect === preset.effect)?.[1]}
                  </span>
                </button>
              ))}
            </span>
          </>
        )}
      </div>
    </aside>
  )
}

const FadeLengths = ({
  fadeIn,
  fadeOut,
  max,
  whyIn,
  whyOut,
  onChange
}: {
  fadeIn: number
  fadeOut: number
  max: number
  whyIn?: string
  whyOut?: string
  onChange: (change: { fadeIn?: number; fadeOut?: number }) => void
}) => {
  const within = (seconds: number) => Math.min(max, Math.max(0, Math.round(seconds * 10) / 10))
  return (
    <>
      <TimeBox
        label={t({ message: 'Fade in', context: 'a fade from black, not a crossfade' })}
        value={fadeIn}
        onCommit={whyIn ? undefined : (seconds) => onChange({ fadeIn: within(seconds) })}
      />
      <TimeBox
        label={t`Fade out`}
        value={fadeOut}
        onCommit={whyOut ? undefined : (seconds) => onChange({ fadeOut: within(seconds) })}
      />
      {[whyIn, whyOut].map(
        (why) =>
          why && (
            <p
              key={why}
              className='col-span-2 m-0 text-small text-ink-3'>
              {why}
            </p>
          )
      )}
    </>
  )
}

const markersOfPicked = (edit: FilmEdit, picked: Picked) =>
  picked?.kind === 'clip'
    ? (edit.clips.find((one) => one.id === picked.id)?.markers?.length ?? 0)
    : picked?.kind === 'music'
      ? (edit.music.find((one) => one.id === picked.id)?.markers?.length ?? 0)
      : null

const Markers = ({
  edit,
  kind,
  id,
  importable,
  onChange,
  onImport
}: {
  edit: FilmEdit
  kind: 'clips' | 'music'
  id: string
  importable: boolean
  onChange: (edit: FilmEdit) => void
  onImport: () => void
}) => {
  const marks =
    (edit[kind] as Array<EditClip | EditMusic>).find((one) => one.id === id)?.markers ?? []
  return marks.length === 0 && !importable ? null : (
    <div className='grid gap-1.5'>
      <span className='text-micro text-ink-2'>{t`Markers`}</span>
      {marks.map((mark, index) => {
        const number = index + 1
        const name = mark.label
        return (
          <span
            key={mark.id}
            className='flex items-center gap-1.5'>
            <input
              aria-label={t`Marker ${number}`}
              value={mark.label}
              maxLength={40}
              onChange={(e) => onChange(renameMarker(edit, kind, id, mark.id, e.target.value))}
              className='h-control-sm min-w-0 flex-1 rounded-corner border border-line-strong bg-pane px-2 text-small text-ink focus:border-accent focus:outline-none'
            />
            <span className='font-mono text-small text-ink-3 tabular-nums'>{clockOf(mark.at)}</span>
            <button
              type='button'
              title={t`Take away the marker ${name}`}
              aria-label={t`Take away the marker ${name}`}
              onClick={() => onChange(removeMarker(edit, kind, id, mark.id))}
              className='tool-button'>
              <Icon
                name='close'
                size={12}
              />
            </button>
          </span>
        )
      })}
      {importable && <Mini onClick={onImport}>{t`Import the jump marks`}</Mini>}
    </div>
  )
}

const Inspector = ({
  edit,
  picked,
  also,
  sources,
  formats,
  ripple,
  scratch,
  renderOpen,
  rendering,
  again,
  onChange,
  onOpenPart,
  onRemove,
  onRender,
  onBack
}: {
  edit: FilmEdit
  picked: Picked
  also: Selected[]
  sources: Map<string, EditSource>
  formats: ReadonlyArray<keyof typeof FORMAT_NAMES>
  ripple: boolean
  scratch: boolean
  renderOpen: boolean
  rendering: boolean
  again: boolean
  onChange: (edit: FilmEdit) => void
  onOpenPart: (id: string) => void
  onRemove: () => void
  onRender: () => void
  onBack: () => void
}) => {
  const under = (
    <Slider
      label={t`Music under the camera sound`}
      value={edit.underSound}
      min={0}
      max={1}
      step={0.01}
      shown={`${Math.round(edit.underSound * 100)}%`}
      onChange={(underSound) => onChange({ ...edit, underSound })}
    />
  )
  const many = picked !== null && also.length > 0
  const solo = many ? null : picked
  const clip = solo?.kind === 'clip' ? edit.clips.find((one) => one.id === solo.id) : undefined
  const clipIndex = clip ? edit.clips.indexOf(clip) : -1
  const fade = clip ? fadeInto(edit.clips, clipIndex) : 0
  const changeClip = (change: Partial<EditClip>) =>
    clip &&
    onChange({
      ...edit,
      clips: edit.clips.map((one) => (one.id === clip.id ? { ...one, ...change } : one))
    })
  const changePiece = (change: Partial<EditMusic>) =>
    onChange({
      ...edit,
      music: edit.music.map((one) => (one.id === picked?.id ? { ...one, ...change } : one))
    })
  const piece = solo?.kind === 'music' ? edit.music.find((one) => one.id === solo.id) : undefined
  const text = solo?.kind === 'text' ? edit.texts.find((one) => one.id === solo.id) : undefined
  const layer =
    solo?.kind === 'layer' ? (edit.layers ?? []).find((one) => one.id === solo.id) : undefined
  const changeLayer = (change: Partial<EditLayer>) =>
    layer && onChange(changeLike(edit, { kind: 'layer', id: layer.id }, change, also))
  const changeText = (change: Partial<EditText>) =>
    text && onChange(changeLike(edit, { kind: 'text', id: text.id }, change, also))
  const picks: Selected[] = picked ? [{ kind: picked.kind, id: picked.id }, ...also] : []
  const allOf = (kind: Selected['kind']) =>
    picks.length > 0 && picks.every((one) => one.kind === kind)
  const rawFade = (pick: Selected | undefined) => {
    const one =
      pick?.kind === 'clip'
        ? edit.clips.find((c) => c.id === pick.id)
        : pick?.kind === 'music'
          ? edit.music.find((c) => c.id === pick.id)
          : pick?.kind === 'text'
            ? edit.texts.find((c) => c.id === pick.id)
            : edit.layers?.find((c) => c.id === pick?.id)
    return { fadeIn: one?.fadeIn ?? 0, fadeOut: one?.fadeOut ?? 0 }
  }
  const shortest = Math.min(
    ...picks.map((pick) =>
      pick.kind === 'clip'
        ? clipLength(edit.clips.find((c) => c.id === pick.id) ?? { start: 0, end: 2 })
        : pick.kind === 'music'
          ? (edit.music.find((c) => c.id === pick.id)?.end ?? 2) -
            (edit.music.find((c) => c.id === pick.id)?.start ?? 0)
          : ((
              edit.texts.find((c) => c.id === pick.id) ?? edit.layers?.find((c) => c.id === pick.id)
            )?.seconds ?? 2)
    )
  )
  const apart = (kind: Grouped['kind'], id: string) =>
    groupOf(edit, { kind, id }).length > 1 && (
      <Mini onClick={() => onChange(ungroup(edit, { kind, id }))}>{t`Ungroup`}</Mini>
    )
  const remove = (
    <Mini onClick={onRemove}>
      <Icon
        name='bin'
        size={13}
      />
      {t`Remove`}
    </Mini>
  )
  return (
    <aside
      aria-label={t`Inspector`}
      className='flex min-h-0 min-w-0 flex-col border-l border-line bg-pane max-wide:h-72 max-wide:border-l-0'>
      <div className='flex flex-none items-center border-b border-line px-2.5 py-2'>
        <h3 className='m-0 rounded-corner bg-well px-2 py-1 text-body font-medium text-ink'>{t`Inspector`}</h3>
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-2.5'>
        {clip && (
          <>
            <h3 className='m-0 truncate text-lead font-semibold'>{clip.name}</h3>
            <div className='grid grid-cols-2 gap-2'>
              {(() => {
                const source = sources.get(clip.name)
                const trim = (side: 'start' | 'end', value: number) =>
                  source && onChange(trimClip(edit, clip.id, side, value, source.seconds, ripple))
                return (
                  <>
                    <TimeBox
                      label={t`Starts at`}
                      value={placed(edit).find((one) => one.clip.id === clip.id)?.from ?? 0}
                      onCommit={(seconds) => onChange(placeClip(edit, clip.id, seconds, ripple))}
                    />
                    <TimeBox
                      label={t`Length`}
                      value={clipLength(clip)}
                      onCommit={(seconds) => trim('end', clip.start + seconds * speedOf(clip))}
                    />
                    {!source?.still && (
                      <>
                        <TimeBox
                          label={t`Source in`}
                          value={clip.start}
                          onCommit={(seconds) => trim('start', seconds)}
                        />
                        <TimeBox
                          label={t`Source out`}
                          value={clip.end}
                          onCommit={(seconds) => trim('end', seconds)}
                        />
                      </>
                    )}
                    {clip.id !== SLOT && (
                      <FadeLengths
                        fadeIn={fadeInOf(edit.clips, clipIndex)}
                        fadeOut={fadeOutOf(edit.clips, clipIndex)}
                        max={clipLength(clip) / 2}
                        whyIn={
                          fade > 0
                            ? t`The fade from the previous clip already fades this clip in.`
                            : undefined
                        }
                        whyOut={
                          fadeInto(edit.clips, clipIndex + 1) > 0
                            ? t`The next clip fades in over this one, which fades it out.`
                            : undefined
                        }
                        onChange={changeClip}
                      />
                    )}
                  </>
                )
              })()}
            </div>
            {!sources.get(clip.name)?.still && (
              <Mini onClick={() => onOpenPart(clip.id)}>
                <Icon
                  name='scissors'
                  size={13}
                />
                {t`Choose the part…`}
              </Mini>
            )}
            {!sources.get(clip.name)?.still && (
              <Field label={t`Speed`}>
                <select
                  aria-label={t`Speed`}
                  value={speedOf(clip)}
                  onChange={(e) =>
                    onChange(setSpeed(edit, clip.id, Number(e.target.value), ripple))
                  }
                  className='h-7 rounded-corner border border-line-strong bg-pane px-1.5 text-small text-ink-2'>
                  {SPEEDS.map((speed) => (
                    <option
                      key={speed}
                      value={speed}>
                      {speed === 1 ? t`Normal` : `${speed}×`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className='flex items-center gap-2 text-body'>
              <input
                type='checkbox'
                checked={clip.sound}
                disabled={!sources.get(clip.name)?.sound}
                onChange={(e) =>
                  onChange({
                    ...edit,
                    clips: edit.clips.map((one) =>
                      one.id === clip.id ? { ...one, sound: e.target.checked } : one
                    )
                  })
                }
                className='accent-accent'
              />
              {sources.get(clip.name)?.sound ? t`Hear this clip` : t`This clip has no sound`}
            </label>
            {clip.sound && sources.get(clip.name)?.sound && (
              <>
                <Slider
                  label={t`Music under this clip`}
                  value={clip.under ?? edit.underSound}
                  min={0}
                  max={1}
                  step={0.01}
                  shown={`${Math.round((clip.under ?? edit.underSound) * 100)}%`}
                  onChange={(under) => changeClip({ under })}
                />
                <Slider
                  label={t`Music fade around this clip`}
                  value={clip.underFade ?? DUCK_RAMP}
                  min={0.1}
                  max={5}
                  step={0.1}
                  shown={`${(clip.underFade ?? DUCK_RAMP).toFixed(1)}s`}
                  onChange={(underFade) => changeClip({ underFade })}
                />
              </>
            )}
            <label className='flex items-center gap-2 text-body'>
              <input
                type='checkbox'
                checked={fade > 0}
                disabled={fadeBlock(edit, clip.id) !== null}
                title={fadeWhy(fadeBlock(edit, clip.id))}
                onChange={(e) =>
                  onChange(setFade(edit, clip.id, e.target.checked ? FADE.default : 0, ripple))
                }
                className='accent-accent'
              />
              {t`Fade from the previous clip`}
            </label>
            {fade > 0 && (
              <Slider
                label={t`Length of the fade`}
                value={fade}
                min={FADE.least}
                max={fadeMost(edit, clip.id)}
                step={0.1}
                shown={`${fade.toFixed(1)}s`}
                onChange={(seconds) => onChange(setFade(edit, clip.id, seconds, ripple))}
              />
            )}
            <Markers
              edit={edit}
              kind='clips'
              id={clip.id}
              importable={(sources.get(clip.name)?.marks.length ?? 0) > 0}
              onChange={onChange}
              onImport={() => onChange(importMarkers(edit, sources, clip.id, markName))}
            />
            {under}
            {remove}
          </>
        )}
        {piece && (
          <>
            <h3 className='m-0 truncate text-lead font-bold'>{piece.name}</h3>
            <Slider
              label={t`Volume`}
              value={piece.volume}
              min={0}
              max={1}
              step={0.01}
              shown={`${Math.round(piece.volume * 100)}%`}
              onChange={(volume) =>
                onChange({
                  ...edit,
                  music: edit.music.map((one) => (one.id === piece.id ? { ...one, volume } : one))
                })
              }
            />
            <div className='grid grid-cols-2 gap-2'>
              <FadeLengths
                fadeIn={musicFadesOf(piece, edit.music).fadeIn}
                fadeOut={musicFadesOf(piece, edit.music).fadeOut}
                max={(piece.end - piece.start) / 2}
                whyIn={
                  musicCrossfadeOf(piece, edit.music).into > 0
                    ? t`The fade from the previous piece already fades this piece in.`
                    : undefined
                }
                whyOut={
                  musicCrossfadeOf(piece, edit.music).out > 0
                    ? t`The next piece fades in over this one, which fades it out.`
                    : undefined
                }
                onChange={changePiece}
              />
            </div>
            <label className='flex items-center gap-2 text-body'>
              <input
                type='checkbox'
                checked={piece.fade !== undefined}
                disabled={musicFadeBlock(edit, piece.id) !== null}
                title={
                  musicFadeBlock(edit, piece.id) !== null
                    ? t`There is no piece of music before this one to fade from`
                    : undefined
                }
                onChange={(e) =>
                  onChange(setMusicFade(edit, piece.id, e.target.checked ? FADE.default : 0))
                }
                className='accent-accent'
              />
              {t`Fade from the previous piece`}
            </label>
            {piece.fade !== undefined && (
              <Slider
                label={t`Length of the fade`}
                value={piece.fade}
                min={FADE.least}
                max={Math.max(FADE.least, (piece.end - piece.start) / 2)}
                step={0.1}
                shown={`${piece.fade.toFixed(1)}s`}
                onChange={(seconds) => onChange(setMusicFade(edit, piece.id, seconds))}
              />
            )}
            <Markers
              edit={edit}
              kind='music'
              id={piece.id}
              importable={false}
              onChange={onChange}
              onImport={() => undefined}
            />
            {under}
            {remove}
          </>
        )}
        {many && (
          <>
            <h3 className='m-0 truncate text-lead font-semibold'>
              {plural(picks.length, { other: '# items picked' })}
            </h3>
            <div className='grid grid-cols-2 gap-2'>
              <FadeLengths
                {...rawFade(picks[0])}
                max={shortest / 2}
                onChange={(change) => onChange(patchItems(edit, picks, change))}
              />
            </div>
            {allOf('music') && (
              <Slider
                label={t`Volume`}
                value={edit.music.find((one) => one.id === picks[0]!.id)?.volume ?? 1}
                min={0}
                max={1}
                step={0.01}
                shown={`${Math.round((edit.music.find((one) => one.id === picks[0]!.id)?.volume ?? 1) * 100)}%`}
                onChange={(volume) => onChange(patchItems(edit, picks, { volume }))}
              />
            )}
            {allOf('clip') && (
              <>
                <Field label={t`Speed`}>
                  <select
                    aria-label={t`Speed`}
                    value={speedOf(edit.clips.find((one) => one.id === picks[0]!.id) ?? {})}
                    onChange={(e) =>
                      onChange(
                        picks.reduce(
                          (now, pick) =>
                            sources.get(now.clips.find((one) => one.id === pick.id)?.name ?? '')
                              ?.still
                              ? now
                              : setSpeed(now, pick.id, Number(e.target.value), ripple),
                          edit
                        )
                      )
                    }
                    className='h-7 rounded-corner border border-line-strong bg-pane px-1.5 text-small text-ink-2'>
                    {SPEEDS.map((speed) => (
                      <option
                        key={speed}
                        value={speed}>
                        {speed === 1 ? t`Normal` : `${speed}×`}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className='flex items-center gap-2 text-body'>
                  <input
                    type='checkbox'
                    checked={edit.clips.find((one) => one.id === picks[0]!.id)?.sound ?? false}
                    onChange={(e) =>
                      onChange(
                        patchItems(
                          edit,
                          picks.filter(
                            (pick) =>
                              sources.get(edit.clips.find((one) => one.id === pick.id)?.name ?? '')
                                ?.sound
                          ),
                          { sound: e.target.checked }
                        )
                      )
                    }
                    className='accent-accent'
                  />
                  {t`Hear these clips`}
                </label>
              </>
            )}
            {allOf('text') && (
              <Field label={t`Colour`}>
                <span className='flex gap-2'>
                  {COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type='button'
                      aria-label={colour}
                      onClick={() => onChange(patchItems(edit, picks, { colour }))}
                      style={{ background: colour }}
                      className='size-6 rounded-full shadow-hairline'
                    />
                  ))}
                </span>
              </Field>
            )}
            {remove}
          </>
        )}
        {text && (
          <>
            <Field label={t`Text`}>
              <textarea
                value={text.text}
                rows={2}
                maxLength={200}
                onChange={(e) => changeText({ text: e.target.value })}
                className='resize-none rounded-corner border border-line-strong bg-pane px-3 py-2 text-body text-ink focus:border-accent focus:outline-none'
              />
            </Field>
            {scratch && (
              <p className='m-0 text-small text-ink-3'>
                {t`Write ${NAME_TOKEN} and ${DAY_TOKEN} where the name and the day go.`}
              </p>
            )}
            <Field label={t`Effect`}>
              <span
                role='group'
                aria-label={t`Effect`}
                className='grid grid-cols-2 gap-1.5'>
                {EFFECTS().map(([effect, name]) => (
                  <button
                    key={effect}
                    type='button'
                    aria-label={name}
                    aria-pressed={text.effect === effect}
                    onClick={() => changeText({ effect })}
                    className={`fx-card grid gap-1 overflow-hidden rounded-corner border border-line bg-pane pb-1.5 text-micro text-ink-2 ${
                      text.effect === effect
                        ? 'border-accent text-accent-ink shadow-ring focus-visible:border-accent'
                        : 'hover:border-line-strong focus-visible:border-accent'
                    }`}>
                    <Tile
                      effect={effect}
                      font='bold'
                      text='Aa'
                      height='h-10'
                    />
                    {name}
                  </button>
                ))}
              </span>
            </Field>
            <Field label={t`Font`}>
              <span className='grid grid-cols-4 gap-1.5'>
                {FONTS().map(([font, name]) => (
                  <button
                    key={font}
                    type='button'
                    aria-label={name}
                    title={name}
                    aria-pressed={text.font === font}
                    onClick={() => changeText({ font })}
                    className={`h-9 rounded-corner border text-lead ${FONT_LOOK[font]} ${
                      text.font === font
                        ? 'border-accent bg-accent-soft text-accent-ink shadow-ring'
                        : 'border-line bg-pane text-ink hover:border-line-strong focus-visible:border-accent'
                    }`}>
                    Aa
                  </button>
                ))}
              </span>
            </Field>
            <Slider
              label={t`Size`}
              value={text.size}
              min={0.02}
              max={0.3}
              step={0.005}
              shown={`${Math.round(text.size * 100)}`}
              onChange={(size) => changeText({ size })}
            />
            <Slider
              label={t`Shown for`}
              value={text.seconds}
              min={0.5}
              max={20}
              step={0.5}
              shown={`${text.seconds}s`}
              onChange={(seconds) => changeText({ seconds })}
            />
            <div className='grid grid-cols-2 gap-2'>
              <FadeLengths
                fadeIn={textFadesOf(text).fadeIn}
                fadeOut={textFadesOf(text).fadeOut}
                max={text.seconds / 2}
                onChange={changeText}
              />
            </div>
            <Field label={t`Colour`}>
              <span className='flex gap-2'>
                {COLOURS.map((colour) => (
                  <button
                    key={colour}
                    type='button'
                    aria-label={colour}
                    aria-pressed={text.colour.toLowerCase() === colour}
                    onClick={() => changeText({ colour })}
                    style={{ background: colour }}
                    className={`size-5.5 rounded-full ${
                      text.colour.toLowerCase() === colour ? 'shadow-picked' : 'shadow-hairline'
                    }`}
                  />
                ))}
              </span>
            </Field>
            {apart('text', text!.id)}
            {remove}
          </>
        )}
        {layer && (
          <>
            <h3 className='m-0 truncate text-lead font-semibold'>{layer.name ?? t`Background`}</h3>
            <div className='grid grid-cols-2 gap-2'>
              <TimeBox
                label={t`Starts at`}
                value={layer.at}
                onCommit={(seconds) => changeLayer({ at: Math.max(0, seconds) })}
              />
              <TimeBox
                label={t`Length`}
                value={layer.seconds}
                onCommit={(seconds) =>
                  changeLayer({ seconds: Math.min(600, Math.max(0.5, seconds)) })
                }
              />
              <FadeLengths
                fadeIn={layerFadesOf(layer).fadeIn}
                fadeOut={layerFadesOf(layer).fadeOut}
                max={layer.seconds / 2}
                onChange={changeLayer}
              />
            </div>
            {layer.name !== undefined && (
              <>
                <Slider
                  label={t`Across`}
                  value={layer.x}
                  min={0}
                  max={1}
                  step={0.01}
                  shown={`${Math.round(layer.x * 100)}%`}
                  onChange={(x) => changeLayer({ x })}
                />
                <Slider
                  label={t`Down`}
                  value={layer.y}
                  min={0}
                  max={1}
                  step={0.01}
                  shown={`${Math.round(layer.y * 100)}%`}
                  onChange={(y) => changeLayer({ y })}
                />
                <Slider
                  label={t`Width`}
                  value={layer.width}
                  min={0.02}
                  max={1}
                  step={0.01}
                  shown={`${Math.round(layer.width * 100)}%`}
                  onChange={(width) => changeLayer({ width })}
                />
              </>
            )}
            {layer.colour !== undefined && (
              <Field label={t`Colour`}>
                <span className='flex gap-2'>
                  {[...COLOURS, '#000000'].map((colour) => (
                    <button
                      key={colour}
                      type='button'
                      aria-label={colour}
                      aria-pressed={layer.colour?.toLowerCase() === colour}
                      onClick={() => changeLayer({ colour })}
                      style={{ background: colour }}
                      className={`size-5.5 rounded-full ${
                        layer.colour?.toLowerCase() === colour ? 'shadow-picked' : 'shadow-hairline'
                      }`}
                    />
                  ))}
                </span>
              </Field>
            )}
            {apart('layer', layer!.id)}
            {remove}
          </>
        )}
        {!many && !clip && !piece && !text && !layer && !(renderOpen && !scratch) && (
          <>
            <h3 className='m-0 text-lead font-bold'>{t`The film`}</h3>
            <p className='text-body text-ink-2'>
              {scratch
                ? clockOf(filmLength(edit))
                : t`${plural(edit.clips.length, { one: '# clip', other: '# clips' })} · ${clockOf(filmLength(edit))}`}
            </p>
            <p className='text-small text-ink-3'>
              {t`Pick a clip, a piece of music or a text on the timeline to change it. Double-click a clip to choose its part.`}
            </p>
            {under}
          </>
        )}
        {!many && !clip && !piece && !text && !layer && renderOpen && !scratch && (
          <>
            <h3 className='m-0 text-lead font-bold'>{t`Render the film`}</h3>
            <p className='text-body text-ink-2'>
              {t`${plural(edit.clips.length, { one: '# clip', other: '# clips' })} · ${clockOf(filmLength(edit))}`}
            </p>
            {formats.length > 1 && (
              <div className='grid gap-1'>
                <span className='text-micro text-ink-2'>{t`Format`}</span>
                <Seg
                  label={t`Format`}
                  wide
                  value={edit.output?.format ?? 'h264'}
                  options={formats.map((one) => [one, FORMAT_NAMES[one]] as const)}
                  onPick={(format) =>
                    onChange({ ...edit, output: { ...edit.output, format, crf: undefined } })
                  }
                />
              </div>
            )}
            <div className='grid gap-1'>
              <span className='text-micro text-ink-2'>{t`Frame rate`}</span>
              <Seg
                label={t`Frame rate`}
                wide
                value={String(edit.output?.fps ?? 30)}
                options={OUTPUT_FPS.map((rate) => [String(rate), String(rate)] as const)}
                onPick={(rate) =>
                  onChange({ ...edit, output: { ...edit.output, fps: Number(rate) } })
                }
              />
            </div>
            <Slider
              label={t`Quality`}
              value={edit.output?.crf ?? OUTPUT_CRF[edit.output?.format ?? 'h264']}
              min={CRF_RANGE.least}
              max={CRF_RANGE.most}
              step={1}
              shown={String(edit.output?.crf ?? OUTPUT_CRF[edit.output?.format ?? 'h264'])}
              onChange={(crf) => onChange({ ...edit, output: { ...edit.output, crf } })}
            />
            <p className='m-0 text-small text-ink-3'>
              {t`The lower the number, the better the picture and the bigger the file.`}
            </p>
            <Go
              disabled={edit.clips.length === 0 || rendering}
              title={t`Render the film into the montage’s folder, from the processed copies`}
              onClick={onRender}>
              <Icon
                name='download'
                size={14}
              />
              {again ? t`Render again` : t`Render the film`}
            </Go>
            <Mini onClick={onBack}>{t`Back to the film`}</Mini>
          </>
        )}
      </div>
    </aside>
  )
}

const slotKept = (was: FilmEdit, next: FilmEdit): FilmEdit => {
  const end = next.clips.find((one) => one.id === SLOT)?.end
  return {
    ...next,
    clips: was.clips.map((one) =>
      one.id === SLOT && end !== undefined
        ? { ...one, end: Math.min(LENGTH.max, Math.max(LENGTH.min, end)) }
        : one
    )
  }
}

const templateNamed = (raw: unknown, name: string) => {
  const listed = filmTemplatesAnswerSchema.safeParse(raw)
  return listed.success ? listed.data.templates.find((kept) => kept.name === name) : undefined
}

const asEdit = (raw: unknown, name: string) => {
  const listed = filmTemplatesAnswerSchema.safeParse(raw)
  if (!listed.success) return null
  const one = templateNamed(raw, name)
  return one
    ? {
        ok: true,
        title: name,
        saved: true,
        sources: [],
        music: listed.data.music,
        rendering: false,
        film: null,
        edit: applyTemplate(slotEdit(one.template.length), one.template, {
          name: NAME_TOKEN,
          day: DAY_TOKEN,
          music: null
        }).edit
      }
    : { ok: false, reason: t`This film template is gone.` }
}

const clipsChanged = (edit: FilmEdit | null, sources: Map<string, EditSource> | null) => {
  const clips = edit && sources ? edit.clips : []
  const names = (pick: (clip: EditClip, source?: EditSource) => boolean) => [
    ...new Set(clips.filter((clip) => pick(clip, sources?.get(clip.name))).map((clip) => clip.name))
  ]
  return {
    gone: names((_, source) => !source),
    shorter: names((clip, source) =>
      Boolean(source && !source.still && clip.end > source.seconds + SEEK_TOLERANCE)
    )
  }
}

const FilmEditor = ({
  groupId = '',
  day,
  template,
  onClose
}: {
  groupId?: string
  day?: string
  template?: string
  onClose: () => void
}) => {
  const scratch = template !== undefined
  const cornered = useRoundedWindow()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [edit, setEditNow] = useState<FilmEdit | null>(null)
  const [saving, setSaving] = useState<'saved' | 'waiting' | 'saving' | 'failed'>('saved')
  const [picked, setPicked] = useState<Picked>(null)
  const [also, setAlso] = useState<Selected[]>([])
  const timelineHeight = useTimelineHeight()
  const [tab, setTab] = useState<Library>('clips')
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(12)
  const [upright, setUpright] = useState(false)
  const [part, setPartOf] = useState<string | null>(null)
  const [renderAsked, setRenderAsked] = useState(false)
  useLiveJobs(!scratch)
  const followed = useJobs().find((job) => job.type === 'render' && job.groupIds?.includes(groupId))
  const [renderSeen, setRenderSeen] = useState<string | null>(null)
  if (followed && followed.id !== renderSeen) setRenderSeen(followed.id)
  const rendering = followed ? followed.stage !== 'failed' : renderSeen ? false : renderAsked
  const stopRender = followed && followed.stage !== 'failed' ? stopOf(followed) : null
  const [renderOpen, setRenderOpen] = useState(false)
  useEffect(() => {
    if (picked) setRenderOpen(false)
  }, [picked])
  const [readAgain, setReadAgain] = useState(0)
  const [starting, setStarting] = useState<Listed | null>(null)
  const [templating, setTemplating] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)
  const [history, setHistory] = useState<FilmEdit[]>([])
  const [ripple, setRipple] = useState(true)
  const [snap, setSnap] = useState(true)
  const [help, setHelp] = useState(false)
  const lastChange = useRef(0)
  const joined = useRef(false)
  const held = useRef(false)
  const root = useRef<HTMLElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const under = useRef<HTMLVideoElement>(null)
  const shown = useRef(-1)
  const leadDeck = useRef(-1)
  const cueing = useRef(false)
  const running = useRef(false)
  const alive = useRef(true)
  const decoded = useRef(new Map<string, boolean>())
  const laid = useRef<{ edit: FilmEdit; list: Placed[] } | null>(null)
  const [front, setFront] = useState(0)
  const sounds = useRef(new Map<string, HTMLAudioElement>())
  const latest = useRef<FilmEdit | null>(null)
  const now = useRef(0)
  const fade = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sources = new Map([
    ...(loaded?.images ?? []).map((one) => [one.name, imageAsStill(one)] as const),
    ...(loaded?.sources ?? []).map((one) => [one.name, one] as const)
  ])
  const music = new Map((loaded?.music ?? []).map((one) => [one.name, one]))
  const changedClips = clipsChanged(scratch ? null : edit, loaded ? sources : null)

  const save = async (intent: 'save' | 'render') => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const current = latest.current
    if (!current) return false
    setSaving('saving')
    if (scratch) {
      const { said } = await askFilmTemplates({
        intent: 'update',
        name: template,
        template: { ...captureTemplate(current, { name: '', day: '' }), fade: fade.current }
      })
      setSaving(said === null ? 'saved' : 'failed')
      if (said !== null) setProblem(said)
      return said === null
    }
    const answer = await routingEngine
      .action({
        url: '/api/edit',
        searchParamsArgs: { groupId },
        actionArgs: { intent, groupId, edit: current }
      })
      .catch((e: unknown) => ({ success: false as const, globalErrors: [String(e)] }))
    const refused = refusalSchema.safeParse(answer)
    setSaving(refused.success ? 'failed' : 'saved')
    if (refused.success)
      setProblem(refused.data.globalErrors?.[0] ?? t`The film could not be saved.`)
    return !refused.success
  }

  const apply = (next: FilmEdit) => {
    latest.current = next
    setEditNow(next)
    setSaving('waiting')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save('save'), SAVE_AFTER)
  }

  const change = (next: FilmEdit) => {
    const was = latest.current
    const moment = performance.now()
    if (was && !(joined.current && (held.current || moment - lastChange.current <= ONE_CHANGE)))
      setHistory((kept) => [...kept.slice(1 - UNDOABLE), was])
    joined.current = true
    lastChange.current = moment
    apply(fitItemFades(scratch && was ? slotKept(was, next) : next))
  }

  useEffect(() => {
    root.current?.focus()
  }, [])

  const leaving = useRef(save)
  useEffect(() => {
    leaving.current = save
  })
  useEffect(
    () => () => {
      if (timer.current) void leaving.current('save')
    },
    []
  )

  const begin = async () => {
    const offered = filmTemplatesAnswerSchema.safeParse(
      await routingEngine.loader({ url: '/api/film-templates' }).catch(() => null)
    )
    if (offered.success && offered.data.templates.length > 0) setStarting(offered.data.templates)
    else if (!offered.success) setProblem(t`The film templates could not be read.`)
  }

  const startFrom = (name: string | null) => {
    const chosen = starting?.find((one) => one.name === name)?.template
    const first = latest.current
    setStarting(null)
    if (!chosen || !first) return
    const {
      edit: next,
      left,
      cut
    } = applyTemplate(first, chosen, {
      name: loaded?.title ?? '',
      day: day ?? '',
      music: loaded?.music ?? [],
      images: loaded?.images ?? []
    })
    apply(next)
    const list = (left.length > 0 ? left : cut).join(', ')
    if (left.length > 0) setProblem(t`Not in the music folder, left out: ${list}`)
    else if (cut.length > 0) setProblem(t`Does not fit this film, left out: ${list}`)
  }

  useEffect(() => {
    let cancelled = false
    const asked = scratch
      ? routingEngine.loader({ url: '/api/film-templates' }).then((raw) => {
          fade.current = templateNamed(raw, template)?.template.fade
          return asEdit(raw, template)
        })
      : routingEngine.loader({ url: '/api/edit', searchParamsArgs: { groupId } })
    asked
      .then((raw) => {
        if (cancelled) return
        const parsed = editAnswerSchema.safeParse(raw)
        if (!parsed.success) return setProblem(t`The film could not be read.`)
        if (!parsed.data.ok) return setProblem(parsed.data.reason)
        setLoaded(parsed.data)
        setRenderAsked(parsed.data.rendering)
        const aside = parsed.data.setAside
        if (aside)
          setProblem(
            t`The saved edit could not be read (${aside.reason}), so it was kept aside as ${aside.as} and the film starts again from its first edit.`
          )
        if (latest.current === null) {
          latest.current = parsed.data.edit
          setEditNow(parsed.data.edit)
          const room = Math.max(600, window.innerWidth - 200)
          setPps(
            Math.min(
              ZOOM.max,
              Math.max(ZOOM.min, room / Math.max(10, timelineEnd(parsed.data.edit)))
            )
          )
          if (!parsed.data.saved) void begin()
        }
      })
      .catch(() => {
        if (!cancelled) setProblem(t`The film could not be read.`)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, template, readAgain])

  const lookOf = (player: HTMLVideoElement, clip: EditClip) => {
    const rotation = clip.rotation ?? 0
    const stage = player.parentElement
    const framed = (clip.frame !== undefined || rotation !== 0) && stage !== null
    if (framed && !player.videoWidth)
      player.addEventListener('loadedmetadata', () => lookOf(player, clip), { once: true })
    const box = clip.frame ? unturnedFrame(clip.frame, rotation) : null
    const geometry = framed
      ? lookGeometry(
          { width: player.videoWidth || 1920, height: player.videoHeight || 1080 },
          rotation,
          clip.frame ?? null,
          { width: stage.clientWidth, height: stage.clientHeight }
        )
      : null
    Object.assign(player.style, {
      inset: geometry ? 'auto' : '',
      top: geometry ? '50%' : '',
      left: geometry ? '50%' : '',
      width: geometry ? `${geometry.width}px` : '',
      height: geometry ? `${geometry.height}px` : '',
      maxWidth: geometry ? 'none' : '',
      maxHeight: geometry ? 'none' : '',
      clipPath: box
        ? `inset(${box.y * 100}% ${(1 - box.x - box.width) * 100}% ${(1 - box.y - box.height) * 100}% ${box.x * 100}%)`
        : '',
      transform: geometry
        ? `translate(${geometry.dx}px, ${geometry.dy}px) translate(-50%, -50%) rotate(${rotation}deg)`
        : ''
    })
  }

  const drive = (
    player: HTMLVideoElement | null,
    one: Placed | null,
    level: number,
    t: number,
    rolling: boolean
  ) => {
    const source = one && sources.get(one.clip.name)
    if (player && one && source?.still) {
      lookOf(player, { ...one.clip, frame: undefined, rotation: undefined })
      const url = getFileUrl(source.play)
      player.poster = url
      if (!decoded.current.has(url)) {
        decoded.current.set(url, false)
        const image = new Image()
        image.src = url
        void image
          .decode()
          .catch(() => undefined)
          .then(() => {
            decoded.current.set(url, true)
            settle()
          })
      }
      if (player.dataset.src) {
        delete player.dataset.src
        player.removeAttribute('src')
        player.load()
      }
      if (!player.paused) player.pause()
    } else if (player && one && source) {
      if (player.poster) player.removeAttribute('poster')
      const url = getFileUrl(source.play)
      if (player.dataset.src !== url) {
        player.dataset.src = url
        player.src = url
      }
      const want = one.clip.start + (Math.min(t, one.to) - one.from) * speedOf(one.clip)
      lookOf(player, one.clip)
      player.playbackRate = speedOf(one.clip)
      if (Math.abs(player.currentTime - want) > (rolling ? DRIFT : SEEK_EPS))
        player.currentTime = want
      player.muted = !(one.clip.sound && source.sound)
      player.volume = Math.min(1, Math.max(0, level))
      if (rolling && player.paused) void player.play().catch(() => undefined)
      if (!rolling && !player.paused) player.pause()
    } else if (player && !player.paused) player.pause()
  }

  const settled = (player: HTMLVideoElement | null) => {
    if (!player) return true
    if (player.dataset.src)
      return player.error !== null || (player.readyState >= 2 && !player.seeking)
    const poster = player.getAttribute('poster')
    return !poster || decoded.current.get(poster) === true
  }

  const laidOut = (current: FilmEdit) => {
    if (laid.current?.edit !== current) laid.current = { edit: current, list: placed(current) }
    return laid.current.list
  }

  const sync = (t: number, rolling: boolean) => {
    const current = latest.current
    if (!current) return
    const lead = clipAt(current, t)
    const blend = fadeAt(current, t)
    const players = [video.current, under.current]
    const taken = [false, false]
    const put = (one: Placed, level: number, at: number, roll: boolean, avoid = -1) => {
      const url = getFileUrl(sources.get(one.clip.name)?.play ?? '')
      const has = (player: HTMLVideoElement | null, deck: number) =>
        !taken[deck] && (player?.dataset.src === url || player?.getAttribute('poster') === url)
      const want = one.clip.start + (Math.min(at, one.to) - one.from) * speedOf(one.clip)
      const deck =
        [0, 1]
          .filter((k) => has(players[k]!, k))
          .sort(
            (a, b) =>
              Math.abs(players[a]!.currentTime - want) - Math.abs(players[b]!.currentTime - want)
          )[0] ?? -1
      const free = [0, 1].filter((k) => !taken[k])
      const chosen = deck >= 0 ? deck : (free.find((k) => k !== avoid) ?? free[0]!)
      taken[chosen] = true
      drive(players[chosen]!, one, level, at, roll)
      return chosen
    }
    const deck = lead
      ? put(
          lead,
          blend?.mix ?? clipLevelAt(current.clips, lead.index, t - lead.from),
          t,
          rolling,
          shown.current
        )
      : -1
    if (blend) put(blend.out, 1 - blend.mix, t, rolling)
    if (lead && (blend || settled(players[deck]!))) {
      shown.current = deck
      setFront(deck)
    }
    leadDeck.current = deck
    const ahead = blend ? undefined : laidOut(current).find((one) => one.from > t)
    cueing.current = false
    if (ahead && ahead.from - t < CUE_WITHIN) {
      if (deck < 0 || settled(players[deck]!)) put(ahead, 0, ahead.from, false)
      else cueing.current = true
    }
    players.forEach((player, k) => {
      if (!taken[k] && player && !player.paused) player.pause()
    })
    const spans = heardSpans(current, (clip) => sources.get(clip.name)?.sound === true)
    for (const piece of current.music) {
      const sound = sounds.current.get(piece.id)
      if (!sound) continue
      const into = t - piece.at
      if (rolling && into >= 0 && into < piece.end - piece.start) {
        const want = piece.start + into
        if (Math.abs(sound.currentTime - want) > DRIFT) sound.currentTime = want
        sound.volume = Math.min(
          1,
          Math.max(0, musicLevelAt(piece, current.underSound, spans, t, current.music))
        )
        if (sound.paused) void sound.play().catch(() => undefined)
      } else if (!sound.paused) sound.pause()
    }
  }

  const settle = () => {
    const deck = leadDeck.current
    if (deck < 0 || !settled([video.current, under.current][deck]!)) return
    const moved = shown.current !== deck
    shown.current = deck
    setFront(deck)
    if (alive.current && (moved || cueing.current)) sync(now.current, running.current)
  }

  const seek = (t: number) => {
    const total = latest.current ? timelineEnd(latest.current) : 0
    now.current = Math.min(Math.max(0, t), total)
    setAt(now.current)
    sync(now.current, playing)
  }

  useEffect(() => {
    if (!playing) return
    running.current = true
    const end = () => (latest.current ? timelineEnd(latest.current) : 0)
    if (now.current >= end() - 0.05) now.current = 0
    let last = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const total = end()
      now.current = Math.min(total, now.current + (time - last) / 1000)
      last = time
      setAt(now.current)
      sync(now.current, true)
      if (now.current >= total) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      running.current = false
      sync(now.current, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => {
    const map = decoded.current
    alive.current = true
    return () => {
      alive.current = false
      map.clear()
    }
  }, [])

  useEffect(() => {
    if (loaded) sync(now.current, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const syncing = useRef(sync)
  useEffect(() => {
    syncing.current = sync
  })
  useEffect(() => {
    const again = () => syncing.current(now.current, running.current)
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [])

  const looks = JSON.stringify(edit?.clips.map((clip) => [clip.frame, clip.rotation, clip.speed]))
  useEffect(() => {
    if (loaded) sync(now.current, running.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looks])

  const close = async () => {
    setPlaying(false)
    if (timer.current) await save('save')
    onClose()
  }

  const render = async () => {
    setPlaying(false)
    if (await save('render')) {
      setRenderAsked(true)
      onClose()
    }
  }

  const undo = () => {
    const before = history.at(-1)
    if (!before) return
    setHistory(history.slice(0, -1))
    joined.current = false
    setPicked((now) =>
      now &&
      [...before.clips, ...before.music, ...before.texts, ...(before.layers ?? [])].some(
        (one) => one.id === now.id
      )
        ? now
        : null
    )
    apply(before)
  }

  const removePicked = () => {
    if (!edit || !picked) return
    joined.current = false
    const chosen: Selected[] = [{ kind: picked.kind, id: picked.id }, ...also]
    const members = chosen.flatMap((one) =>
      one.kind === 'text' || one.kind === 'layer'
        ? groupOf(edit, { kind: one.kind, id: one.id })
        : []
    )
    const ids = (kind: Selected['kind']) =>
      chosen.filter((one) => one.kind === kind).map((one) => one.id)
    const clipsGone = chosen.filter((one) => one.kind === 'clip')
    const without = clipsGone.reduce((now, one) => removeClip(now, one.id, ripple), edit)
    change(
      withoutItems(
        { ...without, music: without.music.filter((one) => !ids('music').includes(one.id)) },
        members
      )
    )
    setPicked(null)
    setAlso([])
  }

  const cut =
    edit && !scratch
      ? picked?.kind === 'music'
        ? splitMusic(edit, picked.id, at)
        : splitClip(edit, at)
      : null

  const pickedId = picked?.kind === 'clip' ? picked.id : null
  const blocked = edit && pickedId ? fadeBlock(edit, pickedId) : 'first'
  const fading = Boolean(
    edit &&
    fadeInto(
      edit.clips,
      edit.clips.findIndex((clip) => clip.id === pickedId)
    )
  )

  const pickedMusic = picked?.kind === 'music' ? picked.id : null
  const musicBlocked = edit && pickedMusic ? musicFadeBlock(edit, pickedMusic) : 'first'
  const musicFading = Boolean(
    pickedMusic && edit?.music.find((one) => one.id === pickedMusic)?.fade !== undefined
  )

  const fadeHere = () => {
    if (!edit) return
    joined.current = false
    if (pickedMusic) change(setMusicFade(edit, pickedMusic, musicFading ? 0 : FADE.default))
    else if (pickedId) change(setFade(edit, pickedId, fading ? 0 : FADE.default, ripple))
  }

  const markHere = () => {
    if (!edit || scratch) return
    const count =
      markersOfPicked(edit, picked) ??
      edit.clips.reduce((total, clip) => total + (clip.markers?.length ?? 0), 0)
    const number = count + 1
    const marked = addMarkerAt(edit, picked, now.current, t`Marker ${number}`)
    if (marked) change(marked)
  }

  const cutHere = () => {
    if (!cut) return
    joined.current = false
    change(cut)
    const second = cut.clips.find((one) => !edit?.clips.some((was) => was.id === one.id))
    if (second) setPicked({ kind: 'clip', id: second.id })
    const piece = cut.music.find((one) => !edit?.music.some((was) => was.id === one.id))
    if (piece) setPicked({ kind: 'music', id: piece.id })
  }

  const bound = useFilmKeys()
  const hint = (text: string, action: FilmAction) =>
    bound[action].length ? `${text} (${bound[action].map(keyLabel).join(', ')})` : text
  const shortcuts = (action: FilmAction) => bound[action].map(keyLabel).join(' ') || undefined

  const keys = (e: KeyboardEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null
    const typing =
      target !== null &&
      (target.isContentEditable ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && TEXT_INPUTS.test(target.type)))
    if (document.querySelector('[aria-modal="true"]')) return
    if (e.key === 'Escape' && !part) void close()
    if (typing) return
    if (e.repeat && !REPEATING.test(e.key)) return
    const arrowed = target?.matches(ARROWED)
    const command = e.ctrlKey || e.metaKey
    if (e.key.toLowerCase() === 'z' && command && !e.shiftKey && !e.getModifierState('AltGraph')) {
      e.preventDefault()
      undo()
    }
    if (
      e.altKey &&
      !command &&
      !arrowed &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      edit &&
      picked?.kind === 'clip'
    ) {
      e.preventDefault()
      const from = placed(edit).find((one) => one.clip.id === picked.id)?.from ?? 0
      const by = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1)
      change(placeClip(edit, picked.id, Math.round((from + by) * 1000) / 1000, ripple))
    }
    if ((command || e.altKey) && !e.getModifierState('AltGraph')) return
    if (e.key === ' ' || e.key === 'Enter') {
      if (keyFocus.current && target?.matches(NATIVE)) return
      e.preventDefault()
      if (!e.repeat) setPlaying((was) => !was)
    }
    const typed = keyNames(e)
    const hit = FILM_ACTIONS.find((action) => bound[action].some((one) => typed.includes(one)))
    const has = (action: FilmAction) => hit === action
    const shifted = e.shiftKey && /^\p{L}$/u.test(e.key)
    if (
      !shifted &&
      hit &&
      !(scratch && hit === 'cut') &&
      !(hit === 'delete' && keyFocus.current && target?.matches(PRESSED))
    )
      e.preventDefault()
    if (has('delete') && !shifted && !(keyFocus.current && target?.matches(PRESSED))) removePicked()
    if (e.key === '?') setHelp(true)
    if (!arrowed && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      seek(
        Math.round(
          (now.current + (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1)) * 1000
        ) / 1000
      )
    }
    if ((e.key === 'Home' || e.key === 'End') && !target?.matches('input[type=range]')) {
      e.preventDefault()
      seek(e.key === 'Home' ? 0 : total)
    }
    if (shifted) return
    if (has('cut')) cutHere()
    if (has('marker')) markHere()
    if (has('fade') && ((pickedId && blocked === null) || (pickedMusic && musicBlocked === null)))
      fadeHere()
    if (has('ripple')) setRipple((was) => !was)
    if (has('snap')) setSnap((was) => !was)
    if (has('title')) addText(PRESETS[0]!)
  }

  const keyFocus = useRef(false)
  const typedKeys = useRef(keys)
  useEffect(() => {
    typedKeys.current = keys
  })
  useEffect(() => {
    const listen = (e: KeyboardEvent) => typedKeys.current(e)
    const focused = (e: FocusEvent) =>
      (keyFocus.current = e.target instanceof Element && e.target.matches(':focus-visible'))
    const left = (e: FocusEvent) => {
      if (!e.relatedTarget) keyFocus.current = false
    }
    window.addEventListener('keydown', listen)
    window.addEventListener('focusin', focused)
    window.addEventListener('focusout', left)
    return () => {
      window.removeEventListener('keydown', listen)
      window.removeEventListener('focusin', focused)
      window.removeEventListener('focusout', left)
    }
  }, [])

  const addClip = (name: string, index?: number) => {
    const source = sources.get(name)
    if (!edit || !source) return
    const clip = {
      id: nextId('clip', edit.clips),
      name,
      start: 0,
      end: source.still ? STILL_SECONDS : source.seconds,
      sound: false
    }
    change(insertClip(edit, index ?? edit.clips.length, clip, ripple))
    setPicked({ kind: 'clip', id: clip.id })
  }

  const addMusic = (name: string) => {
    const source = music.get(name)
    if (!edit || !source) return
    const from = Math.max(0, ...edit.music.map((one) => one.at + one.end - one.start))
    const room = filmLength(edit) - from
    const piece = {
      id: nextId('music', edit.music),
      name,
      at: from,
      start: 0,
      end: Math.min(source.seconds, Math.max(SHORTEST_MUSIC, room)),
      volume: MUSIC_VOLUME
    }
    change({ ...edit, music: [...edit.music, piece] })
    setPicked({ kind: 'music', id: piece.id })
  }

  const addLayer = (look: Pick<EditLayer, 'name' | 'colour' | 'width'>) => {
    if (!edit) return
    const layer = {
      id: nextId('layer', edit.layers ?? []),
      at,
      seconds: LAYER_SECONDS,
      x: 0.5,
      y: 0.5,
      ...look
    }
    change({ ...edit, layers: [...(edit.layers ?? []), layer] })
    setPicked({ kind: 'layer', id: layer.id })
  }

  const addText = (preset: (typeof PRESETS)[number]) => {
    if (!edit) return
    const text = {
      id: nextId('text', edit.texts),
      text: preset.title ? (scratch ? NAME_TOKEN : (loaded?.title ?? '')) : t`Your text`,
      at: Math.min(at, Math.max(0, timelineEnd(edit) - preset.seconds)),
      seconds: preset.seconds,
      effect: preset.effect,
      font: preset.font,
      x: preset.x,
      y: preset.y,
      size: preset.size,
      colour: COLOURS[0]
    }
    change({ ...edit, texts: [...edit.texts, text] })
    setPicked({ kind: 'text', id: text.id })
  }

  const film = edit ? filmLength(edit) : 0
  const slot = scratch ? edit?.clips.find((one) => one.id === SLOT) : undefined
  const badLength = typed !== null && !(Number(typed) >= LENGTH.min && Number(typed) <= LENGTH.max)
  const total = edit ? timelineEnd(edit) : 0
  const here = edit ? clipAt(edit, at) : null
  const blend = edit ? fadeAt(edit, at) : null
  const heardClip = here && here.clip.sound && sources.get(here.clip.name)?.sound
  const spans = edit ? heardSpans(edit, (clip) => sources.get(clip.name)?.sound === true) : []
  const loudest = edit
    ? Math.max(
        0,
        ...edit.music
          .filter((piece) => at >= piece.at && at < piece.at + piece.end - piece.start)
          .map((piece) => musicLevelAt(piece, edit.underSound, spans, at, edit.music))
      )
    : 0
  const heard = heardClip
    ? loudest > 0
      ? t`Camera sound · music ${Math.round(loudest * 100)}%`
      : t`Camera sound`
    : loudest > 0
      ? t`Music ${Math.round(loudest * 100)}%`
      : t`No sound`
  const opened = part && edit ? edit.clips.find((clip) => clip.id === part) : undefined
  const openedSource = opened && sources.get(opened.name)

  return (
    <main
      ref={root}
      aria-label={t`Film editor`}
      onPointerDownCapture={() => {
        joined.current = false
        held.current = true
      }}
      onPointerUp={() => (held.current = false)}
      onPointerCancel={() => (held.current = false)}
      tabIndex={-1}
      className={`flex h-dvh flex-col bg-ground text-ink ${cornered ? 'overflow-hidden rounded-corner' : ''}`}>
      <header className='flex h-13 flex-none items-center gap-3 border-b border-line bg-pane px-4'>
        <h2 className='m-0 flex min-w-0 items-center gap-2 truncate text-body font-normal text-ink-2'>
          <span className='max-desk:hidden'>{scratch ? t`Film templates` : t`Montages`}</span>
          <span className='text-ink-3 max-desk:hidden'>/</span>
          <strong className='truncate font-semibold text-ink'>
            {loaded ? loaded.title : t`Film editor`}
          </strong>
          {day && <span className='max-desk:hidden'>· {day}</span>}
        </h2>
        <span className='text-small text-ink-3'>
          {saving === 'saved' ? t`Saved` : saving === 'failed' ? t`Not saved` : t`Saving…`}
        </span>
        <span className='flex-1' />
        {rendering ? (
          <span className='flex items-center gap-1.5 text-small text-ink-3'>
            <span>
              {followed
                ? t`Rendering the film · ${Math.round(partOf(followed) * 100)}%`
                : t`A render is running`}
            </span>
            {stopRender && <StopButton stop={stopRender} />}
          </span>
        ) : followed ? (
          <span className='text-small text-local'>{followed.reason}</span>
        ) : renderSeen ? (
          <span className='text-small text-up'>{t`The film is rendered`}</span>
        ) : null}
        <Mini
          disabled={history.length === 0}
          title={t`Undo (Ctrl+Z)`}
          onClick={undo}>
          {t`Undo`}
        </Mini>
        <Mini
          keys='?'
          title={t`Shortcuts (?)`}
          onClick={() => setHelp(true)}>
          {t`Shortcuts`}
        </Mini>
        {edit && loaded && !scratch && (
          <Mini onClick={() => setTemplating(true)}>{t`Film template…`}</Mini>
        )}
        {!scratch && (
          <Go
            disabled={!edit || edit.clips.length === 0}
            title={t`Choose the format of the film, then render it`}
            onClick={() => {
              setPicked(null)
              setRenderOpen(true)
            }}>
            <Icon
              name='download'
              size={14}
            />
            {t`Render…`}
          </Go>
        )}
        <button
          type='button'
          title={t`Close (Esc)`}
          aria-label={t`Close`}
          onClick={() => void close()}
          className='tool-button'>
          <Icon name='close' />
        </button>
      </header>

      {problem && (
        <div className='flex items-center gap-3 bg-local-soft px-4 py-2 text-body text-local'>
          <span className='flex-1'>{problem}</span>
          <Mini onClick={() => setProblem(null)}>{t`Dismiss`}</Mini>
        </div>
      )}
      {changedClips.gone.length + changedClips.shorter.length > 0 && (
        <div className='flex flex-col gap-1 bg-local-soft px-4 py-2 text-body text-local'>
          {changedClips.gone.length > 0 && (
            <span>{t`Not in the montage any more: ${changedClips.gone.join(', ')} — take it out of the film, or process the montage again.`}</span>
          )}
          {changedClips.shorter.length > 0 && (
            <span>{t`Shorter than when it was put in the film: ${changedClips.shorter.join(', ')} — look at its part again.`}</span>
          )}
        </div>
      )}

      {edit && loaded ? (
        <div className='flex min-h-0 flex-1 flex-col max-wide:overflow-y-auto'>
          <div className='grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_270px] overflow-auto max-wide:flex-none max-wide:grid-cols-2 max-wide:overflow-visible max-desk:grid-cols-1'>
            <Library
              tab={tab}
              onTab={setTab}
              sources={loaded.sources}
              music={loaded.music}
              images={loaded.images}
              title={scratch ? NAME_TOKEN : loaded.title}
              onAddImage={(name) => addLayer({ name, width: PICTURE_WIDTH })}
              onAddBackground={(colour) => addLayer({ colour, width: 1 })}
              scratch={scratch}
              onAddClip={(name) => addClip(name)}
              onAddMusic={addMusic}
              onAddText={addText}
              onMusicArrived={() => setReadAgain(readAgain + 1)}
            />
            <div className='flex min-h-0 min-w-0 flex-col justify-center bg-well max-wide:order-first max-wide:h-[40vh] max-wide:min-h-72 max-wide:col-span-2 max-wide:border-b max-wide:border-line max-desk:col-span-1'>
              <FilmPreview
                edit={edit}
                at={at}
                upright={upright}
                picked={picked?.kind === 'text' ? picked.id : null}
                heard={heard}
                blank={!here}
                mix={blend?.mix ?? (here ? clipLevelAt(edit.clips, here.index, at - here.from) : 1)}
                fading={blend !== null}
                evenFront={front === 0}
                onReady={settle}
                framed={picked?.kind === 'text'}
                videoRef={video}
                underRef={under}
                images={loaded?.images ?? []}
                pickedLayer={picked?.kind === 'layer' ? picked.id : null}
                onPickLayer={(id) => setPicked({ kind: 'layer', id })}
                onMoveLayer={(id, x, y) => change(moveLook(edit, { kind: 'layer', id }, x, y))}
                onPickText={(id) => setPicked({ kind: 'text', id })}
                onMoveText={(id, x, y) => change(moveLook(edit, { kind: 'text', id }, x, y))}
                onShape={(tall) => here?.index === 0 && setUpright(tall)}
              />
              <div className='flex flex-none items-center justify-center gap-3 px-4 py-2'>
                <button
                  type='button'
                  aria-label={t`Previous clip`}
                  onClick={() =>
                    seek(
                      boundaries(edit)
                        .filter((start) => start < at - 0.2)
                        .at(-1) ?? 0
                    )
                  }
                  className='grid size-8 place-items-center rounded-full border border-line-strong bg-pane text-ink-2'>
                  <Icon
                    name='skipBack'
                    size={14}
                  />
                </button>
                <button
                  type='button'
                  aria-label={playing ? t`Pause` : t`Play`}
                  title={t`Play or pause (Enter, Space)`}
                  aria-keyshortcuts='Enter Space'
                  onClick={() => setPlaying(!playing)}
                  className='grid size-9.5 place-items-center rounded-full bg-ink text-pane'>
                  <Icon
                    name={playing ? 'pause' : 'play'}
                    size={14}
                  />
                </button>
                <button
                  type='button'
                  aria-label={t`Next clip`}
                  onClick={() => seek(boundaries(edit).find((start) => start > at + 0.01) ?? total)}
                  className='grid size-8 place-items-center rounded-full border border-line-strong bg-pane text-ink-2'>
                  <Icon
                    name='skipNext'
                    size={14}
                  />
                </button>
                <span className='min-w-23 text-center font-mono text-body tabular-nums'>
                  {`${clockOf(at)} / ${clockOf(total)}`}
                </span>
                {(here ? (sources.get(here.clip.name)?.marks ?? []) : [])
                  .filter((mark) => mark.at >= here!.clip.start && mark.at <= here!.clip.end)
                  .map((mark) => (
                    <Mini
                      key={mark.which}
                      title={t`Go to this mark`}
                      onClick={() =>
                        seek(here!.from + (mark.at - here!.clip.start) / speedOf(here!.clip))
                      }>
                      {markName(mark.which)}
                    </Mini>
                  ))}
              </div>
            </div>
            <Inspector
              edit={edit}
              picked={picked}
              also={also}
              sources={sources}
              formats={loaded?.formats ?? ['h264']}
              ripple={ripple}
              scratch={scratch}
              renderOpen={renderOpen}
              rendering={rendering}
              again={Boolean(loaded?.film)}
              onChange={change}
              onOpenPart={setPartOf}
              onRemove={removePicked}
              onRender={() => void render()}
              onBack={() => setRenderOpen(false)}
            />
          </div>
          <div
            role='separator'
            aria-orientation='horizontal'
            aria-label={t`Height of the timeline`}
            aria-valuenow={timelineHeight}
            aria-valuemin={TIMELINE_HEIGHT.least}
            aria-valuemax={TIMELINE_HEIGHT.most}
            tabIndex={0}
            onKeyDown={(e) => {
              const by =
                e.key === 'ArrowUp'
                  ? TIMELINE_HEIGHT.step
                  : e.key === 'ArrowDown'
                    ? -TIMELINE_HEIGHT.step
                    : 0
              if (by) {
                e.preventDefault()
                setTimelineHeight(resizedTimeline(timelineHeight + by))
              }
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              const bar = e.currentTarget
              bar.setPointerCapture(e.pointerId)
              const [y0, h0] = [e.clientY, timelineHeight]
              const move = (event: PointerEvent) =>
                setTimelineHeight(resizedTimeline(h0 + y0 - event.clientY))
              const stop = () => {
                bar.removeEventListener('pointermove', move)
                bar.removeEventListener('pointerup', stop)
                bar.removeEventListener('pointercancel', stop)
              }
              bar.addEventListener('pointermove', move)
              bar.addEventListener('pointerup', stop)
              bar.addEventListener('pointercancel', stop)
            }}
            className='h-1.5 flex-none cursor-row-resize touch-none bg-well hover:bg-line focus-visible:bg-accent-soft'
          />
          <div
            style={{ height: timelineHeight }}
            className='flex flex-none flex-col border-t border-line'>
            <div className='flex min-h-12 flex-none flex-wrap items-center gap-1.5 border-b border-line bg-pane px-2.5 py-1.5'>
              <Mini
                pressed
                title={t`Select (the tool the editor is always in)`}>
                <Icon
                  name='select'
                  size={13}
                />
                {t`Select`}
              </Mini>
              <Mini
                disabled={!cut}
                title={hint(t`Cut at playhead`, 'cut')}
                keys={shortcuts('cut')}
                onClick={cutHere}>
                <Icon
                  name='scissors'
                  size={13}
                />
                {t`Cut at playhead`}
              </Mini>
              <Mini
                disabled={
                  !picked ||
                  also.length === 0 ||
                  [picked, ...also].some((one) => one.kind === 'clip' || one.kind === 'music')
                }
                title={t`Shift-click texts and pictures on the timeline, then group them to move together`}
                onClick={() => {
                  if (edit && picked) {
                    change(
                      groupItems(edit, [{ kind: picked.kind, id: picked.id }, ...also] as Grouped[])
                    )
                    setAlso([])
                  }
                }}>
                {t`Group`}
              </Mini>
              <Mini
                disabled={!picked}
                keys={shortcuts('delete')}
                title={hint(t`Delete the picked item`, 'delete')}
                onClick={removePicked}>
                <Icon
                  name='bin'
                  size={13}
                />
                {t`Delete`}
              </Mini>
              <Mini
                disabled={scratch}
                title={hint(
                  t`Add a marker at the playhead, on the picked clip or piece of music`,
                  'marker'
                )}
                keys={shortcuts('marker')}
                onClick={markHere}>
                <Icon
                  name='plus'
                  size={13}
                />
                {t`Marker`}
              </Mini>
              <Mini
                pressed={fading || musicFading}
                disabled={pickedMusic ? musicBlocked !== null : blocked !== null}
                keys={shortcuts('fade')}
                title={hint(
                  pickedMusic
                    ? musicBlocked !== null
                      ? t`There is no piece of music before this one to fade from`
                      : t`Fade the picked piece in over the end of the piece before it`
                    : pickedId
                      ? fadeWhy(blocked)
                      : t`Pick a clip or a piece of music to fade it in over the one before it`,
                  'fade'
                )}
                onClick={fadeHere}>
                <Icon
                  name='fade'
                  size={13}
                />
                {t`Fade in`}
              </Mini>
              <span className='h-4.5 w-px flex-none bg-line' />
              <Mini
                pressed={ripple}
                keys={shortcuts('ripple')}
                title={hint(
                  t`Changing the video pulls the text and the music after it along`,
                  'ripple'
                )}
                onClick={() => setRipple(!ripple)}>
                {t`Ripple`}
              </Mini>
              <Mini
                pressed={snap}
                keys={shortcuts('snap')}
                title={hint(
                  t`Snap texts and music to the playhead, the cuts, the jump marks and each other, and a trimmed clip edge to the jump marks`,
                  'snap'
                )}
                onClick={() => setSnap(!snap)}>
                {t`Snap`}
              </Mini>
              <span className='flex-1' />
              {slot && (
                <>
                  <label className='inline-flex items-center gap-1.5 text-small text-ink-3'>
                    {t`Film length (seconds)`}
                    <input
                      type='number'
                      min={LENGTH.min}
                      max={LENGTH.max}
                      step={1}
                      value={typed ?? String(slot.end)}
                      aria-invalid={badLength}
                      onChange={(e) => {
                        setTyped(e.target.value)
                        const seconds = Math.round(Number(e.target.value))
                        if (seconds >= LENGTH.min && seconds <= LENGTH.max)
                          change({
                            ...edit,
                            clips: edit.clips.map((one) =>
                              one.id === SLOT ? { ...one, end: seconds } : one
                            )
                          })
                      }}
                      onBlur={() => setTyped(null)}
                      className='h-control-sm w-20 rounded-corner border border-line-strong bg-pane px-2 text-body text-ink aria-invalid:border-local'
                    />
                  </label>
                  {badLength && (
                    <span
                      role='alert'
                      className='text-small text-local'>
                      {t`Between ${LENGTH.min} and ${LENGTH.max} seconds`}
                    </span>
                  )}
                </>
              )}
              <label className='inline-flex items-center gap-1.5 text-small text-ink-3'>
                {t`Zoom`}
                <input
                  type='range'
                  aria-label={t`Zoom the timeline`}
                  min={ZOOM.min}
                  max={ZOOM.max}
                  step={1}
                  value={pps}
                  onChange={(e) => setPps(Number(e.target.value))}
                  className='w-24 accent-accent'
                />
              </label>
            </div>
            <FilmTimeline
              edit={edit}
              sources={sources}
              music={music}
              pps={pps}
              at={at}
              picked={picked}
              also={also}
              snap={snap}
              ripple={ripple}
              onSeek={seek}
              onZoom={setPps}
              onPick={setPicked}
              onAlso={(item) =>
                setAlso((now) =>
                  item === null
                    ? []
                    : now.some((one) => one.kind === item.kind && one.id === item.id)
                      ? now.filter((one) => !(one.kind === item.kind && one.id === item.id))
                      : [...now, item]
                )
              }
              onChange={change}
              onOpenPart={setPartOf}
              onDropClip={(name, index) => addClip(name, index)}
            />
            <div className='flex flex-none flex-wrap gap-4 border-t border-line bg-pane px-3 py-2 text-small text-ink-3'>
              <span>
                {t`Film`} <b className='font-mono font-medium text-ink-2'>{clockOf(film)}</b>
              </span>
              <span>
                {scratch
                  ? t`Texts and music that end with the film stay at the end, whatever its length.`
                  : t`Edited on the proxies, rendered from the processed copies`}
              </span>
            </div>
          </div>
          {edit.music.map((piece) => {
            const source = music.get(piece.name)
            return source ? (
              <audio
                key={piece.id}
                ref={(element) => {
                  if (element) sounds.current.set(piece.id, element)
                  else sounds.current.delete(piece.id)
                }}
                src={getFileUrl(source.path)}
                preload='auto'
              />
            ) : null
          })}
        </div>
      ) : (
        !problem && (
          <p className='grid flex-1 place-items-center text-body text-ink-3'>{t`Opening the film…`}</p>
        )
      )}

      {help && (
        <FilmShortcuts
          scratch={scratch}
          onClose={() => setHelp(false)}
        />
      )}

      {starting && (
        <FilmTemplatePicker
          templates={starting}
          onChoose={startFrom}
        />
      )}

      {templating && edit && (
        <FilmTemplateModal
          edit={edit}
          who={{ name: loaded?.title ?? '', day: day ?? '' }}
          onApply={(next) => {
            joined.current = false
            setPicked(null)
            change(next)
          }}
          onClose={() => setTemplating(false)}
        />
      )}

      {opened && openedSource && (
        <FilmPart
          clip={opened}
          source={openedSource}
          onClose={() => setPartOf(null)}
          onRemove={() => {
            if (edit) change(removeClip(edit, opened.id, ripple))
            setPartOf(null)
            setPicked(null)
          }}
          onPlace={({ start, end, speed, frame, rotation }) => {
            if (edit) {
              const trimmed = setPart(edit, opened.id, start, end, ripple)
              const sped =
                speed === speedOf(opened) ? trimmed : setSpeed(trimmed, opened.id, speed, ripple)
              const framed = setClipFrame(sped, opened.id, frame, rotation)
              change(framed)
              const here = placed(framed).find((one) => one.clip.id === opened.id)
              if (here) seek(here.from)
            }
            setPartOf(null)
          }}
        />
      )}
    </main>
  )
}

export { FilmEditor }
