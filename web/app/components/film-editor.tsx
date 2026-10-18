import { plural, t } from '@lingui/core/macro'
import { editAnswerSchema, filmLength, heardSpans, musicLevelAt } from '@skydock/scripts/client'
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
import { clipAt, clockOf, insertClip, nextId, removeClip, setPart } from '../helpers/filmTimeline'
import { routingEngine } from '../helpers/routing'
import { Go, Mini, Seg } from './buttons'
import { FilmPart } from './film-part'
import { FilmPreview } from './film-preview'
import { CLIP_DRAG, FilmTimeline, markName } from './film-timeline'
import type { Picked } from './film-timeline'
import { FileRow, Thumb } from './file-row'
import { Icon } from './icons'
import { getFileUrl, getThumbUrl } from './utils'

type Loaded = Extract<z.infer<typeof editAnswerSchema>, { ok: true }>
type Library = 'clips' | 'music' | 'text'

const SAVE_AFTER = 700
const DRIFT = 0.3
const MUSIC_VOLUME = 0.8
const SHORTEST_MUSIC = 5
const ZOOM = { min: 2, max: 80 }

const refusalSchema = z.object({
  success: z.literal(false),
  globalErrors: z.array(z.string()).optional()
})

const musicAnswerSchema = z.object({ ok: z.boolean(), error: z.string().optional() })

const COLOURS = ['#ffffff', '#ffd84d', '#ff8a5c', '#7fd3ff', '#0f2f47'] as const

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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className='flex flex-col gap-1.5'>
    <span className='eyebrow'>{label}</span>
    {children}
  </label>
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
    <span className='flex items-center gap-3'>
      <input
        type='range'
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className='min-w-0 flex-1 accent-accent'
      />
      <span className='w-12 text-right text-small text-ink-2 tabular-nums'>{shown}</span>
    </span>
  </Field>
)

