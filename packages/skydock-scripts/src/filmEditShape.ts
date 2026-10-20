import { z } from 'zod'
import { frameCropSchema, rotationSchema } from './types'

const TEXT_EFFECTS = ['fade', 'rise', 'pop', 'lower-third'] as const
const TEXT_FONTS = ['clean', 'bold', 'elegant', 'hand'] as const
const MUSIC_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'] as const
const UNDER_SOUND = 0.15
const STILL_SECONDS = 5
const OUTPUT_FORMATS = ['h264', 'h265', 'av1'] as const
const OUTPUT_FPS = [24, 25, 30, 50, 60] as const
const OUTPUT_CRF = { h264: 18, h265: 22, av1: 28 } as const
const CRF_RANGE = { least: 12, most: 40 }
const STILL_MAX = 60
const STILL_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const
const TEXT_FADE = 0.6
const POP = 0.35
const DUCK_RAMP = 0.8

const SPEED = { least: 0.25, most: 4 }

const seconds = z.number().min(0)
const fraction = z.number().min(0).max(1)
const fadeLength = seconds.finite().optional()

const editMarkerSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(40),
  at: seconds
})

const editClipSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    start: seconds,
    end: seconds,
    sound: z.boolean(),
    gap: seconds.finite().optional(),
    fade: z.number().gt(0).finite().optional(),
    speed: z.number().min(SPEED.least).max(SPEED.most).optional(),
    frame: frameCropSchema.optional(),
    rotation: rotationSchema.optional(),
    fadeIn: fadeLength,
    fadeOut: fadeLength,
    under: fraction.optional(),
    underFade: z.number().min(0.1).max(5).optional(),
    markers: z.array(editMarkerSchema).optional()
  })
  .refine((clip) => clip.end > clip.start, 'a clip ends after it starts')

const editMusicSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    at: seconds,
    start: seconds,
    end: seconds,
    volume: fraction,
    fadeIn: fadeLength,
    fadeOut: fadeLength,
    markers: z.array(editMarkerSchema).optional()
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
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fadeIn: fadeLength,
  fadeOut: fadeLength,
  group: z.string().min(1).optional()
})

const outputSchema = z.object({
  format: z.enum(OUTPUT_FORMATS).optional(),
  fps: z
    .number()
    .refine((value) => (OUTPUT_FPS as readonly number[]).includes(value))
    .optional(),
  crf: z.number().int().min(CRF_RANGE.least).max(CRF_RANGE.most).optional()
})

const aPictureOrAColour = (layer: { name?: string | undefined; colour?: string | undefined }) =>
  (layer.name === undefined) !== (layer.colour === undefined)

const editLayerObject = z.object({
  id: z.string().min(1),
  at: seconds,
  seconds: z.number().min(0.5).max(600),
  name: z.string().min(1).optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  x: fraction,
  y: fraction,
  width: z.number().min(0.02).max(1),
  fadeIn: fadeLength,
  fadeOut: fadeLength,
  group: z.string().min(1).optional()
})

const editLayerSchema = editLayerObject.refine(
  aPictureOrAColour,
  'a layer is a picture or a colour'
)

const filmEditSchema = z.object({
  version: z.literal(1),
  clips: z.array(editClipSchema),
  music: z.array(editMusicSchema),
  texts: z.array(editTextSchema),
  layers: z.array(editLayerSchema).optional(),
  underSound: fraction,
  output: outputSchema.optional()
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

const imageSourceSchema = z.object({
  name: z.string(),
  path: z.string(),
  width: z.number(),
  height: z.number()
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
    images: z.array(imageSourceSchema).default([]),
    rendering: z.boolean(),
    film: z.string().nullable(),
    setAside: z.object({ as: z.string(), reason: z.string() }).nullable().default(null),
    formats: z.array(z.enum(OUTPUT_FORMATS)).default(['h264'])
  })
])

type FilmEdit = z.infer<typeof filmEditSchema>
type EditClip = FilmEdit['clips'][number]
type EditMusic = FilmEdit['music'][number]
type EditText = FilmEdit['texts'][number]
type EditMarker = NonNullable<EditClip['markers']>[number]
type EditSource = z.infer<typeof editSourceSchema>
type MusicSource = z.infer<typeof musicSourceSchema>
type ImageSource = z.infer<typeof imageSourceSchema>
type EditLayer = NonNullable<FilmEdit['layers']>[number]
type TextEffect = (typeof TEXT_EFFECTS)[number]
type TextFont = (typeof TEXT_FONTS)[number]
type Span = { from: number; to: number; under?: number; ramp?: number }

const imageAsStill = (image: ImageSource): EditSource => ({
  name: image.name,
  path: image.path,
  play: image.path,
  seconds: STILL_MAX,
  sound: false,
  marks: [],
  still: true
})

const speedOf = (clip: { speed?: number }) => clip.speed ?? 1

const clipLength = (clip: { start: number; end: number; speed?: number }) =>
  (clip.end - clip.start) / speedOf(clip)

