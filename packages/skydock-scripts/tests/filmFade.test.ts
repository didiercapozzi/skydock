// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fadeInto, filmEditSchema, filmLength, heardSpans } from '../src/filmEditShape'
import type { FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { durationOf, makeClip, meanDb, rgbAt as pixelAt } from './ffmpegFixtures'
import { createTmpDir } from './fixtures'

let dir: string
let renders = 0

const clip = (name: string, color: string, seconds: number, sound = true) =>
  makeClip(dir, name, color, seconds, sound)

const film = (change: Partial<FilmEdit>): FilmEdit => ({
  version: 1,
  clips: [
    { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
    { id: 'clip-2', name: 'blue.mp4', start: 0, end: 3, sound: true, fade: 1 }
  ],
  music: [],
  texts: [],
  underSound: 0.15,
  ...change
})

const render = (
  edit: FilmEdit,
  music = new Map<string, { name: string; path: string; seconds: number }>()
) => {
  const out = path.join(dir, `film-${renders++}.mp4`)
  const sources = new Map(
    [
      clip('red.mp4', 'red', 3),
      clip('blue.mp4', 'blue', 3),
      clip('quiet.mp4', 'blue', 3, false)
    ].map((one) => [one.name, one])
  )
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      ...filmArgs({
        edit,
        sources,
        music,
        width: 320,
        height: 180,
        fonts: { bold: execFileSync('fc-match', ['-f', '%{file}', 'sans-serif:bold']).toString() },
        textFileOf: (id) => path.join(dir, `${id}.txt`),
        out
      })
    ],
    { stdio: 'pipe' }
  )
  return out
}

const rgbAt = (file: string, at: number) => pixelAt(file, { at, filter: 'scale=1:1' })

