import { clipLength, fadeInto, filmLength, speedOf, timelineEnd } from '@skydock/scripts/client'
import type {
  EditClip,
  EditMarker,
  EditMusic,
  EditSource,
  EditText,
  FilmEdit
} from '@skydock/scripts/client'
import type { FrameCrop, Rotation } from '@skydock/scripts'

const SHORTEST = 0.5
const BEFORE_MARK = 1
const HAIR = 1e-6
const TILE_LOOP = 4
const FADE = { default: 1, least: 0.2, most: 3, shortest: 0.4 }

type FadeKind = 'clips' | 'texts' | 'music'
type Faded = EditClip | EditText | EditMusic

type Placed = { clip: EditClip; index: number; from: number; to: number }

const placed = (edit: FilmEdit) => {
  let at = 0
  return edit.clips.map((clip, index) => {
    at += (clip.gap ?? 0) - fadeInto(edit.clips, index)
    const from = at
    at += clipLength(clip)
    return { clip, index, from, to: at } satisfies Placed
  })
}

const newestAt = (all: Placed[], t: number) =>
  all.filter((one) => t >= one.from && t < one.to).at(-1)

const clipAt = (edit: FilmEdit, t: number) => {
  const all = placed(edit)
  const last = all.at(-1)
  return newestAt(all, t) ?? (last && t === last.to ? last : null)
}

const fadeAt = (edit: FilmEdit, t: number) => {
  const all = placed(edit)
  const into = newestAt(all, t)
  const out = into && all[into.index - 1]
  return into && out && t < out.to
    ? { out, into, mix: (t - into.from) / (out.to - into.from) }
    : null
}

const offsetOf = (clip: EditClip) => (clip.gap ?? 0) - (clip.fade ?? 0)

const joined = (clip: EditClip, offset: number): EditClip => {
  const { gap: _, fade: __, ...bare } = clip
  return offset > 0 ? { ...bare, gap: offset } : offset < 0 ? { ...bare, fade: -offset } : bare
}

const fitFades = (edit: FilmEdit, before: FilmEdit | undefined, ripple: boolean) => {
  const was = new Map(before?.clips.map((clip, index) => [clip.id, before.clips[index - 1]?.id]))
  const fitted = {
    ...edit,
    clips: edit.clips.map((clip, index) => {
      if (!clip.fade) return clip
      const kept = !before || was.get(clip.id) === edit.clips[index - 1]?.id
      const fade = kept ? fadeInto(edit.clips, index) : 0
      return fade === clip.fade ? clip : joined(clip, -fade)
    })
  }
  return placed(edit).reduceRight((all, one) => {
    const index = before ? before.clips.findIndex((clip) => clip.id === one.clip.id) : -1
    const had = fadeInto(index < 0 ? edit.clips : before!.clips, index < 0 ? one.index : index)
    return rippleBy(all, one.from, had - fadeInto(all.clips, one.index), ripple)
  }, fitted)
}

const lengthOfItem = (kind: FadeKind, one: Faded) =>
  kind === 'clips'
    ? clipLength(one as EditClip)
    : kind === 'texts'
      ? (one as EditText).seconds
      : (one as EditMusic).end - (one as EditMusic).start

const setItemFade = (
  edit: FilmEdit,
  kind: FadeKind,
  id: string,
  side: 'fadeIn' | 'fadeOut',
  seconds: number
): FilmEdit => {
  const items: Faded[] = edit[kind]
  const one = items.find((item) => item.id === id)
  if (!one) return edit
  const value = Math.min(Math.max(0, Math.round(seconds * 10) / 10), lengthOfItem(kind, one) / 2)
  return {
    ...edit,
    [kind]: items.map((item) => (item.id === id ? { ...item, [side]: value } : item))
  }
}

