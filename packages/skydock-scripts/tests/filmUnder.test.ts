// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { filmEditSchema, heardSpans, musicLevelAt } from '../src/filmEditShape'
import type { FilmEdit } from '../src/filmEditShape'
import { duckOf } from '../src/filmRender'

const film = (first: object, second: object): FilmEdit => ({
  version: 1,
  clips: [
    { id: 'clip-1', name: 'a.mp4', start: 0, end: 4, sound: true, ...first },
    { id: 'clip-2', name: 'b.mp4', start: 0, end: 4, sound: true, ...second, gap: 6 }
  ],
  music: [{ id: 'music-1', name: 'm.mp3', at: 0, start: 0, end: 30, volume: 1 }],
  texts: [],
  underSound: 0.15
})

describe('the music under the camera sound, clip by clip', () => {
  it('is the level of the film for a clip that has none of its own, and its own level for one that has', () => {
    const edit = film({ under: 0.5 }, {})
    const spans = heardSpans(edit, () => true)

    expect(musicLevelAt(edit.music[0]!, edit.underSound, spans, 2)).toBeCloseTo(0.5)
    expect(musicLevelAt(edit.music[0]!, edit.underSound, spans, 12)).toBeCloseTo(0.15)
  })

  it('goes down and up over the length of the clip, not the length of the film', () => {
    const edit = film({ underFade: 2 }, { underFade: 0.2 })
    const spans = heardSpans(edit, () => true)
    const level = (t: number) => musicLevelAt(edit.music[0]!, edit.underSound, spans, t)

    expect(level(5)).toBeCloseTo(1 - 0.85 * 0.5)
    expect(level(9)).toBeCloseTo(1)
    expect(level(9.9)).toBeCloseTo(1 - 0.85 * 0.5)
  })

  it('keeps clips that touch apart when they ask for different levels, and joins them when they do not', () => {
    const touching = (first: object, second: object) =>
      heardSpans(
        {
          ...film(first, second),
          clips: film(first, second).clips.map((c) => ({ ...c, gap: undefined }))
        },
        () => true
      )

    expect(touching({}, {})).toEqual([{ from: 0, to: 8 }])
    expect(touching({ under: 0.5 }, {})).toHaveLength(2)
  })

  it('is said to the render as the lowest of what the clips ask for', () => {
    const edit = film({ under: 0.5 }, { under: 0.1 })
    const said = duckOf(
      heardSpans(edit, () => true),
      edit.underSound
    )!

    expect(said).toContain('min(')
    expect(said).toContain('1-0.5*')
    expect(said).toContain('1-0.9*')
  })

  it('is a number from nothing to everything, with a fade of up to five seconds', () => {
    const asked = (clip: object) => filmEditSchema.safeParse(film(clip, {})).success

    expect(asked({ under: 0, underFade: 5 })).toBe(true)
    expect(asked({ under: 1.2 })).toBe(false)
    expect(asked({ underFade: 6 })).toBe(false)
    expect(asked({ underFade: -1 })).toBe(false)
  })
})
