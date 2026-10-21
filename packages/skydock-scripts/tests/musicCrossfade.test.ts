// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { filmEditSchema, musicCrossfadeOf, musicFadesOf, musicLevelAt } from '../src/filmEditShape'
import type { EditMusic, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'

const piece = (
  id: string,
  at: number,
  length: number,
  more: Partial<EditMusic> = {}
): EditMusic => ({
  id,
  name: `${id}.mp3`,
  at,
  start: 0,
  end: length,
  volume: 1,
  ...more
})

const film = (music: EditMusic[]): FilmEdit => ({
  version: 1,
  clips: [{ id: 'clip-1', name: 'a.mp4', start: 0, end: 30, sound: false }],
  music,
  texts: [],
  underSound: 0.15
})

describe('a fade from the previous piece of music', () => {
  const pair = [piece('a', 0, 20), piece('b', 18, 20, { fade: 2 })]

  it('is a length that is more than nothing, saved on the piece that follows', () => {
    expect(filmEditSchema.safeParse(film(pair)).success).toBe(true)
    expect(filmEditSchema.safeParse(film([piece('a', 0, 20, { fade: 0 })])).success).toBe(false)
  })

  it('fades the first out and the second in over the part they share, and only there', () => {
    expect(musicCrossfadeOf(pair[0]!, pair)).toEqual({ into: 0, out: 2 })
    expect(musicCrossfadeOf(pair[1]!, pair)).toEqual({ into: 2, out: 0 })
    expect(musicFadesOf(pair[0]!, pair)).toEqual({ fadeIn: 0, fadeOut: 2 })
    expect(musicFadesOf(pair[1]!, pair)).toEqual({ fadeIn: 2, fadeOut: 0 })
  })

  it('is no fade when the pieces do not share anything, for the first piece, or beyond half of either', () => {
    const first = piece('a', 0, 20)
    const apart = piece('b', 20, 20, { fade: 2 })
    expect(musicCrossfadeOf(apart, [first, apart])).toEqual({ into: 0, out: 0 })
    expect(musicCrossfadeOf(first, [first, apart])).toEqual({ into: 0, out: 0 })

    const alone = piece('a', 0, 20, { fade: 2 })
    expect(musicCrossfadeOf(alone, [alone])).toEqual({ into: 0, out: 0 })

    const short = piece('b', 10, 6, { fade: 9 })
    expect(musicCrossfadeOf(short, [first, short]).into).toBe(3)
  })

  it('keeps the level of the two together while one goes down and the other comes up', () => {
    const level = (one: EditMusic, t: number) => musicLevelAt(one, 0.15, [], t, pair)

    expect(level(pair[0]!, 19) + level(pair[1]!, 19)).toBeCloseTo(1)
    expect(level(pair[0]!, 18)).toBeCloseTo(1)
    expect(level(pair[1]!, 18)).toBeCloseTo(0)
    expect(level(pair[1]!, 21)).toBeCloseTo(1)
  })

  it('gives the same level when the fades of the piece are worked out once for all the moments', () => {
    const fades = musicFadesOf(pair[1]!, pair)
    for (const t of [17, 18.5, 19, 20, 21, 25])
      expect(musicLevelAt(pair[1]!, 0.15, [], t, pair, fades)).toBe(
        musicLevelAt(pair[1]!, 0.15, [], t, pair)
      )
  })

  it('is said to the render as an fade out on the first and a fade in on the second', () => {
    const out = filmArgs({
      edit: film(pair),
      sources: new Map([
        [
          'a.mp4',
          { name: 'a.mp4', path: '/o/a.mp4', play: '', seconds: 30, sound: false, marks: [] }
        ]
      ]),
      music: new Map(
        pair.map((one) => [one.name, { name: one.name, path: `/o/${one.name}`, seconds: 60 }])
      ),
      width: 1920,
      height: 1080,
      fonts: {},
      textFileOf: () => '/tmp/x.txt',
      out: '/out/f.mp4'
    }).join(' ')

    expect(out).toContain('afade=t=out:st=18:d=2')
    expect(out).toContain('afade=t=in:d=2')
  })
})

describe('pieces of music that overlap', () => {
  const first = piece('a', 0, 20)

  it('are faded one into the other over everything they share, with no fade asked for', () => {
    const second = piece('b', 14, 20)
    expect(musicCrossfadeOf(second, [first, second])).toEqual({ into: 6, out: 0 })
    expect(musicCrossfadeOf(first, [first, second])).toEqual({ into: 0, out: 6 })
    expect(musicFadesOf(second, [first, second])).toEqual({ fadeIn: 6, fadeOut: 0 })
  })

  it('are not faded past half of either, nor when they only touch', () => {
    const deep = piece('b', 4, 20)
    expect(musicCrossfadeOf(deep, [first, deep]).into).toBe(10)
    const touching = piece('b', 20, 20)
    expect(musicCrossfadeOf(touching, [first, touching])).toEqual({ into: 0, out: 0 })
  })

  it('are mixed as they are when the later one says they are not faded', () => {
    const second = piece('b', 14, 20, { crossfade: false })
    expect(musicCrossfadeOf(second, [first, second])).toEqual({ into: 0, out: 0 })
    expect(musicFadesOf(second, [first, second])).toEqual({ fadeIn: 0, fadeOut: 0 })
    expect(filmEditSchema.safeParse(film([first, second])).success).toBe(true)
    expect(
      filmEditSchema.safeParse(film([first, { ...second, crossfade: true as never }])).success
    ).toBe(false)
  })

  it('keep the length of a fade of their own over the default', () => {
    const second = piece('b', 14, 20, { fade: 2 })
    expect(musicCrossfadeOf(second, [first, second])).toEqual({ into: 2, out: 0 })
  })

  it('keep the two together as loud as one while one goes down and the other comes up', () => {
    const second = piece('b', 14, 20)
    const both = [first, second]
    for (const t of [14, 15, 16, 17, 18, 19.9]) {
      const sum = musicLevelAt(first, 0.15, [], t, both) + musicLevelAt(second, 0.15, [], t, both)
      expect(sum).toBeCloseTo(1, 1)
    }
  })

  it('are rendered with the fade out of the first and the fade in of the second, as the editor draws them', () => {
    const second = piece('b', 14, 20)
    const out = filmArgs({
      edit: film([first, second]),
      sources: new Map([
        [
          'a.mp4',
          { name: 'a.mp4', path: '/o/a.mp4', play: '', seconds: 30, sound: false, marks: [] }
        ]
      ]),
      music: new Map(
        [first, second].map((one) => [
          one.name,
          { name: one.name, path: `/o/${one.name}`, seconds: 60 }
        ])
      ),
      width: 1920,
      height: 1080,
      fonts: {},
      textFileOf: () => '/tmp/x.txt',
      out: '/out/f.mp4'
    }).join(' ')

    expect(out).toContain('afade=t=out:st=14:d=6')
    expect(out).toContain('afade=t=in:d=6')
  })
})
