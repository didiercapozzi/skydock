import { z } from 'zod'
import { editTextSchema, filmLength, musicSourceSchema, UNDER_SOUND } from './filmEditShape'
import type { EditMusic, EditText, FilmEdit, MusicSource } from './filmEditShape'

const seconds = z.number().min(0)
const from = z.enum(['start', 'end'])

const filmTemplateSchema = z.object({
  version: z.literal(1),
  length: z.number().min(5).max(3600),
  underSound: z.number().min(0).max(1),
  fade: z.number().gt(0).finite().optional(),
  texts: z.array(editTextSchema.omit({ id: true, at: true }).extend({ from, at: seconds })).max(50),
  music: z
    .array(
      z
        .object({
          name: z.string().min(1),
          from,
          at: seconds,
          start: seconds,
          end: seconds,
          volume: z.number().min(0).max(1),
          fadeIn: z.number().min(0).finite().optional(),
          fadeOut: z.number().min(0).finite().optional()
        })
        .refine((piece) => piece.end > piece.start)
    )
    .max(20)
})

const filmTemplatesAnswerSchema = z.object({
  templates: z.array(
    z.object({ name: z.string(), template: filmTemplateSchema, missing: z.array(z.string()) })
  ),
  broken: z.array(z.string()).default([]),
  music: z.array(musicSourceSchema)
})

type FilmTemplate = z.infer<typeof filmTemplateSchema>
type Who = { name: string; day: string }

const END_SLACK = 0.5
const MIN_PIECE = 0.5
const TEXT_MAX = 200
const NAME_MIN = 3

const placed = (film: number, at: number, length: number) =>
  length >= film - END_SLACK && at > film / 2
    ? ({ from: 'end', at: Math.max(0, film - at) } as const)
    : ({ from: 'start', at } as const)

const NAME_TOKEN = '{name}'
const DAY_TOKEN = '{day}'

const swap = (value: string, { name, day }: Who) => {
  const found = [
    [day.trim(), DAY_TOKEN],
    [name.trim(), NAME_TOKEN]
  ]
    .filter(([find]) => find.length >= NAME_MIN)
    .sort((a, b) => b[0].length - a[0].length)
  if (found.length === 0) return value
  const any = found.map(([find]) => find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const swapped = value.replace(
    new RegExp(`(?<![\\p{L}\\p{N}{])(?:${any})(?![\\p{L}\\p{N}}])`, 'giu'),
    (hit) => found.find(([find]) => find.toLowerCase() === hit.toLowerCase())?.[1] ?? hit
  )
  return swapped.slice(0, TEXT_MAX)
}

const commonFade = (edit: FilmEdit) => {
  const fades = edit.clips.slice(1).flatMap((one) => (one.fade && !one.gap ? [one.fade] : []))
  return fades.sort(
    (a, b) => fades.filter((f) => f === b).length - fades.filter((f) => f === a).length
  )[0]
}

const captureTemplate = (edit: FilmEdit, who: Who): FilmTemplate => {
  const fade = commonFade(edit)
  const film = Math.min(3600, Math.max(5, Math.round(filmLength(edit))))
  return {
    version: 1,
    length: film,
    underSound: edit.underSound,
    ...(fade && { fade }),
    texts: edit.texts
      .filter((t) => t.text.trim())
      .map(({ id: _id, at, text, ...rest }) => ({
        ...rest,
        ...placed(film, at, at + rest.seconds),
        text: swap(text, who)
      })),
    music: edit.music.map(({ id: _id, at, ...rest }) => ({
      ...rest,
      ...placed(film, at, at + rest.end - rest.start)
    }))
  }
}

const applyTemplate = (
  edit: FilmEdit,
  template: FilmTemplate,
  { name, day, music }: Who & { music: Pick<MusicSource, 'name' | 'seconds'>[] | null }
) => {
  const film = filmLength(edit)
  const startOf = (item: { from: 'start' | 'end'; at: number }) =>
    item.from === 'end' ? Math.max(0, film - item.at) : item.at
  const left: string[] = []
  const cut: string[] = []
  const texts = template.texts.flatMap(({ from, at, ...rest }) => {
    const text = rest.text
      .replace(/\{(name|day)\}/g, (_, token: string) => (token === 'name' ? name : day).trim())
      .slice(0, TEXT_MAX)
    if (!text.trim()) return []
    const length = film > 0 ? Math.min(rest.seconds, Math.max(0.5, film)) : rest.seconds
    const begin =
      film > 0
        ? Math.min(startOf({ from, at }), Math.max(0, film - length))
        : from === 'end'
          ? 0
          : at
    return [{ ...rest, text, seconds: length, at: begin, id: '' }]
  })
  const pieces = template.music.flatMap((piece) => {
    const file = music?.find((one) => one.name === piece.name)
    if (music && !file) {
      left.push(piece.name)
      return []
    }
    const at = film > 0 || piece.from === 'start' ? startOf(piece) : 0
    let end = file ? Math.min(piece.end, file.seconds) : piece.end
    if (film > 0) end = Math.min(end, piece.start + Math.max(0, film - at))
    if (end - piece.start < MIN_PIECE) {
      cut.push(piece.name)
      return []
    }
    return [
      {
        id: '',
        name: piece.name,
        at,
        start: piece.start,
        end,
        volume: piece.volume,
        ...(piece.fadeIn !== undefined && { fadeIn: piece.fadeIn }),
        ...(piece.fadeOut !== undefined && { fadeOut: piece.fadeOut })
      }
    ]
  })
  const numbered = <T extends { id: string }>(list: T[], prefix: string) =>
    list.map((one, index) => ({ ...one, id: `${prefix}-${index + 1}` }))
  return {
    edit: {
      ...edit,
      clips: template.fade
        ? edit.clips.map((one, index) =>
            index > 0 && !one.gap ? { ...one, fade: template.fade } : one
          )
        : edit.clips,
      underSound: template.underSound,
      texts: numbered<EditText>(texts, 'text'),
      music: numbered<EditMusic>(pieces, 'music')
    },
    left,
    cut
  }
}

const SLOT = 'slot'

const slotEdit = (length: number): FilmEdit => ({
  version: 1,
  clips: [{ id: SLOT, name: SLOT, start: 0, end: length, sound: false }],
  music: [],
  texts: [],
  underSound: UNDER_SOUND
})

export {
  applyTemplate,
  captureTemplate,
  DAY_TOKEN,
  filmTemplateSchema,
  filmTemplatesAnswerSchema,
  NAME_TOKEN,
  SLOT,
  slotEdit
}
export type { FilmTemplate }