beforeEach(() => {
  dir = createTmpDir('skydock-fade-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('rendering a film with a crossfade', () => {
  it('is pure first before the overlap, a blend in the middle of it and pure second after it', () => {
    const file = render(film({}))

    expect(durationOf(file)).toBeCloseTo(5, 0)
    const before = rgbAt(file, 1)
    const middle = rgbAt(file, 2.5)
    const after = rgbAt(file, 4)
    expect(before.r).toBeGreaterThan(150)
    expect(before.b).toBeLessThan(60)
    expect(middle.r).toBeGreaterThan(60)
    expect(middle.b).toBeGreaterThan(60)
    expect(after.b).toBeGreaterThan(150)
    expect(after.r).toBeLessThan(60)
  })

  it('keeps the camera sound through the overlap', () => {
    const file = render(film({}))

    expect(meanDb(file, 0.2, 1.8)).toBeGreaterThan(-40)
    expect(meanDb(file, 2.1, 2.9)).toBeGreaterThan(-40)
    expect(meanDb(file, 3.2, 4.8)).toBeGreaterThan(-40)
  })

  it('keeps the sound off silent through the overlap', () => {
    const file = render(film({ clips: film({}).clips.map((one) => ({ ...one, sound: false })) }))

    expect(meanDb(file, 0.2, 4.8)).toBeLessThan(-60)
  })

  it('crosses into a clip that has no sound of its own', () => {
    const file = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
          { id: 'clip-2', name: 'quiet.mp4', start: 0, end: 3, sound: true, fade: 1 }
        ]
      })
    )

    expect(durationOf(file)).toBeCloseTo(5, 0)
    expect(rgbAt(file, 4).b).toBeGreaterThan(150)
    expect(meanDb(file, 0.2, 1.8)).toBeGreaterThan(-40)
    expect(meanDb(file, 3.2, 4.8)).toBeLessThan(-60)
  })

  it('mixes a crossfade, a cut and a gap in one film', () => {
    const file = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
          { id: 'clip-2', name: 'blue.mp4', start: 0, end: 3, sound: true, fade: 1 },
          { id: 'clip-3', name: 'red.mp4', start: 0, end: 2, sound: true },
          { id: 'clip-4', name: 'blue.mp4', start: 0, end: 2, sound: true, gap: 1 }
        ]
      })
    )

    expect(durationOf(file)).toBeCloseTo(10, 0)
    expect(rgbAt(file, 2.5).r).toBeGreaterThan(60)
    expect(rgbAt(file, 2.5).b).toBeGreaterThan(60)
    expect(rgbAt(file, 4.5).b).toBeGreaterThan(150)
    expect(rgbAt(file, 5.5).r).toBeGreaterThan(150)
    expect(Math.max(...Object.values(rgbAt(file, 7.5)))).toBeLessThan(40)
    expect(rgbAt(file, 9).b).toBeGreaterThan(150)
  })

  it('crosses two seams in a row', () => {
    const file = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
          { id: 'clip-2', name: 'blue.mp4', start: 0, end: 3, sound: true, fade: 1 },
          { id: 'clip-3', name: 'red.mp4', start: 0, end: 3, sound: true, fade: 1 }
        ]
      })
    )

    expect(durationOf(file)).toBeCloseTo(7, 0)
    expect(rgbAt(file, 2.5).b).toBeGreaterThan(60)
    expect(rgbAt(file, 2.5).r).toBeGreaterThan(60)
    expect(rgbAt(file, 4.5).r).toBeGreaterThan(60)
    expect(rgbAt(file, 4.5).b).toBeGreaterThan(60)
    expect(rgbAt(file, 6).r).toBeGreaterThan(150)
  })

  it('blends a middle clip wholly inside two fades, with the length of the film to the frame', () => {
    const edit = film({
      clips: [
        { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
        { id: 'clip-2', name: 'blue.mp4', start: 0, end: 2, sound: true, fade: 1 },
        { id: 'clip-3', name: 'red.mp4', start: 0, end: 3, sound: true, fade: 1 }
      ]
    })
    const file = render(edit)

    expect(filmLength(edit)).toBe(6)
    expect(Math.abs(durationOf(file) - 6)).toBeLessThan(0.05)
    expect(rgbAt(file, 2.5).r).toBeGreaterThan(60)
    expect(rgbAt(file, 2.5).b).toBeGreaterThan(60)
    expect(rgbAt(file, 3.5).r).toBeGreaterThan(60)
    expect(rgbAt(file, 3.5).b).toBeGreaterThan(60)
    expect(rgbAt(file, 5.5).r).toBeGreaterThan(150)
  })

  it('holds a fade down to half of the shorter clip', () => {
    const file = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true },
          { id: 'clip-2', name: 'blue.mp4', start: 0, end: 1, sound: true, fade: 2 }
        ]
      })
    )

    expect(durationOf(file)).toBeCloseTo(3.5, 0)
  })

  it('ends the film where the text goes on past the shortened video', () => {
    fs.writeFileSync(path.join(dir, 'text-1.txt'), 'Fin')
    const file = render(
      film({
        texts: [
          {
            id: 'text-1',
            text: 'Fin',
            at: 4,
            seconds: 2,
            effect: 'fade',
            font: 'clean',
            x: 0.5,
            y: 0.5,
            size: 0.1,
            colour: '#ffffff'
          }
        ]
      })
    )

    expect(durationOf(file)).toBeCloseTo(6, 0)
  })
})

describe('music over a crossfade', () => {
  it('dips only over the camera sound that is heard, and plays on past the shortened video', () => {
    const song = path.join(dir, 'song.wav')
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=f=3000:d=8',
      song
    ])
    const file = render(
      film({
        clips: film({}).clips.map((one, index) => ({ ...one, sound: index === 1 })),
        music: [{ id: 'music-1', name: 'song.wav', at: 0, start: 0, end: 8, volume: 1 }]
      }),
      new Map([['song.wav', { name: 'song.wav', path: song, seconds: 8 }]])
    )
    const high = 'highpass=f=2500'

    expect(durationOf(file)).toBeCloseTo(8, 0)
    const open = meanDb(file, 0.1, 1, high)
    const under = meanDb(file, 3.2, 4.6, high)
    const after = meanDb(file, 6.6, 7.8, high)
    expect(open - under).toBeGreaterThan(10)
    expect(after - under).toBeGreaterThan(10)
  })
})

