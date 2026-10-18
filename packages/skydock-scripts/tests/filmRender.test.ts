// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { duckAt, heardSpans, musicLevelAt, textLookAt } from '../src/filmEditShape'
import type { EditSource, FilmEdit, MusicSource } from '../src/filmEditShape'
import { duckOf, filmArgs } from '../src/filmRender'

const source = (name: string, sound = true): EditSource => ({
  name,
  path: `/out/videos/${name}`,
  play: `/out/proxies/${name}`,
  seconds: 20,
  sound,
  marks: []
})

const edit = (change: Partial<FilmEdit> = {}): FilmEdit => ({
  version: 1,
  clips: [
    { id: 'clip-1', name: 'a.mp4', start: 2, end: 6, sound: false },
    { id: 'clip-2', name: 'b.mp4', start: 0, end: 3, sound: true }
  ],
  music: [],
  texts: [],
  underSound: 0.15,
  ...change
})

const args = (film: FilmEdit, music: MusicSource[] = []) =>
  filmArgs({
    edit: film,
    sources: new Map([
      ['a.mp4', source('a.mp4')],
      ['b.mp4', source('b.mp4')]
    ]),
    music: new Map(music.map((one) => [one.name, one])),
    width: 1920,
    height: 1080,
    fonts: {},
    textFileOf: (id) => `/tmp/${id}.txt`,
    out: '/out/.film.rendering'
  })

const graph = (all: string[]) => all[all.indexOf('-filter_complex') + 1] ?? ''

describe('rendering the film', () => {
  it('makes it from the processed copies, never the proxies, cut to each part and joined end to end', () => {
    const made = args(edit())
    expect(made.filter((one, i) => made[i - 1] === '-i')).toEqual([
      '/out/videos/a.mp4',
      '/out/videos/b.mp4'
    ])
    expect(graph(made)).toContain('[0:v]trim=start=2:end=6')
    expect(graph(made)).toContain('concat=n=2:v=1:a=1')
    expect(made.slice(made.indexOf('-t'), made.indexOf('-t') + 2)).toEqual(['-t', '7'])
  })

  it('is MP4 with H.264 video and AAC sound, written aside under another name', () => {
    const made = args(edit())
    expect(made).toEqual(expect.arrayContaining(['libx264', 'aac', '+faststart']))
    expect(made.slice(-3)).toEqual(['-f', 'mp4', '/out/.film.rendering'])
  })

  it('hears a clip only when its speaker is on, and puts silence in for the others', () => {
    const made = graph(args(edit()))
    expect(made).toContain('[1:a]atrim=start=0:end=3')
    expect(made).not.toContain('[0:a]')
    expect(made).toContain('anullsrc')
  })

  it('dips the music under the camera sound, and nowhere else', () => {
    const film = edit({
      music: [{ id: 'music-1', name: 'song.mp3', at: 0, start: 0, end: 7, volume: 0.8 }]
    })
    const made = graph(args(film, [{ name: 'song.mp3', path: '/out/music/song.mp3', seconds: 60 }]))
    expect(made).toContain("volume='0.8*(1-0.85*")
    expect(made).toContain('amix=inputs=2:duration=first:normalize=0')
    const spans = heardSpans(film, () => true)
    expect(spans).toEqual([{ from: 4, to: 7 }])
    expect(musicLevelAt(0.8, 0.15, spans, 1)).toBeCloseTo(0.8)
    expect(musicLevelAt(0.8, 0.15, spans, 5)).toBeCloseTo(0.12)
    expect(duckAt(spans, 3.6)).toBeCloseTo(0.5)
  })

  it('leaves the music alone when no clip is heard', () => {
    expect(duckOf(heardSpans(edit(), () => false))).toBeNull()
  })

  it('draws each text the way the picture shows it, from its own file of words', () => {
    const made = graph(
      args(
        edit({
          texts: [
            {
              id: 'text-1',
              text: 'Luc',
              at: 1,
              seconds: 3,
              effect: 'rise',
              font: 'bold',
              x: 0.5,
              y: 0.4,
              size: 0.1,
              colour: '#ffcc00'
            }
          ]
        })
      )
    )
    expect(made).toContain("textfile='/tmp/text-1.txt'")
    expect(made).toContain('fontcolor=0xffcc00')
    expect(made).toContain("enable='between(t,1,4)'")
    const look = textLookAt(
      {
        id: 'text-1',
        text: 'Luc',
        at: 1,
        seconds: 3,
        effect: 'rise',
        font: 'bold',
        x: 0.5,
        y: 0.4,
        size: 0.1,
        colour: '#ffcc00'
      },
      1.3
    )
    expect(look.opacity).toBeCloseTo(0.5)
    expect(look.dy).toBeGreaterThan(0)
  })

  it('refuses a clip that is not in the montage any more', () => {
    expect(() =>
      args(edit({ clips: [{ id: 'clip-9', name: 'gone.mp4', start: 0, end: 1, sound: false }] }))
    ).toThrow(/gone\.mp4 is not in the montage any more/)
  })
})
