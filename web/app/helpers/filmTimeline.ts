import { clipLength, filmLength } from '@skydock/scripts/client'
import type { EditClip, EditText, FilmEdit } from '@skydock/scripts/client'

const SHORTEST = 0.5
const BEFORE_MARK = 1

type Placed = { clip: EditClip; index: number; from: number; to: number }

const placed = (edit: FilmEdit) => {
  let at = 0
  return edit.clips.map((clip, index) => {
    const from = at
    at += clipLength(clip)
    return { clip, index, from, to: at } satisfies Placed
  })
}

const clipAt = (edit: FilmEdit, t: number) => {
  const all = placed(edit)
  return all.find((one) => t >= one.from && t < one.to) ?? all.at(-1) ?? null
}

const boundaries = (edit: FilmEdit) => [0, ...placed(edit).map((one) => one.to)]

const nearestBoundary = (edit: FilmEdit, t: number) =>
  boundaries(edit).reduce(
    (best, at, index) => (Math.abs(at - t) < Math.abs(best.at - t) ? { at, index } : best),
    { at: 0, index: 0 }
  )

const shiftTexts = (texts: EditText[], after: number, by: number) =>
  texts.map((text) =>
    text.at >= after - 0.001 ? { ...text, at: Math.max(0, text.at + by) } : text
  )

const insertClip = (edit: FilmEdit, index: number, clip: EditClip) => {
  const at = boundaries(edit)[index] ?? filmLength(edit)
  const clips = [...edit.clips]
  clips.splice(index, 0, clip)
  return { ...edit, clips, texts: shiftTexts(edit.texts, at, clipLength(clip)) }
}

const removeClip = (edit: FilmEdit, id: string) => {
  const gone = placed(edit).find((one) => one.clip.id === id)
  if (!gone) return edit
  return {
    ...edit,
    clips: edit.clips.filter((clip) => clip.id !== id),
    texts: shiftTexts(edit.texts, gone.to, gone.from - gone.to)
  }
}

const moveClip = (edit: FilmEdit, id: string, index: number) => {
  const from = edit.clips.findIndex((clip) => clip.id === id)
  if (from < 0) return edit
  const clips = [...edit.clips]
  const [clip] = clips.splice(from, 1)
  clips.splice(index > from ? index - 1 : index, 0, clip!)
  return { ...edit, clips }
}

const trimClip = (
  edit: FilmEdit,
  id: string,
  side: 'start' | 'end',
  value: number,
  seconds: number
) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const { clip } = here
  const start = side === 'start' ? Math.min(Math.max(0, value), clip.end - SHORTEST) : clip.start
  const end = side === 'end' ? Math.max(Math.min(seconds, value), clip.start + SHORTEST) : clip.end
  const by = end - start - clipLength(clip)
  return {
    ...edit,
    clips: edit.clips.map((one) => (one.id === id ? { ...one, start, end } : one)),
    texts: shiftTexts(edit.texts, here.to, by)
  }
}

const setPart = (edit: FilmEdit, id: string, start: number, end: number) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const by = end - start - clipLength(here.clip)
  return {
    ...edit,
    clips: edit.clips.map((one) => (one.id === id ? { ...one, start, end } : one)),
    texts: shiftTexts(edit.texts, here.to, by)
  }
}

const snapPart = (
  start: number,
  length: number,
  seconds: number,
  marks: number[],
  reach: number
) => {
  const latest = Math.max(0, seconds - length)
  const free = Math.min(latest, Math.max(0, start))
  const near = marks
    .map((mark) => Math.min(latest, Math.max(0, mark - BEFORE_MARK)))
    .find((snapped) => Math.abs(snapped - free) <= reach)
  return near ?? free
}

const nextId = (prefix: string, taken: Array<{ id: string }>) => {
  const used = new Set(taken.map((one) => one.id))
  let n = taken.length + 1
  while (used.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

const clockOf = (t: number) => {
  const whole = Math.max(0, t)
  const minutes = Math.floor(whole / 60)
  const rest = whole - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

export {
  boundaries,
  clipAt,
  clockOf,
  insertClip,
  moveClip,
  nearestBoundary,
  nextId,
  placed,
  removeClip,
  setPart,
  snapPart,
  trimClip
}
export type { Placed }