describe('the saved crossfade', () => {
  it('survives the schema, and a plain cut has none', () => {
    const kept = filmEditSchema.parse(film({}))
    expect(kept.clips[1]?.fade).toBe(1)
    expect(kept.clips[0]?.fade).toBeUndefined()
    expect(
      filmEditSchema.safeParse(film({ clips: [{ ...kept.clips[0]!, fade: 0 }] })).success
    ).toBe(false)
    expect(
      filmEditSchema.safeParse(film({ clips: [{ ...kept.clips[0]!, fade: Infinity }] })).success
    ).toBe(false)
  })

  it('shortens the film and the camera sound spans by the overlap', () => {
    const edit = film({})
    expect(filmLength(edit)).toBe(5)
    expect(heardSpans(edit, () => true)).toEqual([{ from: 0, to: 5 }])
  })

  it('is held to half of the shorter clip and ignored beside a gap or at the start', () => {
    const clips = [
      { id: 'a', name: 'red.mp4', start: 0, end: 3, sound: true, fade: 1 },
      { id: 'b', name: 'blue.mp4', start: 0, end: 1, sound: true, fade: 2 },
      { id: 'c', name: 'red.mp4', start: 0, end: 3, sound: true, fade: 1, gap: 1 }
    ]
    expect(fadeInto(clips, 0)).toBe(0)
    expect(fadeInto(clips, 1)).toBe(0.5)
    expect(fadeInto(clips, 2)).toBe(0)
  })
})

describe('a fade on one clip alone', () => {
  const faded = (over: object = {}) => [
    { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true, fadeIn: 1, fadeOut: 1, ...over }
  ]

  it('comes from black, reaches the colour and goes back to black', () => {
    const file = render(film({ clips: faded() }))

    expect(durationOf(file)).toBeCloseTo(3, 0)
    expect(rgbAt(file, 0.04).r).toBeLessThan(40)
    expect(rgbAt(file, 0.5).r).toBeGreaterThan(40)
    expect(rgbAt(file, 0.5).r).toBeLessThan(rgbAt(file, 1.5).r)
    expect(rgbAt(file, 1.5).r).toBeGreaterThan(150)
    expect(rgbAt(file, 2.96).r).toBeLessThan(40)
  })

  it('takes the camera sound with it, and leaves a muted clip silent', () => {
    const file = render(film({ clips: faded() }))

    expect(meanDb(file, 0, 0.2)).toBeLessThan(meanDb(file, 1.2, 1.8) - 10)
    expect(meanDb(file, 2.8, 3)).toBeLessThan(meanDb(file, 1.2, 1.8) - 10)
    expect(meanDb(render(film({ clips: faded({ sound: false }) })), 1.2, 1.8)).toBeLessThan(-60)
  })

  it('fades one side only', () => {
    const file = render(film({ clips: faded({ fadeIn: 0 }) }))

    expect(rgbAt(file, 0.04).r).toBeGreaterThan(150)
    expect(rgbAt(file, 2.96).r).toBeLessThan(40)
  })

  it('fades beside a gap, and under a crossfade only on the outer sides', () => {
    const gapped = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true, fadeOut: 1 },
          { id: 'clip-2', name: 'blue.mp4', start: 0, end: 3, sound: true, gap: 1, fadeIn: 1 }
        ]
      })
    )
    expect(rgbAt(gapped, 1).r).toBeGreaterThan(150)
    expect(rgbAt(gapped, 2.96).r).toBeLessThan(40)
    expect(Math.max(...Object.values(rgbAt(gapped, 3.5)))).toBeLessThan(40)
    expect(rgbAt(gapped, 4.04).b).toBeLessThan(40)
    expect(rgbAt(gapped, 6).b).toBeGreaterThan(150)

    const crossed = render(
      film({
        clips: [
          { id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: true, fadeIn: 1, fadeOut: 1 },
          {
            id: 'clip-2',
            name: 'blue.mp4',
            start: 0,
            end: 3,
            sound: true,
            fade: 1,
            fadeIn: 1,
            fadeOut: 1
          }
        ]
      })
    )
    expect(durationOf(crossed)).toBeCloseTo(5, 0)
    expect(rgbAt(crossed, 0.04).r).toBeLessThan(40)
    expect(rgbAt(crossed, 1.5).r).toBeGreaterThan(150)
    expect(rgbAt(crossed, 2.5).r).toBeGreaterThan(60)
    expect(rgbAt(crossed, 2.5).b).toBeGreaterThan(60)
    expect(rgbAt(crossed, 3.5).b).toBeGreaterThan(150)
    expect(rgbAt(crossed, 4.96).b).toBeLessThan(40)
  })
})