const fitItemFades = (edit: FilmEdit): FilmEdit => {
  let changed = false
  const fit = <T extends Faded>(kind: FadeKind, items: T[]) =>
    items.map((item) => {
      const half = lengthOfItem(kind, item) / 2
      if ((item.fadeIn ?? 0) <= half && (item.fadeOut ?? 0) <= half) return item
      changed = true
      return {
        ...item,
        ...(item.fadeIn !== undefined ? { fadeIn: Math.min(item.fadeIn, half) } : {}),
        ...(item.fadeOut !== undefined ? { fadeOut: Math.min(item.fadeOut, half) } : {})
      }
    })
  const next = {
    ...edit,
    clips: fit('clips', edit.clips),
    texts: fit('texts', edit.texts),
    music: fit('music', edit.music)
  }
  return changed ? next : edit
}

const setClipFrame = (
  edit: FilmEdit,
  id: string,
  frame: FrameCrop | null,
  rotation: Rotation
): FilmEdit => ({
  ...edit,
  clips: edit.clips.map((clip) => {
    if (clip.id !== id) return clip
    const { frame: _frame, rotation: _rotation, ...bare } = clip
    return { ...bare, ...(frame ? { frame } : {}), ...(rotation ? { rotation } : {}) }
  })
})

const unturnedFrame = (frame: FrameCrop, rotation: Rotation) => {
  const { x, y, width, height } = frame
  return rotation === 90
    ? { x: y, y: 1 - x - width, width: height, height: width }
    : rotation === 180
      ? { x: 1 - x - width, y: 1 - y - height, width, height }
      : rotation === 270
        ? { x: 1 - y - height, y: x, width: height, height: width }
        : { x, y, width, height }
}

const lookGeometry = (
  source: { width: number; height: number },
  rotation: Rotation,
  frame: FrameCrop | null,
  stage: { width: number; height: number }
) => {
  const turned = rotation % 180 !== 0 ? { width: source.height, height: source.width } : source
  const box = frame ?? { x: 0, y: 0, width: 1, height: 1 }
  const scale = Math.min(
    stage.width / (box.width * turned.width),
    stage.height / (box.height * turned.height)
  )
  return {
    width: source.width * scale,
    height: source.height * scale,
    dx: -(box.x + box.width / 2 - 0.5) * turned.width * scale,
    dy: -(box.y + box.height / 2 - 0.5) * turned.height * scale
  }
}

type MarkKind = 'clips' | 'music'

const withMarkers = (
  edit: FilmEdit,
  kind: MarkKind,
  id: string,
  markers: EditMarker[]
): FilmEdit => ({
  ...edit,
  [kind]: (edit[kind] as Array<EditClip | EditMusic>).map((one) => {
    if (one.id !== id) return one
    const { markers: _, ...rest } = one
    return markers.length > 0 ? { ...rest, markers } : rest
  })
})

const markersOf = (edit: FilmEdit, kind: MarkKind, id: string) =>
  (edit[kind] as Array<EditClip | EditMusic>).find((one) => one.id === id)?.markers ?? []

const addMarkerAt = (
  edit: FilmEdit,
  picked: { kind: string; id: string } | null,
  at: number,
  label: string
): FilmEdit | null => {
  const clip =
    picked?.kind === 'clip'
      ? placed(edit).find((one) => one.clip.id === picked.id)
      : picked?.kind === 'music'
        ? undefined
        : clipAt(edit, at)
  const piece =
    picked?.kind === 'music' ? edit.music.find((one) => one.id === picked.id) : undefined
  if (piece) {
    if (at < piece.at || at > piece.at + piece.end - piece.start) return null
    const markers = piece.markers ?? []
    return withMarkers(
      edit,
      'music',
      piece.id,
      [...markers, { id: nextId('mark', markers), label, at: piece.start + at - piece.at }].sort(
        (a, b) => a.at - b.at
      )
    )
  }
  if (!clip || at < clip.from - HAIR || at > clip.to + HAIR) return null
  const markers = clip.clip.markers ?? []
  const local = Math.min(
    clip.clip.end,
    Math.max(clip.clip.start, clip.clip.start + (at - clip.from) * speedOf(clip.clip))
  )
  return withMarkers(
    edit,
    'clips',
    clip.clip.id,
    [...markers, { id: nextId('mark', markers), label, at: local }].sort((a, b) => a.at - b.at)
  )
}

