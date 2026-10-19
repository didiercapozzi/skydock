import { plural, t } from '@lingui/core/macro'
import {
  applyTemplate,
  captureTemplate,
  DAY_TOKEN,
  editAnswerSchema,
  fadeInto,
  filmLength,
  filmTemplatesAnswerSchema,
  heardSpans,
  musicLevelAt,
  NAME_TOKEN,
  SLOT,
  slotEdit,
  STILL_SECONDS,
  TEXT_FADE
} from '@skydock/scripts/client'
import type {
  EditSource,
  EditText,
  FilmEdit,
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
  insertClip,
  nextId,
  placeClip,
  placed,
  removeClip,
  setFade,
  setPart,
  splitClip,
  timelineEnd,
  TILE_LOOP,
  trimClip
} from '../helpers/filmTimeline'
import { refusalSchema } from '../hooks/useBoardState'
import { useRoundedWindow } from '../hooks/useWindowFrame'
import { routingEngine } from '../helpers/routing'
import { Go, Mini } from './buttons'
import { FilmPart } from './film-part'
import { askFilmTemplates, FilmTemplateModal, FilmTemplatePicker } from './film-template-modals'
import type { Listed } from './film-template-modals'
import { FONT_LOOK, FilmPreview } from './film-preview'
import { CLIP_DRAG, FilmTimeline, markName, ZOOM } from './film-timeline'
import type { Picked } from './film-timeline'
import { Icon } from './icons'
import type { Placed } from '../helpers/filmTimeline'
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
type Library = 'clips' | 'music' | 'text'

const LENGTH = { min: 5, max: 3600 }
const SAVE_AFTER = 700
const DRIFT = 0.3
const SEEK_EPS = 0.001
const CUE_WITHIN = 5
const MUSIC_VOLUME = 0.8
const SHORTEST_MUSIC = 5
const UNDOABLE = 50
const ONE_CHANGE = 400

const musicAnswerSchema = z.object({ ok: z.boolean(), error: z.string().optional() })

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
        else e.currentTarget.value = clockOf(value)
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