const Library = ({
  tab,
  onTab,
  sources,
  music,
  title,
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
    <aside className='flex min-h-0 flex-col border-r border-line bg-pane'>
      <div className='p-3'>
        <Seg
          label={t`Library`}
          value={tab}
          wide
          options={[
            ['clips', t`Clips`],
            ['music', t`Music`],
            ['text', t`Text`]
          ]}
          onPick={onTab}
        />
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 pb-3'>
        {tab === 'clips' && (
          <>
            <p className='text-small text-ink-3'>
              {t`Drag a clip onto the video track, between two clips or at either end.`}
            </p>
            {sources.map((source) => (
              <FileRow
                key={source.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(CLIP_DRAG, source.name)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                picture={
                  <Thumb src={getThumbUrl(source.play, Math.min(1, source.seconds / 2), 160)} />
                }
                name={source.name}
                nameTitle={source.name}
                meta={
                  <>
                    <span>{clockOf(source.seconds)}</span>
                    {source.marks.length > 0 && (
                      <span>
                        {plural(source.marks.length, { one: '# mark', other: '# marks' })}
                      </span>
                    )}
                  </>
                }
                trailing={
                  <Mini
                    title={t`Put it at the end of the film`}
                    onClick={() => onAddClip(source.name)}>
                    {t`Add`}
                  </Mini>
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
              <FileRow
                key={piece.name}
                picture={
                  <Icon
                    name='music'
                    size={18}
                    className='text-ink-3'
                  />
                }
                name={piece.name}
                nameTitle={piece.name}
                meta={<span>{clockOf(piece.seconds)}</span>}
                trailing={<Mini onClick={() => onAddMusic(piece.name)}>{t`Add`}</Mini>}
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
            {PRESETS.map((preset) => (
              <button
                key={preset.name()}
                type='button'
                onClick={() => onAddText(preset)}
                className='flex h-16 items-center justify-between rounded-corner bg-stage px-4 text-left text-paper shadow-card hover:shadow-ring'>
                <span
                  className={
                    preset.font === 'bold'
                      ? 'font-bold'
                      : preset.font === 'hand'
                        ? 'film-hand'
                        : 'font-medium'
                  }>
                  {preset.title ? title : preset.name()}
                </span>
                <span className='text-micro text-paper/70'>
                  {EFFECTS().find(([effect]) => effect === preset.effect)?.[1]}
                </span>
              </button>
            ))}
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
  onChange,
  onOpenPart,
  onRemove
}: {
  edit: FilmEdit
  picked: Picked
  sources: Map<string, EditSource>
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
    <aside className='flex min-h-0 flex-col gap-5 overflow-auto border-l border-line bg-pane p-4'>
      {clip && (
        <>
          <h3 className='m-0 truncate text-lead font-bold'>{clip.name}</h3>
          <p className='text-body text-ink-2 tabular-nums'>
            {t`From ${clockOf(clip.start)} to ${clockOf(clip.end)} of the clip`}
          </p>
          <Mini onClick={() => onOpenPart(clip.id)}>
            <Icon
              name='scissors'
              size={13}
            />
            {t`Choose the part…`}
          </Mini>
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
          <Field label={t`Effect`}>
            <span className='grid grid-cols-2 gap-1.5'>
              {EFFECTS().map(([effect, name]) => (
                <Mini
                  key={effect}
                  pressed={text.effect === effect}
                  onClick={() => changeText({ effect })}>
                  {name}
                </Mini>
              ))}
            </span>
          </Field>
          <Field label={t`Font`}>
            <span className='grid grid-cols-2 gap-1.5'>
              {FONTS().map(([font, name]) => (
                <Mini
                  key={font}
                  pressed={text.font === font}
                  onClick={() => changeText({ font })}>
                  {name}
                </Mini>
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
                  className={`size-7 rounded-full ${
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
            {t`${plural(edit.clips.length, { one: '# clip', other: '# clips' })} · ${clockOf(filmLength(edit))}`}
          </p>
          <p className='text-small text-ink-3'>
            {t`Pick a clip, a piece of music or a text on the timeline to change it. Double-click a clip to choose its part.`}
          </p>
          {under}
        </>
      )}
    </aside>
  )
}

const FilmEditor = ({ groupId, onClose }: { groupId: string; onClose: () => void }) => {
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
  const video = useRef<HTMLVideoElement>(null)
  const sounds = useRef(new Map<string, HTMLAudioElement>())
  const latest = useRef<FilmEdit | null>(null)
  const now = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sources = new Map((loaded?.sources ?? []).map((one) => [one.name, one]))
  const music = new Map((loaded?.music ?? []).map((one) => [one.name, one]))

  const save = async (intent: 'save' | 'render') => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const current = latest.current
    if (!current) return false
    setSaving('saving')
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

  const change = (next: FilmEdit) => {
    latest.current = next
    setEditNow(next)
    setSaving('waiting')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save('save'), SAVE_AFTER)
  }

  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/edit', searchParamsArgs: { groupId } })
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
              Math.max(ZOOM.min, room / Math.max(10, filmLength(parsed.data.edit)))
            )
          )
          if (!parsed.data.saved) void save('save')
        }
      })
      .catch(() => {
        if (!cancelled) setProblem(t`The film could not be read.`)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, readAgain])

  const sync = (t: number, rolling: boolean) => {
    const current = latest.current
    if (!current) return
    const here = clipAt(current, t)
    const player = video.current
    const source = here && sources.get(here.clip.name)
    if (player && here && source) {
      const url = getFileUrl(source.play)
      if (player.dataset.src !== url) {
        player.dataset.src = url
        player.src = url
      }
      const want = here.clip.start + Math.min(t, here.to) - here.from
      if (!rolling || Math.abs(player.currentTime - want) > DRIFT) player.currentTime = want
      player.muted = !(here.clip.sound && source.sound)
      if (rolling && player.paused) void player.play().catch(() => undefined)
      if (!rolling && !player.paused) player.pause()
    }
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

  const seek = (t: number) => {
    const total = latest.current ? filmLength(latest.current) : 0
    now.current = Math.min(Math.max(0, t), total)
    setAt(now.current)
    sync(now.current, playing)
  }

  useEffect(() => {
    if (!playing) return
    const total = latest.current ? filmLength(latest.current) : 0
    if (now.current >= total - 0.05) now.current = 0
    let last = performance.now()
    let frame = 0
    const tick = (time: number) => {
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
      sync(now.current, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

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

  const removePicked = () => {
    if (!edit || !picked) return
    if (picked.kind === 'clip') change(removeClip(edit, picked.id))
    if (picked.kind === 'music')
      change({ ...edit, music: edit.music.filter((one) => one.id !== picked.id) })
    if (picked.kind === 'text')
      change({ ...edit, texts: edit.texts.filter((one) => one.id !== picked.id) })
    setPicked(null)
  }

  const keys = (e: React.KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    if (e.key === 'Escape' && !part) {
      e.stopPropagation()
      void close()
    }
    if (typing) return
    if (e.key === ' ') {
      e.preventDefault()
      setPlaying(!playing)
    }
    if (e.key === 'Delete' || e.key === 'Backspace') removePicked()
  }

  const addClip = (name: string, index?: number) => {
    const source = sources.get(name)
    if (!edit || !source) return
    const clip = {
      id: nextId('clip', edit.clips),
      name,
      start: 0,
      end: source.seconds,
      sound: false
    }
    change(insertClip(edit, index ?? edit.clips.length, clip))
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
      text: preset.title ? (loaded?.title ?? '') : t`Your text`,
      at: Math.min(at, Math.max(0, filmLength(edit) - preset.seconds)),
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

  const total = edit ? filmLength(edit) : 0
  const here = edit ? clipAt(edit, at) : null
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
    <div
      role='dialog'
      aria-modal='true'
      aria-label={t`Film editor`}
      onKeyDown={keys}
      tabIndex={-1}
      className='fixed inset-0 z-40 flex flex-col bg-ground text-ink'>
      <header className='flex h-14 flex-none items-center gap-3 border-b border-line bg-pane px-4'>
        <Icon
          name='montage'
          size={18}
          className='text-accent'
        />
        <h2 className='m-0 truncate text-title font-bold'>
          {loaded ? t`${loaded.title}’s film` : t`Film editor`}
        </h2>
        <span className='text-small text-ink-3'>
          {saving === 'saved' ? t`Saved` : saving === 'failed' ? t`Not saved` : t`Saving…`}
        </span>
        <span className='flex-1' />
        {rendering && <span className='text-small text-ink-3'>{t`A render is running`}</span>}
        <Go
          disabled={!edit || edit.clips.length === 0 || rendering}
          title={t`Render the film into the montage’s folder: MP4, H.264 and AAC, from the processed copies`}
          onClick={() => void render()}>
          <Icon
            name='upload'
            size={14}
            weight={2}
          />
          {loaded?.film ? t`Render again` : t`Render the film`}
        </Go>
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
        <>
          <div className='grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)_280px]'>
            <Library
              tab={tab}
              onTab={setTab}
              sources={loaded.sources}
              music={loaded.music}
              title={loaded.title}
              onAddClip={(name) => addClip(name)}
              onAddMusic={addMusic}
              onAddText={addText}
              onMusicArrived={() => setReadAgain(readAgain + 1)}
            />
            <div className='flex min-h-0 min-w-0 flex-col'>
              <FilmPreview
                edit={edit}
                at={at}
                upright={upright}
                picked={picked?.kind === 'text' ? picked.id : null}
                heard={heard}
                videoRef={video}
                onPickText={(id) => setPicked({ kind: 'text', id })}
                onMoveText={(id, x, y) =>
                  change({
                    ...edit,
                    texts: edit.texts.map((text) => (text.id === id ? { ...text, x, y } : text))
                  })
                }
                onShape={(tall) => here?.index === 0 && setUpright(tall)}
              />
              <div className='flex flex-none items-center gap-3 border-t border-line bg-pane px-4 py-2'>
                <button
                  type='button'
                  aria-label={playing ? t`Pause` : t`Play`}
                  title={t`Play or pause (Space)`}
                  onClick={() => setPlaying(!playing)}
                  className='grid size-9 place-items-center rounded-full bg-accent text-on-accent'>
                  <Icon
                    name={playing ? 'pause' : 'play'}
                    size={14}
                  />
                </button>
                <span className='text-body tabular-nums'>
                  {clockOf(at)} / {clockOf(total)}
                </span>
                <span className='flex-1' />
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
            </div>
            <Inspector
              edit={edit}
              picked={picked}
              sources={sources}
              onChange={change}
              onOpenPart={setPartOf}
              onRemove={removePicked}
            />
          </div>
          <div className='flex h-64 flex-none flex-col border-t border-line'>
            <FilmTimeline
              edit={edit}
              sources={sources}
              music={music}
              pps={pps}
              at={at}
              picked={picked}
              onSeek={seek}
              onPick={setPicked}
              onChange={change}
              onOpenPart={setPartOf}
              onDropClip={(name, index) => addClip(name, index)}
            />
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
        </>
      ) : (
        !problem && (
          <p className='grid flex-1 place-items-center text-body text-ink-3'>{t`Opening the film…`}</p>
        )
      )}

      {opened && openedSource && (
        <FilmPart
          clip={opened}
          source={openedSource}
          onClose={() => setPartOf(null)}
          onRemove={() => {
            if (edit) change(removeClip(edit, opened.id))
            setPartOf(null)
            setPicked(null)
          }}
          onPlace={(start, end) => {
            if (edit) change(setPart(edit, opened.id, start, end))
            setPartOf(null)
          }}
        />
      )}
    </div>
  )
}

export { FilmEditor }