const renameMarker = (edit: FilmEdit, kind: MarkKind, id: string, markId: string, label: string) =>
  withMarkers(
    edit,
    kind,
    id,
    markersOf(edit, kind, id).map((mark) => (mark.id === markId ? { ...mark, label } : mark))
  )

const removeMarker = (edit: FilmEdit, kind: MarkKind, id: string, markId: string) =>
  withMarkers(
    edit,
    kind,
    id,
    markersOf(edit, kind, id).filter((mark) => mark.id !== markId)
  )

const IMPORTED_APART = 0.05

const importMarkers = (
  edit: FilmEdit,
  sources: Map<string, EditSource>,
  id: string | null,
  name: (which: EditSource['marks'][number]['which']) => string
) =>
  edit.clips.reduce((all, clip) => {
    if (id !== null && clip.id !== id) return all
    const have = markersOf(all, 'clips', clip.id)
    const fresh = (sources.get(clip.name)?.marks ?? [])
      .filter(
        (mark) =>
          mark.at >= clip.start &&
          mark.at <= clip.end &&
          !have.some((one) => Math.abs(one.at - mark.at) < IMPORTED_APART)
      )
      .map((mark, index) => ({
        id: nextId('mark', [
          ...have,
          ...Array.from({ length: index }, (_, i) => ({ id: `mark-${have.length + i + 1}` }))
        ]),
        label: name(mark.which),
        at: mark.at
      }))
    return fresh.length === 0
      ? all
      : withMarkers(
          all,
          'clips',
          clip.id,
          [...have, ...fresh].sort((a, b) => a.at - b.at)
        )
  }, edit)

const markerTimes = (edit: FilmEdit, skip?: string) => [
  ...placed(edit)
    .filter(({ clip }) => clip.id !== skip)
    .flatMap(({ clip, from }) =>
      (clip.markers ?? [])
        .filter((mark) => mark.at >= clip.start && mark.at <= clip.end)
        .map((mark) => from + (mark.at - clip.start) / speedOf(clip))
    ),
  ...edit.music
    .filter((piece) => piece.id !== skip)
    .flatMap((piece) =>
      (piece.markers ?? [])
        .filter((mark) => mark.at >= piece.start && mark.at <= piece.end)
        .map((mark) => piece.at + mark.at - piece.start)
    )
]

const fadeBlock = (edit: FilmEdit, id: string) => {
  const index = edit.clips.findIndex((clip) => clip.id === id)
  const clip = edit.clips[index]
  const before = edit.clips[index - 1]
  return !clip || !before
    ? 'first'
    : clip.gap
      ? 'gap'
      : Math.min(clipLength(clip), clipLength(before)) < FADE.shortest
        ? 'short'
        : null
}

const fadeMost = (edit: FilmEdit, id: string) => {
  const index = edit.clips.findIndex((clip) => clip.id === id)
  return Math.min(
    FADE.most,
    clipLength(edit.clips[index]!) / 2,
    clipLength(edit.clips[index - 1]!) / 2
  )
}

const setFade = (edit: FilmEdit, id: string, seconds: number, ripple: boolean) => {
  if (fadeBlock(edit, id)) return edit
  const here = placed(edit).find((one) => one.clip.id === id)!
  const fade =
    seconds < FADE.least ? 0 : Math.min(Math.round(seconds * 1000) / 1000, fadeMost(edit, id))
  const was = fadeInto(edit.clips, here.index)
  if (fade === was) return edit
  const clips = edit.clips.map((one) => (one.id === id ? joined(one, -fade) : one))
  return rippleBy({ ...edit, clips }, here.from, was - fade, ripple)
}