const Library = ({
  tab,
  onTab,
  sources,
  music,
  title,
  scratch,
  onAddClip,
  onAddMusic,
  onAddText,
  onMusicArrived
}: {
  tab: Library
  onTab: (tab: Library) => void
  sources: EditSource[]
  music: MusicSource[]
  title: string
  scratch: boolean
  onAddClip: (name: string) => void
  onAddMusic: (name: string) => void
  onAddText: (preset: (typeof PRESETS)[number]) => void
  onMusicArrived: () => void
}) => {
  const [bringing, setBringing] = useState<string | null>(null)
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

const Inspector = ({
  edit,
  picked,
  sources,
  ripple,
  scratch,
  onChange,
  onOpenPart,
  onRemove
}: {
  edit: FilmEdit
  picked: Picked
  sources: Map<string, EditSource>
  ripple: boolean
  scratch: boolean
  onChange: (edit: FilmEdit) => void
  onOpenPart: (id: string) => void
  onRemove: () => void
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
  const clip = picked?.kind === 'clip' ? edit.clips.find((one) => one.id === picked.id) : undefined
  const fade = clip ? fadeInto(edit.clips, edit.clips.indexOf(clip)) : 0
  const piece =
    picked?.kind === 'music' ? edit.music.find((one) => one.id === picked.id) : undefined
  const text = picked?.kind === 'text' ? edit.texts.find((one) => one.id === picked.id) : undefined
  const changeText = (change: Partial<EditText>) =>
    text &&
    onChange({
      ...edit,
      texts: edit.texts.map((one) => (one.id === text.id ? { ...one, ...change } : one))
    })
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
                      value={clip.end - clip.start}
                      onCommit={(seconds) => trim('end', clip.start + seconds)}
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
            {under}
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
            {remove}
          </>
        )}
        {!clip && !piece && !text && (
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
  const [tab, setTab] = useState<Library>('clips')
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(12)
  const [upright, setUpright] = useState(false)
  const [part, setPartOf] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [readAgain, setReadAgain] = useState(0)
  const [starting, setStarting] = useState<Listed | null>(null)
  const [templating, setTemplating] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)
  const [history, setHistory] = useState<FilmEdit[]>([])
  const [ripple, setRipple] = useState(true)
  const [snap, setSnap] = useState(true)
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

  const sources = new Map((loaded?.sources ?? []).map((one) => [one.name, one]))
  const music = new Map((loaded?.music ?? []).map((one) => [one.name, one]))

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
    apply(scratch && was ? slotKept(was, next) : next)
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
    else {
      if (!offered.success) setProblem(t`The film templates could not be read.`)
      void save('save')
    }
  }

  const startFrom = (name: string | null) => {
    const chosen = starting?.find((one) => one.name === name)?.template
    const first = latest.current
    setStarting(null)
    if (!chosen || !first) return void save('save')
    const {
      edit: next,
      left,
      cut
    } = applyTemplate(first, chosen, {
      name: loaded?.title ?? '',
      day: day ?? '',
      music: loaded?.music ?? []
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
        setRendering(parsed.data.rendering)
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

  const drive = (
    player: HTMLVideoElement | null,
    one: Placed | null,
    level: number,
    t: number,
    rolling: boolean
  ) => {
    const source = one && sources.get(one.clip.name)
    if (player && one && source?.still) {
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
      const want = one.clip.start + Math.min(t, one.to) - one.from
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
      const want = one.clip.start + Math.min(at, one.to) - one.from
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
    const deck = lead ? put(lead, blend?.mix ?? 1, t, rolling, shown.current) : -1
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
          Math.max(0, musicLevelAt(piece.volume, current.underSound, spans, t))
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

  const close = async () => {
    setPlaying(false)
    if (timer.current) await save('save')
    onClose()
  }

  const render = async () => {
    setPlaying(false)
    if (await save('render')) {
      setRendering(true)
      onClose()
    }
  }

  const undo = () => {
    const before = history.at(-1)
    if (!before) return
    setHistory(history.slice(0, -1))
    joined.current = false
    setPicked((now) =>
      now && [...before.clips, ...before.music, ...before.texts].some((one) => one.id === now.id)
        ? now
        : null
    )
    apply(before)
  }

  const removePicked = () => {
    if (!edit || !picked) return
    joined.current = false
    if (picked.kind === 'clip') change(removeClip(edit, picked.id, ripple))
    if (picked.kind === 'music')
      change({ ...edit, music: edit.music.filter((one) => one.id !== picked.id) })
    if (picked.kind === 'text')
      change({ ...edit, texts: edit.texts.filter((one) => one.id !== picked.id) })
    setPicked(null)
  }

  const cut = edit && !scratch ? splitClip(edit, at) : null

  const pickedId = picked?.kind === 'clip' ? picked.id : null
  const blocked = edit && pickedId ? fadeBlock(edit, pickedId) : 'first'
  const fading = Boolean(
    edit &&
    fadeInto(
      edit.clips,
      edit.clips.findIndex((clip) => clip.id === pickedId)
    )
  )

  const fadeHere = () => {
    if (!edit || !pickedId) return
    joined.current = false
    change(setFade(edit, pickedId, fading ? 0 : FADE.default, ripple))
  }

  const cutHere = () => {
    if (!cut) return
    joined.current = false
    change(cut)
  }

  const keys = (e: React.KeyboardEvent) => {
    const typing =
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLInputElement && !['range', 'checkbox'].includes(e.target.type))
    const control =
      typing || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement
    if (e.key === 'Escape' && !part) {
      e.stopPropagation()
      void close()
    }
    if (typing) return
    if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      undo()
    }
    if (control) return
    if (
      e.altKey &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      edit &&
      picked?.kind === 'clip'
    ) {
      e.preventDefault()
      const from = placed(edit).find((one) => one.clip.id === picked.id)?.from ?? 0
      const by = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1)
      change(placeClip(edit, picked.id, Math.round((from + by) * 1000) / 1000, ripple))
    }
    if (e.key === ' ') {
      e.preventDefault()
      setPlaying(!playing)
    }
    if (e.key === 'Delete' || e.key === 'Backspace') removePicked()
    if (
      e.key.toLowerCase() === 'c' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.repeat
    )
      cutHere()
  }

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
          .map((piece) => musicLevelAt(piece.volume, edit.underSound, spans, at))
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
      onKeyDown={keys}
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
        {rendering && <span className='text-small text-ink-3'>{t`A render is running`}</span>}
        <Mini
          disabled={history.length === 0}
          title={t`Undo (Ctrl+Z)`}
          onClick={undo}>
          {t`Undo`}
        </Mini>
        {edit && loaded && !scratch && (
          <Mini onClick={() => setTemplating(true)}>{t`Film template…`}</Mini>
        )}
        {!scratch && (
          <Go
            disabled={!edit || edit.clips.length === 0 || rendering}
            title={t`Render the film into the montage’s folder: MP4, H.264 and AAC, from the processed copies`}
            onClick={() => void render()}>
            <Icon
              name='download'
              size={14}
            />
            {loaded?.film ? t`Render again` : t`Render the film`}
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

      {edit && loaded ? (
        <div className='flex min-h-0 flex-1 flex-col max-wide:overflow-y-auto'>
          <div className='grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_270px] overflow-auto max-wide:flex-none max-wide:grid-cols-2 max-wide:overflow-visible max-desk:grid-cols-1'>
            <Library
              tab={tab}
              onTab={setTab}
              sources={loaded.sources}
              music={loaded.music}
              title={scratch ? NAME_TOKEN : loaded.title}
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
                mix={blend?.mix ?? 1}
                fading={blend !== null}
                evenFront={front === 0}
                onReady={settle}
                framed={picked?.kind === 'text'}
                videoRef={video}
                underRef={under}
                onPickText={(id) => setPicked({ kind: 'text', id })}
                onMoveText={(id, x, y) =>
                  change({
                    ...edit,
                    texts: edit.texts.map((text) => (text.id === id ? { ...text, x, y } : text))
                  })
                }
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
                  title={t`Play or pause (Space)`}
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
                      onClick={() => seek(here!.from + mark.at - here!.clip.start)}>
                      {markName(mark.which)}
                    </Mini>
                  ))}
              </div>
            </div>
            <Inspector
              edit={edit}
              picked={picked}
              sources={sources}
              ripple={ripple}
              scratch={scratch}
              onChange={change}
              onOpenPart={setPartOf}
              onRemove={removePicked}
            />
          </div>
          <div className='flex h-80 flex-none flex-col border-t border-line'>
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
                title={t`Cut at playhead (C)`}
                onClick={cutHere}>
                <Icon
                  name='scissors'
                  size={13}
                />
                {t`Cut at playhead`}
              </Mini>
              <Mini
                disabled={!picked}
                onClick={removePicked}>
                <Icon
                  name='bin'
                  size={13}
                />
                {t`Delete`}
              </Mini>
              <Mini
                pressed={fading}
                disabled={blocked !== null}
                title={
                  pickedId ? fadeWhy(blocked) : t`Pick a clip to fade it in over the one before it`
                }
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
                title={t`Changing the video pulls the text and the music after it along`}
                onClick={() => setRipple(!ripple)}>
                {t`Ripple`}
              </Mini>
              <Mini
                pressed={snap}
                title={t`Snap texts and music to the playhead, the cuts, the jump marks and each other, and a trimmed clip edge to the jump marks`}
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
              snap={snap}
              ripple={ripple}
              onSeek={seek}
              onZoom={setPps}
              onPick={setPicked}
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
          onPlace={(start, end) => {
            if (edit) change(setPart(edit, opened.id, start, end, ripple))
            setPartOf(null)
          }}
        />
      )}
    </main>
  )
}

export { FilmEditor }
