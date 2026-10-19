// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { filmEditSchema } from '../src/filmEditShape'

const film = (markers: unknown, on: 'clips' | 'music' = 'clips') => ({
  version: 1,
  clips: [
    {
      id: 'clip-1',
      name: 'a.mp4',
      start: 0,
      end: 4,
      sound: false,
      ...(on === 'clips' && markers !== undefined ? { markers } : {})
    }
  ],
  music: [
    {
      id: 'music-1',
      name: 'm.mp3',
      at: 0,
      start: 0,
      end: 4,
      volume: 1,
      ...(on === 'music' ? { markers } : {})
    }
  ],
  texts: [],
  underSound: 0.15
})

describe('the markers of an edit', () => {
  it('are kept on a clip and on a piece of music, and an edit without them is read as before', () => {
    const marks = [{ id: 'mark-1', label: 'Exit', at: 1.5 }]

    expect(filmEditSchema.parse(film(marks)).clips[0]!.markers).toEqual(marks)
    expect(filmEditSchema.parse(film(marks, 'music')).music[0]!.markers).toEqual(marks)
    expect(filmEditSchema.parse(film(undefined)).clips[0]).not.toHaveProperty('markers')
  })

  it('have a name of forty characters at most, and a time that is not below zero', () => {
    expect(
      filmEditSchema.safeParse(film([{ id: 'm', label: 'x'.repeat(41), at: 1 }])).success
    ).toBe(false)
    expect(filmEditSchema.safeParse(film([{ id: 'm', label: 'ok', at: -1 }])).success).toBe(false)
    expect(filmEditSchema.safeParse(film([{ id: '', label: 'ok', at: 1 }])).success).toBe(false)
  })
})