const fadeInto = (clips: EditClip[], index: number) => {
  const clip = clips[index]
  const before = clips[index - 1]
  return clip?.fade && before && !clip.gap
    ? Math.min(clip.fade, clipLength(before) / 2, clipLength(clip) / 2)
    : 0
}

const halved = (value: number | undefined, length: number) => Math.min(value ?? 0, length / 2)

const fadeInOf = (clips: EditClip[], index: number) =>
  fadeInto(clips, index) > 0 ? 0 : halved(clips[index]?.fadeIn, clipLength(clips[index]!))

const fadeOutOf = (clips: EditClip[], index: number) =>
  fadeInto(clips, index + 1) > 0 ? 0 : halved(clips[index]?.fadeOut, clipLength(clips[index]!))

const textFadesOf = (text: EditText) => ({
  fadeIn: halved(text.fadeIn, text.seconds),
  fadeOut: halved(text.fadeOut, text.seconds)
})

const layerFadesOf = (layer: EditLayer) => ({
  fadeIn: halved(layer.fadeIn, layer.seconds),
  fadeOut: halved(layer.fadeOut, layer.seconds)
})

const musicFadesOf = (piece: EditMusic) => ({
  fadeIn: halved(piece.fadeIn ?? 0, piece.end - piece.start),
  fadeOut: halved(piece.fadeOut ?? 0, piece.end - piece.start)
})

const within = (value: number) => Math.min(1, Math.max(0, value))

const rampAt = (into: number, length: number, fadeIn: number, fadeOut: number) =>
  Math.min(
    fadeIn > 0 ? within(into / fadeIn) : 1,
    fadeOut > 0 ? within((length - into) / fadeOut) : 1
  )

const clipLevelAt = (clips: EditClip[], index: number, into: number) =>
  rampAt(into, clipLength(clips[index]!), fadeInOf(clips, index), fadeOutOf(clips, index))

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
    ...(edit.layers ?? []).map((layer) => layer.at + layer.seconds),
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
      const own = {
        ...(clip.under === undefined ? {} : { under: clip.under }),
        ...(clip.underFade === undefined ? {} : { ramp: clip.underFade })
      }
      if (last && at <= last.to + 0.001 && last.under === own.under && last.ramp === own.ramp)
        last.to = at + length
      else spans.push({ from: at, to: at + length, ...own })
    }
    at += length
  }
  return spans
}

const rampOfSpan = (span: Span) => span.ramp ?? DUCK_RAMP

const duckOfSpan = (span: Span, t: number) => {
  const ramp = rampOfSpan(span)
  return within((t - span.from + ramp) / ramp) * within((span.to + ramp - t) / ramp)
}

const duckAt = (spans: Span[], t: number) =>
  Math.max(0, ...spans.map((span) => duckOfSpan(span, t)))

const underAt = (spans: Span[], underSound: number, t: number) =>
  Math.min(1, ...spans.map((span) => 1 - (1 - (span.under ?? underSound)) * duckOfSpan(span, t)))

const musicLevelAt = (piece: EditMusic, underSound: number, spans: Span[], t: number) => {
  const { fadeIn, fadeOut } = musicFadesOf(piece)
  return (
    piece.volume *
    rampAt(t - piece.at, piece.end - piece.start, fadeIn, fadeOut) *
    underAt(spans, underSound, t)
  )
}

const textLookAt = (text: EditText, t: number) => {
  const until = text.at + text.seconds
  const { fadeIn, fadeOut } = textFadesOf(text)
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
    opacity: opacity * rampAt(t - text.at, text.seconds, fadeIn, fadeOut),
    scale: text.effect === 'pop' ? Math.min(1, 0.6 + (0.4 * Math.max(0, t - text.at)) / POP) : 1,
    dx: text.effect === 'lower-third' ? -0.05 * easing : 0,
    dy: text.effect === 'rise' ? 0.04 * easing : 0
  }
}

export {
  clipLength,
  SPEED,
  speedOf,
  DUCK_RAMP,
  duckAt,
  editAnswerSchema,
  aPictureOrAColour,
  editLayerObject,
  editLayerSchema,
  editMarkSchema,
  editSourceSchema,
  editTextSchema,
  clipLevelAt,
  fadeInOf,
  fadeInto,
  fadeOutOf,
  layerFadesOf,
  filmEditSchema,
  filmLength,
  heardSpans,
  imageAsStill,
  MUSIC_EXTENSIONS,
  musicFadesOf,
  musicLevelAt,
  imageSourceSchema,
  musicSourceSchema,
  POP,
  rampAt,
  TEXT_EFFECTS,
  TEXT_FADE,
  TEXT_FONTS,
  textFadesOf,
  textLookAt,
  timelineEnd,
  CRF_RANGE,
  OUTPUT_CRF,
  OUTPUT_FORMATS,
  OUTPUT_FPS,
  IMAGE_EXTENSIONS,
  STILL_EXTENSIONS,
  STILL_MAX,
  STILL_SECONDS,
  UNDER_SOUND
}
export type {
  EditClip,
  EditLayer,
  ImageSource,
  EditMarker,
  EditMusic,
  EditSource,
  EditText,
  FilmEdit,
  MusicSource,
  Span,
  TextEffect,
  TextFont
}