const zoomAround = (scrollLeft: number, anchor: number, from: number, to: number) =>
  ((scrollLeft + anchor) * to) / from - anchor

const boundaries = (edit: FilmEdit) => [0, ...placed(edit).map((one) => one.to)]

const nearestBoundary = (edit: FilmEdit, t: number) =>
  boundaries(edit).reduce(
    (best, at, index) => (Math.abs(at - t) < Math.abs(best.at - t) ? { at, index } : best),
    { at: 0, index: 0 }
  )

const moveBlocks = (edit: FilmEdit, to: (at: number) => number) => ({
  ...edit,
  texts: edit.texts.map((text) => ({ ...text, at: to(text.at) })),
  music: edit.music.map((piece) => ({ ...piece, at: to(piece.at) }))
})

const rippleBy = (edit: FilmEdit, after: number, by: number, ripple: boolean) =>
  ripple ? moveBlocks(edit, (at) => (at >= after - 0.001 ? Math.max(0, at + by) : at)) : edit

const insertClip = (edit: FilmEdit, index: number, clip: EditClip, ripple: boolean) => {
  const at = boundaries(edit)[index] ?? filmLength(edit)
  const clips = [...edit.clips]
  clips.splice(index, 0, clip)
  return fitFades(rippleBy({ ...edit, clips }, at, clipLength(clip), ripple), edit, ripple)
}

const removeClip = (edit: FilmEdit, id: string, ripple: boolean) => {
  const gone = placed(edit).find((one) => one.clip.id === id)
  if (!gone) return edit
  const before = gone.from - (gone.clip.gap ?? 0) + (gone.clip.fade ?? 0)
  const gathered = ripple
    ? moveBlocks(edit, (at) => (at > before && at < gone.to - 0.001 ? before : at))
    : edit
  const clips = edit.clips.filter((clip) => clip.id !== id)
  const next = clips[gone.index]
  if (!ripple && next) clips[gone.index] = joined(next, offsetOf(next) + gone.to - before)
  return fitFades(rippleBy({ ...gathered, clips }, gone.to, before - gone.to, ripple), edit, ripple)
}

const splitClip = (edit: FilmEdit, at: number) => {
  const here = newestAt(placed(edit), at)
  if (!here || at < here.from + SHORTEST - HAIR || at > here.to - SHORTEST + HAIR) return null
  const cut = here.clip.start + (at - here.from) * speedOf(here.clip)
  const { fadeIn: _, ...second } = here.clip
  const { fadeOut: __, ...first } = here.clip
  const clips = [...edit.clips]
  clips.splice(
    here.index,
    1,
    { ...first, end: cut },
    joined({ ...second, id: nextId('clip', edit.clips), start: cut }, 0)
  )
  return fitFades({ ...edit, clips }, undefined, false)
}

const moveClip = (edit: FilmEdit, id: string, index: number) => {
  const from = edit.clips.findIndex((clip) => clip.id === id)
  if (from < 0) return edit
  const clips = [...edit.clips]
  const [clip] = clips.splice(from, 1)
  clips.splice(index > from ? index - 1 : index, 0, clip!)
  return fitFades(
    {
      ...edit,
      clips: clips.map((one, slot) => {
        const gap = edit.clips[slot]?.gap ?? 0
        return joined(one, gap > 0 ? gap : -(one.fade ?? 0))
      })
    },
    edit,
    false
  )
}

const placeClip = (edit: FilmEdit, id: string, start: number, ripple: boolean) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const next = edit.clips[here.index + 1]
  const room = !ripple && next ? (next.gap ?? 0) : Infinity
  const by = Math.min(room, Math.max(-(here.clip.gap ?? 0), start - here.from))
  if (by === 0) return edit
  const clips = edit.clips.map((one) => {
    if (one.id === id) return joined(one, Math.round((offsetOf(one) + by) * 1000) / 1000)
    return !ripple && one.id === next?.id
      ? joined(one, Math.round((offsetOf(next) - by) * 1000) / 1000)
      : one
  })
  return rippleBy({ ...edit, clips }, here.from, by, ripple)
}

