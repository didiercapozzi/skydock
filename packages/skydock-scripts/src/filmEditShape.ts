import { z } from 'zod'

const TEXT_EFFECTS = ['fade', 'rise', 'pop', 'lower-third'] as const
const TEXT_FONTS = ['clean', 'bold', 'elegant', 'hand'] as const
const MUSIC_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'] as const
const UNDER_SOUND = 0.15
const STILL_SECONDS = 5
const STILL_MAX = 60
const STILL_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
const TEXT_FADE = 0.6
const POP = 0.35
const DUCK_RAMP = 0.8

const seconds = z.number().min(0)
const fraction = z.number().min(0).max(1)

const editClipSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    start: seconds,
    end: seconds,
    sound: z.boolean(),
    gap: seconds.finite().optional(),
    fade: z.number().gt(0).finite().optional()
  })
  .refine((clip) => clip.end > clip.start, 'a clip ends after it starts')

const editMusicSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    at: seconds,
    start: seconds,
    end: seconds,
    volume: fraction
  })
  .refine((music) => music.end > music.start, 'a piece of music ends after it starts')

const editTextSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(200),
  at: seconds,
  seconds: z.number().min(0.5).max(60),
  effect: z.enum(TEXT_EFFECTS),
  font: z.enum(TEXT_FONTS),
  x: fraction,
  y: fraction,
  size: z.number().min(0.02).max(0.3),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/)
})

const filmEditSchema = z.object({
  version: z.literal(1),
  clips: z.array(editClipSchema),
  music: z.array(editMusicSchema),
  texts: z.array(editTextSchema),
  underSound: fraction
})

const editMarkSchema = z.object({
  which: z.enum(['exit', 'opening', 'canopy', 'landing']),
  at: seconds
})

const editSourceSchema = z.object({
  name: z.string(),
  path: z.string(),
  play: z.string(),
  seconds: z.number(),
  sound: z.boolean(),
  marks: z.array(editMarkSchema),
  still: z.boolean().optional()
})

const musicSourceSchema = z.object({
  name: z.string(),
  path: z.string(),
  seconds: z.number()
})

const editAnswerSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(false), reason: z.string() }),
  z.object({
    ok: z.literal(true),
    title: z.string(),
    edit: filmEditSchema,
    saved: z.boolean(),
    sources: z.array(editSourceSchema),
    music: z.array(musicSourceSchema),
    rendering: z.boolean(),
    film: z.string().nullable()
  })
])

type FilmEdit = z.infer<typeof filmEditSchema>
type EditClip = FilmEdit['clips'][number]
type EditMusic = FilmEdit['music'][number]
type EditText = FilmEdit['texts'][number]
type EditSource = z.infer<typeof editSourceSchema>
type MusicSource = z.infer<typeof musicSourceSchema>
type TextEffect = (typeof TEXT_EFFECTS)[number]
type TextFont = (typeof TEXT_FONTS)[number]
type Span = { from: number; to: number }

const clipLength = (clip: { start: number; end: number }) => clip.end - clip.start

const fadeInto = (clips: EditClip[], index: number) => {
  const clip = clips[index]
  const before = clips[index - 1]
  return clip?.fade && before && !clip.gap
    ? Math.min(clip.fade, clipLength(before) / 2, clipLength(clip) / 2)
    : 0
}

const filmLength = (edit: FilmEdit) =>
  edit.clips.reduce(
    (total, clip, index) =>
      total + (clip.gap ?? 0) - fadeInto(edit.clips, index) + clipLength(clip),
    0
  )

const timelineEnd = (edit: FilmEdit) =>
  Math.max(
    filmLength(edit),
    ...edit.texts.map((text) => text.at + text.seconds),
    ...edit.music.map((piece) => piece.at + piece.end - piece.start)
  )

const heardSpans = (edit: FilmEdit, heard: (clip: EditClip) => boolean) => {
  let at = 0
  const spans: Span[] = []
  for (const [index, clip] of edit.clips.entries()) {
    const length = clipLength(clip)
    at += (clip.gap ?? 0) - fadeInto(edit.clips, index)
    if (clip.sound && heard(clip)) {
      const last = spans.at(-1)
      if (last && at <= last.to + 0.001) last.to = at + length
      else spans.push({ from: at, to: at + length })
    }
    at += length
  }
  return spans
}

const within = (value: number) => Math.min(1, Math.max(0, value))

const duckAt = (spans: Span[], t: number) =>
  Math.max(
    0,
    ...spans.map(
      ({ from, to }) =>
        within((t - from + DUCK_RAMP) / DUCK_RAMP) * within((to + DUCK_RAMP - t) / DUCK_RAMP)
    )
  )

const musicLevelAt = (volume: number, underSound: number, spans: Span[], t: number) =>
  volume * (1 - (1 - underSound) * duckAt(spans, t))

const textLookAt = (text: EditText, t: number) => {
  const until = text.at + text.seconds
  const opacity =
    t < text.at || t > until
      ? 0
      : t < text.at + TEXT_FADE
        ? (t - text.at) / TEXT_FADE
        : t < until - TEXT_FADE
          ? 1
          : (until - t) / TEXT_FADE
  const easing = Math.max(0, 1 - (t - text.at) / TEXT_FADE) ** 2
  return {
    opacity,
    scale: text.effect === 'pop' ? Math.min(1, 0.6 + (0.4 * Math.max(0, t - text.at)) / POP) : 1,
    dx: text.effect === 'lower-third' ? -0.05 * easing : 0,
    dy: text.effect === 'rise' ? 0.04 * easing : 0
  }
}

export {
  clipLength,
  DUCK_RAMP,
  duckAt,
  editAnswerSchema,
  editMarkSchema,
  editSourceSchema,
  fadeInto,
  filmEditSchema,
  filmLength,
  heardSpans,
  MUSIC_EXTENSIONS,
  musicLevelAt,
  musicSourceSchema,
  POP,
  TEXT_EFFECTS,
  TEXT_FADE,
  TEXT_FONTS,
  textLookAt,
  timelineEnd,
  STILL_EXTENSIONS,
  STILL_MAX,
  STILL_SECONDS,
  UNDER_SOUND
}
export type {
  EditClip,
  EditMusic,
  EditSource,
  EditText,
  FilmEdit,
  MusicSource,
  Span,
  TextEffect,
  TextFont
}