describe('a fade on a text', () => {
  const writing = (over: object) => {
    fs.writeFileSync(path.join(dir, 'text-1.txt'), 'WWWW')
    return film({
      clips: [{ id: 'clip-1', name: 'red.mp4', start: 0, end: 3, sound: false }],
      texts: [
        {
          id: 'text-1',
          text: 'WWWW',
          at: 0,
          seconds: 3,
          effect: 'fade',
          font: 'bold',
          x: 0.5,
          y: 0.5,
          size: 0.4,
          colour: '#ffffff',
          ...over
        }
      ]
    })
  }

  it('lets the words in and out over the length given, on top of the effect', () => {
    const file = render(writing({ fadeIn: 1.4, fadeOut: 1.4 }))
    const plain = render(writing({}))

    expect(rgbAt(file, 0.7).g).toBeLessThan(rgbAt(plain, 0.7).g)
    expect(rgbAt(file, 0.7).g).toBeLessThan(rgbAt(file, 1.5).g)
    expect(rgbAt(file, 2.3).g).toBeLessThan(rgbAt(file, 1.5).g)
    expect(rgbAt(plain, 0.7).g).toBeGreaterThan(rgbAt(file, 0.7).g + 4)
  })
})

describe('a fade on music', () => {
  const song = () => {
    const file = path.join(dir, 'song.wav')
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=f=3000:d=8',
      file
    ])
    return new Map([['song.wav', { name: 'song.wav', path: file, seconds: 8 }]])
  }
  const played = (over: object) =>
    render(
      film({
        clips: film({}).clips.map((one) => ({ ...one, sound: false })),
        music: [{ id: 'music-1', name: 'song.wav', at: 0, start: 0, end: 8, volume: 1, ...over }]
      }),
      song()
    )
  const high = 'highpass=f=2500'

  it('rises over the length given and falls over the length given', () => {
    const file = played({ fadeIn: 3, fadeOut: 3 })

    expect(meanDb(file, 0, 0.5, high)).toBeLessThan(meanDb(file, 3.2, 4.5, high) - 10)
    expect(meanDb(file, 7.4, 8, high)).toBeLessThan(meanDb(file, 3.2, 4.5, high) - 10)
  })

  it('has none at 0 and none when absent', () => {
    const none = played({ fadeIn: 0, fadeOut: 0 })
    const absent = played({})

    expect(meanDb(absent, 0.1, 0.2, high)).toBeCloseTo(meanDb(none, 0.1, 0.2, high), 0)
    expect(meanDb(absent, 7.7, 7.95, high)).toBeCloseTo(meanDb(none, 7.7, 7.95, high), 0)
    expect(meanDb(none, 7.7, 7.95, high)).toBeGreaterThan(meanDb(none, 3.2, 4.5, high) - 3)
  })
})