const trimClip = (
  edit: FilmEdit,
  id: string,
  side: 'start' | 'end',
  value: number,
  seconds: number,
  ripple: boolean
) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const { clip } = here
  const start = side === 'start' ? Math.min(Math.max(0, value), clip.end - SHORTEST) : clip.start
  const end = side === 'end' ? Math.max(Math.min(seconds, value), clip.start + SHORTEST) : clip.end
  const by = clipLength({ ...clip, start, end }) - clipLength(clip)
  const offset = offsetOf(clip)
  const moved = ripple ? offset : Math.max(Math.min(0, offset), offset + start - clip.start)
  return fitFades(
    rippleBy(
      {
        ...edit,
        clips: edit.clips.map((one) =>
          one.id === id ? joined({ ...one, start, end }, moved) : one
        )
      },
      here.to,
      by,
      ripple
    ),
    edit,
    ripple
  )
}

const setPart = (edit: FilmEdit, id: string, start: number, end: number, ripple: boolean) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const by = clipLength({ ...here.clip, start, end }) - clipLength(here.clip)
  return fitFades(
    rippleBy(
      { ...edit, clips: edit.clips.map((one) => (one.id === id ? { ...one, start, end } : one)) },
      here.to,
      by,
      ripple
    ),
    edit,
    ripple
  )
}

const setSpeed = (edit: FilmEdit, id: string, speed: number, ripple: boolean) => {
  const here = placed(edit).find((one) => one.clip.id === id)
  if (!here) return edit
  const { speed: _, ...bare } = here.clip
  const next = speed === 1 ? bare : { ...bare, speed }
  const by = clipLength(next) - clipLength(here.clip)
  return fitFades(
    rippleBy(
      { ...edit, clips: edit.clips.map((one) => (one.id === id ? next : one)) },
      here.to,
      by,
      ripple
    ),
    edit,
    ripple
  )
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

const snapTo = (candidates: number[], value: number, reach: number) => {
  const near = candidates.filter((one) => Math.abs(one - value) <= reach)
  return near.reduce(
    (best, one) => (Math.abs(one - value) < Math.abs(best - value) ? one : best),
    near[0] ?? value
  )
}

const snapPoints = (
  edit: FilmEdit,
  sources: Map<string, EditSource>,
  at: number,
  skip?: string
) => [
  0,
  at,
  ...placed(edit)
    .filter(({ clip }) => clip.id !== skip)
    .flatMap(({ clip, from, to }) => [
      to,
      ...(clip.gap || clip.fade ? [from] : []),
      ...(sources.get(clip.name)?.marks ?? [])
        .filter((mark) => mark.at >= clip.start && mark.at <= clip.end)
        .map((mark) => from + mark.at - clip.start)
    ]),
  ...edit.texts
    .filter((text) => text.id !== skip)
    .flatMap((text) => [text.at, text.at + text.seconds]),
  ...edit.music
    .filter((piece) => piece.id !== skip)
    .flatMap((piece) => [piece.at, piece.at + piece.end - piece.start]),
  ...markerTimes(edit, skip)
]

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
  TILE_LOOP,
  boundaries,
  clipAt,
  clockOf,
  FADE,
  fadeAt,
  fadeBlock,
  fadeMost,
  fitItemFades,
  addMarkerAt,
  importMarkers,
  insertClip,
  lookGeometry,
  markerTimes,
  moveClip,
  nearestBoundary,
  nextId,
  placeClip,
  placed,
  removeClip,
  removeMarker,
  renameMarker,
  rippleBy,
  setFade,
  setClipFrame,
  setItemFade,
  setPart,
  setSpeed,
  snapPart,
  snapPoints,
  snapTo,
  splitClip,
  timelineEnd,
  trimClip,
  unturnedFrame,
  zoomAround
}
export type { Placed }
