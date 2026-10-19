// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  duckAt,
  filmEditSchema,
  filmLength,
  heardSpans,
  musicLevelAt,
  textLookAt,
  timelineEnd
} from '../src/filmEditShape'
import type { EditSource, FilmEdit, MusicSource } from '../src/filmEditShape'
import { availableFormats, duckOf, filmArgs, filmShape } from '../src/filmRender'

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
    expect(musicLevelAt(film.music[0]!, 0.15, spans, 1)).toBeCloseTo(0.8)
    expect(musicLevelAt(film.music[0]!, 0.15, spans, 5)).toBeCloseTo(0.12)
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

describe('the gap before a clip', () => {
  const gapped = edit({
    clips: [
      { id: 'clip-1', name: 'a.mp4', start: 2, end: 6, sound: true },
      { id: 'clip-2', name: 'b.mp4', start: 0, end: 3, sound: true, gap: 2 }
    ],
    music: [{ id: 'music-1', name: 'song.mp3', at: 5, start: 0, end: 6, volume: 0.8 }]
  })

  it('is accepted when it is zero or more, and refused when it is below zero or not finite', () => {
    const parse = (gap: unknown) =>
      filmEditSchema.safeParse({
        ...gapped,
        clips: [{ id: 'c', name: 'a.mp4', start: 0, end: 1, sound: false, gap }]
      }).success
    expect(parse(0)).toBe(true)
    expect(parse(2.5)).toBe(true)
    expect(parse(undefined)).toBe(true)
    expect(parse(-1)).toBe(false)
    expect(parse(Number.POSITIVE_INFINITY)).toBe(false)
    expect(parse('2')).toBe(false)
  })

  it('leaves a file without gaps as it was', () => {
    const old = edit()
    expect(filmEditSchema.parse(JSON.parse(JSON.stringify(old)))).toEqual(old)
    expect(filmEditSchema.parse(JSON.parse(JSON.stringify(gapped))).clips[1]!.gap).toBe(2)
  })

  it('counts in the length of the film, where the camera sound is heard, and the end of the timeline', () => {
    expect(filmLength(gapped)).toBe(9)
    expect(heardSpans(gapped, () => true)).toEqual([
      { from: 0, to: 4 },
      { from: 6, to: 9 }
    ])
    expect(timelineEnd(gapped)).toBe(11)
    expect(timelineEnd(edit())).toBe(7)
  })

  it('is a black picture with silence in the graph, and the render runs to the end of the music', () => {
    const made = args(gapped, [{ name: 'song.mp3', path: '/out/music/song.mp3', seconds: 60 }])
    const joined = graph(made)
    expect(joined).toContain('color=c=black:s=1920x1080:r=30:d=2')
    expect(joined).toContain('[v0][a0][vg1][ag1][v1][a1][vt][at]concat=n=4:v=1:a=1')
    expect(made.slice(made.indexOf('-t'), made.indexOf('-t') + 2)).toEqual(['-t', '11'])
  })
})

describe('a clip played faster or slower', () => {
  const graphOf = (speed: number) =>
    graph(
      args(
        edit({
          clips: [{ id: 'clip-1', name: 'b.mp4', start: 0, end: 4, sound: true, speed }]
        })
      )
    )

  it('speeds the picture and the sound together and lasts its part over its speed', () => {
    const made = graphOf(2)
    expect(made).toContain('setpts=(PTS-STARTPTS)/2')
    expect(made).toContain('atempo=2')
    expect(made).toContain('apad=whole_dur=2')
  })

  it('chains the sound tempo when it is slower than half', () => {
    expect(graphOf(0.25)).toContain('atempo=0.5,atempo=0.5')
  })

  it('refuses a speed outside a quarter to four times', () => {
    const bad = { ...edit().clips[0]!, speed: 5 }
    expect(filmEditSchema.safeParse(edit({ clips: [bad] })).success).toBe(false)
  })
})

describe('the output of the film', () => {
  const after = (film: FilmEdit, flag: string) => {
    const made = args(film)
    return made[made.indexOf(flag) + 1]
  }

  it('is H.264 at 30 frames a second and a constant quality of 18 when nothing is chosen', () => {
    expect(after(edit(), '-c:v')).toBe('libx264')
    expect(after(edit(), '-crf')).toBe('18')
    expect(after(edit(), '-r')).toBe('30')
    expect(graph(args(edit()))).toContain('fps=30')
    expect(after(edit({ output: {} }), '-c:v')).toBe('libx264')
  })

  it('is H.265 or AV1 when chosen, each with its own usual quality, and tagged to play on Apple devices', () => {
    const h265 = args(edit({ output: { format: 'h265' } }))
    expect(h265[h265.indexOf('-c:v') + 1]).toBe('libx265')
    expect(h265[h265.indexOf('-crf') + 1]).toBe('22')
    expect(h265[h265.indexOf('-tag:v') + 1]).toBe('hvc1')
    expect(after(edit({ output: { format: 'av1' } }), '-c:v')).toBe('libsvtav1')
    expect(after(edit({ output: { format: 'av1' } }), '-crf')).toBe('28')
  })

  it('has the quality that is asked for, whatever the format', () => {
    expect(after(edit({ output: { crf: 14 } }), '-crf')).toBe('14')
    expect(after(edit({ output: { format: 'h265', crf: 30 } }), '-crf')).toBe('30')
  })

  it('has the frame rate that is asked for in every place that has one', () => {
    const made = args(edit({ output: { fps: 24 } }))
    expect(made[made.indexOf('-r') + 1]).toBe('24')
    expect(graph(made)).toContain('fps=24')
    expect(graph(made)).not.toContain('fps=30')
  })

  it('is read back only when it is a format and a frame rate that exist', () => {
    expect(
      filmEditSchema.safeParse(edit({ output: { format: 'h265', fps: 60, crf: 20 } })).success
    ).toBe(true)
    expect(filmEditSchema.safeParse({ ...edit(), output: { format: 'vp9' } }).success).toBe(false)
    expect(filmEditSchema.safeParse({ ...edit(), output: { fps: 29 } }).success).toBe(false)
    expect(filmEditSchema.safeParse({ ...edit(), output: { crf: 99 } }).success).toBe(false)
  })

  it('is in the shape of the first clip, full size', async () => {
    expect(await filmShape(undefined)).toEqual({ width: 1920, height: 1080 })
  })

  it('lists the formats this computer can make, H.264 always first', async () => {
    const formats = await availableFormats()
    expect(formats[0]).toBe('h264')
    expect(new Set(formats).size).toBe(formats.length)
  })
})
