// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  clipLevelAt,
  fadeInOf,
  fadeOutOf,
  filmEditSchema,
  musicFadesOf,
  musicLevelAt,
  textFadesOf,
  textLookAt
} from '../src/filmEditShape'
import type { EditClip, EditMusic, EditSource, EditText, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { applyTemplate, captureTemplate } from '../src/filmTemplate'

const clip = (id: string, end: number, over: Partial<EditClip> = {}): EditClip => ({
  id,
  name: `${id}.mp4`,
  start: 0,
  end,
  sound: true,
  ...over
})

const text = (over: Partial<EditText> = {}): EditText => ({
  id: 'text-1',
  text: 'Luc',
  at: 1,
  seconds: 4,
  effect: 'fade',
  font: 'clean',
  x: 0.5,
  y: 0.5,
  size: 0.1,
  colour: '#ffffff',
  ...over
})

const piece = (over: Partial<EditMusic> = {}): EditMusic => ({
  id: 'music-1',
  name: 'song.mp3',
  at: 2,
  start: 0,
  end: 10,
  volume: 1,
  ...over
})

const film = (over: Partial<FilmEdit> = {}): FilmEdit => ({
  version: 1,
  clips: [clip('a', 6), clip('b', 6)],
  music: [],
  texts: [],
  underSound: 0.15,
  ...over
})

const source = (name: string): EditSource => ({
  name,
  path: `/out/${name}`,
  play: `/out/${name}`,
  seconds: 20,
  sound: true,
  marks: []
})

const graph = (edit: FilmEdit) => {
  const made = filmArgs({
    edit,
    sources: new Map(edit.clips.map((one) => [one.name, source(one.name)])),
    music: new Map([['song.mp3', { name: 'song.mp3', path: '/out/song.mp3', seconds: 60 }]]),
    width: 1920,
    height: 1080,
    fonts: {},
    textFileOf: (id) => `/tmp/${id}.txt`,
    out: '/out/film.mp4'
  })
  return made[made.indexOf('-filter_complex') + 1] ?? ''
}

describe('the saved fades', () => {
  it('are optional seconds on a clip, a text and a piece of music, and old edits stay valid', () => {
    expect(filmEditSchema.safeParse(film()).success).toBe(true)
    const faded = filmEditSchema.parse(
      film({
        clips: [clip('a', 6, { fadeIn: 1, fadeOut: 0.5 })],
        texts: [text({ fadeIn: 0.5, fadeOut: 0 })],
        music: [piece({ fadeIn: 0, fadeOut: 2 })]
      })
    )
    expect(faded.clips[0]?.fadeOut).toBe(0.5)
    expect(faded.texts[0]?.fadeIn).toBe(0.5)
    expect(faded.music[0]?.fadeOut).toBe(2)
    for (const bad of [-1, Infinity, Number.NaN]) {
      expect(
        filmEditSchema.safeParse(film({ clips: [clip('a', 6, { fadeIn: bad })] })).success
      ).toBe(false)
      expect(filmEditSchema.safeParse(film({ texts: [text({ fadeOut: bad })] })).success).toBe(
        false
      )
      expect(filmEditSchema.safeParse(film({ music: [piece({ fadeIn: bad })] })).success).toBe(
        false
      )
    }
  })
})

describe('the fades of a clip', () => {
  it('count with no neighbour, after a gap and at both ends, up to half of the clip', () => {
    const clips = [clip('a', 6, { fadeIn: 1, fadeOut: 9 }), clip('b', 4, { gap: 2, fadeIn: 1 })]
    expect(fadeInOf(clips, 0)).toBe(1)
    expect(fadeOutOf(clips, 0)).toBe(3)
    expect(fadeInOf(clips, 1)).toBe(1)
    expect(fadeOutOf(clips, 1)).toBe(0)
  })

  it('give way to a crossfade on either side of the seam', () => {
    const clips = [
      clip('a', 6, { fadeIn: 1, fadeOut: 1 }),
      clip('b', 6, { fade: 1, fadeIn: 1, fadeOut: 1 }),
      clip('c', 6, { fadeIn: 1, fadeOut: 1 })
    ]
    expect(fadeOutOf(clips, 0)).toBe(0)
    expect(fadeInOf(clips, 1)).toBe(0)
    expect(fadeOutOf(clips, 1)).toBe(1)
    expect(fadeInOf(clips, 2)).toBe(1)
  })

  it('ramp the level from nothing to full and back', () => {
    const clips = [clip('a', 6, { fadeIn: 2, fadeOut: 2 })]
    expect(clipLevelAt(clips, 0, 0)).toBe(0)
    expect(clipLevelAt(clips, 0, 1)).toBeCloseTo(0.5)
    expect(clipLevelAt(clips, 0, 3)).toBe(1)
    expect(clipLevelAt(clips, 0, 5)).toBeCloseTo(0.5)
    expect(clipLevelAt(clips, 0, 6)).toBe(0)
    expect(clipLevelAt([clip('a', 6)], 0, 0)).toBe(1)
  })
})

describe('the fades of a text', () => {
  it('multiply the look of its effect and fit inside the text', () => {
    const faded = text({ fadeIn: 2, fadeOut: 9, effect: 'fade' })
    expect(textFadesOf(faded)).toEqual({ fadeIn: 2, fadeOut: 2 })
    expect(textLookAt(faded, 3).opacity).toBeCloseTo(1)
    expect(textLookAt(faded, 2).opacity).toBeCloseTo(0.5)
    expect(textLookAt(faded, 4.5).opacity).toBeCloseTo((0.5 / 0.6) * 0.25)
    expect(textLookAt(text({ fadeIn: 2 }), 1.3).opacity).toBeCloseTo(0.5 * 0.15)
    expect(textLookAt(text(), 1.3).opacity).toBeCloseTo(0.5)
  })

  it('put the ramp in the drawtext alpha only when there is one', () => {
    const plain = graph(film({ texts: [text()] }))
    const faded = graph(film({ texts: [text({ fadeIn: 1, fadeOut: 2 })] }))
    expect(plain).not.toContain('clip((t-')
    expect(faded).toContain('clip((t-1)/1,0,1)')
    expect(faded).toContain('clip((5-t)/2,0,1)')
  })
})

describe('the fades of music', () => {
  it('are none when absent and at 0', () => {
    expect(musicFadesOf(piece())).toEqual({ fadeIn: 0, fadeOut: 0 })
    expect(musicFadesOf(piece({ fadeIn: 0, fadeOut: 0 }))).toEqual({ fadeIn: 0, fadeOut: 0 })
    expect(musicFadesOf(piece({ fadeIn: 9, fadeOut: 9 }))).toEqual({ fadeIn: 5, fadeOut: 5 })
  })

  it('shape the level the preview plays, under the ducking', () => {
    const own = piece({ fadeIn: 2, fadeOut: 4 })
    expect(musicLevelAt(own, 0.15, [], 2)).toBe(0)
    expect(musicLevelAt(own, 0.15, [], 3)).toBeCloseTo(0.5)
    expect(musicLevelAt(own, 0.15, [], 6)).toBe(1)
    expect(musicLevelAt(own, 0.15, [], 10)).toBeCloseTo(0.5)
    expect(musicLevelAt(piece({ fadeIn: 0 }), 0.15, [], 2)).toBe(1)
    expect(musicLevelAt(own, 0.15, [{ from: 5, to: 8 }], 6)).toBeCloseTo(0.15)
  })

  it('go to the render as the fade lengths', () => {
    expect(graph(film({ music: [piece({ fadeIn: 2, fadeOut: 3 })] }))).toContain(
      'afade=t=in:d=2,afade=t=out:st=7:d=3'
    )
    expect(graph(film({ music: [piece()] }))).not.toContain('afade')
    const none = graph(film({ music: [piece({ fadeIn: 0, fadeOut: 0 })] }))
    expect(none).not.toContain('afade')
  })
})

describe('the fades of a clip in the render', () => {
  it('fade the picture and the sound of the trimmed clip', () => {
    const made = graph(film({ clips: [clip('a', 6, { start: 1, end: 7, fadeIn: 1, fadeOut: 2 })] }))
    expect(made).toContain('fade=t=in:st=0:d=1,fade=t=out:st=4:d=2')
    expect(made).toContain('afade=t=in:st=0:d=1,afade=t=out:st=4:d=2')
  })

  it('leave a clip with none and a clip under a crossfade alone', () => {
    expect(graph(film())).not.toContain('fade=t=')
    const made = graph(
      film({ clips: [clip('a', 6, { fadeOut: 1 }), clip('b', 6, { fade: 1, fadeIn: 1 })] })
    )
    expect(made).not.toContain('fade=t=')
  })
})

describe('the fades in a film template', () => {
  const who = { name: 'Ana Silva', day: '2026-05-09' }

  it('are part of the recipe for texts and music and not for clips', () => {
    const edit = film({
      clips: [clip('a', 40, { fadeIn: 1 }), clip('b', 80)],
      texts: [text({ fadeIn: 0.7, fadeOut: 0.9 })],
      music: [piece({ at: 0, end: 60, fadeIn: 0, fadeOut: 4 })]
    })
    const template = captureTemplate(edit, who)
    expect(template.texts[0]).toMatchObject({ fadeIn: 0.7, fadeOut: 0.9 })
    expect(template.music[0]).toMatchObject({ fadeIn: 0, fadeOut: 4 })
    expect(JSON.stringify(template)).not.toContain('"fadeIn":1')
    const applied = applyTemplate(film({ clips: [clip('a', 40, { fadeOut: 2 })] }), template, {
      ...who,
      music: [{ name: 'song.mp3', seconds: 100 }]
    })
    expect(applied.edit.texts[0]).toMatchObject({ fadeIn: 0.7, fadeOut: 0.9 })
    expect(applied.edit.music[0]).toMatchObject({ fadeIn: 0, fadeOut: 4 })
    expect(applied.edit.clips[0]?.fadeOut).toBe(2)
  })
})
