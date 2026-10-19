// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { filmLength } from '../src/filmEditShape'
import type { EditText, FilmEdit } from '../src/filmEditShape'
import { applyTemplate, captureTemplate, filmTemplateSchema } from '../src/filmTemplate'
import type { FilmTemplate } from '../src/filmTemplate'

const text = (over: Partial<EditText>): EditText => ({
  id: 'text-1',
  text: 'Title',
  at: 0,
  seconds: 4,
  effect: 'fade',
  font: 'bold',
  x: 0.5,
  y: 0.5,
  size: 0.09,
  colour: '#ffffff',
  ...over
})

const clip = (id: string, end: number, over: object = {}) => ({
  id,
  name: `${id}.mp4`,
  start: 0,
  end,
  sound: false,
  ...over
})

const film = (over: Partial<FilmEdit> = {}): FilmEdit => ({
  version: 1,
  clips: [clip('a', 40), clip('b', 80)],
  music: [],
  texts: [],
  underSound: 0.15,
  ...over
})

const full = film({
  texts: [
    text({ text: 'Ana Silva' }),
    text({ id: 'text-2', text: 'Thanks for flying, 2026-05-09', at: 112, seconds: 8 })
  ],
  music: [{ id: 'music-1', name: 'Summer.mp3', at: 0, start: 0, end: 120, volume: 0.8 }],
  underSound: 0.3
})

const who = { name: 'Ana Silva', day: '2026-05-09' }
const summer = [{ name: 'Summer.mp3', seconds: 300 }]

const sixty = film({ clips: [clip('a', 60)] })

const template = (over: Partial<FilmTemplate> = {}): FilmTemplate => ({
  version: 1,
  length: 120,
  underSound: 0.15,
  texts: [],
  music: [],
  ...over
})

const tpl = (t: Partial<EditText> & { from?: 'start' | 'end' } = {}) => {
  const { from = 'start', ...rest } = t
  const { id: _id, ...kept } = text(rest)
  return { ...kept, from }
}

const piece = (over: object = {}) => ({
  name: 'Summer.mp3',
  from: 'start' as const,
  at: 0,
  start: 0,
  end: 120,
  volume: 0.8,
  ...over
})

describe('captureTemplate', () => {
  it('keeps the texts, the music and the camera-sound level of a film and none of its clips', () => {
    const captured = captureTemplate(full, who)
    expect(filmTemplateSchema.safeParse(captured).success).toBe(true)
    expect(captured).toMatchObject({ length: 120, underSound: 0.3 })
    expect(captured.texts).toHaveLength(2)
    expect(captured.music).toEqual([piece()])
    expect(JSON.stringify(captured)).not.toContain('mp4')
  })

  it("turns the person's name and the day into placeholders", () => {
    const { texts } = captureTemplate(full, { name: 'ana silva', day: '2026-05-09' })
    expect(texts.map((t) => t.text)).toEqual(['{name}', 'Thanks for flying, {day}'])
  })

  it('swaps whole words only, in one pass', () => {
    const one = (name: string, day: string, said: string) =>
      captureTemplate(film({ texts: [text({ text: said })] }), { name, day }).texts[0]?.text
    expect(one('Ann', '', 'Annual dinner with Ann')).toBe('Annual dinner with {name}')
    expect(one('Ali', '', 'Alpine, Ali!')).toBe('Alpine, {name}!')
    expect(one('Aya', '2026-05-09', 'Aya on 2026-05-09')).toBe('{name} on {day}')
    expect(one('day', '', '{day} and day')).toBe('{day} and {name}')
    expect(one('Zoë', '', 'Hello zoë')).toBe('Hello {name}')
  })

  it('leaves a day of under three characters as written', () => {
    const said = film({ texts: [text({ text: 'Row 5 of 5' })] })
    expect(captureTemplate(said, { name: '', day: '5' }).texts[0]?.text).toBe('Row 5 of 5')
  })

  it('leaves a name of under three letters as written', () => {
    const said = film({ texts: [text({ text: 'Al and al' })] })
    expect(captureTemplate(said, { name: 'Al', day: '' }).texts[0]?.text).toBe('Al and al')
  })

  it('keeps a text within its limit after the swap', () => {
    const said = film({ texts: [text({ text: `Ann ${'x'.repeat(196)}` })] })
    const [captured] = captureTemplate(said, { name: 'Ann', day: '' }).texts
    expect(captured?.text).toHaveLength(200)
    expect(
      filmTemplateSchema.safeParse(captureTemplate(said, { name: 'Ann', day: '' })).success
    ).toBe(true)
  })

  it('replaces nothing when the name and the day are empty', () => {
    expect(captureTemplate(full, { name: ' ', day: '' }).texts[0]?.text).toBe('Ana Silva')
  })

  it('keeps what finishes with the film at the end of the film', () => {
    const [, credits] = captureTemplate(full, who).texts
    expect(credits).toMatchObject({ from: 'end', at: 8 })
  })

  it('puts a title that fills a short film at the start', () => {
    const short = film({ clips: [clip('a', 4)], texts: [text({})] })
    expect(captureTemplate(short, who).texts[0]).toMatchObject({ from: 'start', at: 0 })
  })

  it('drops a text that is empty', () => {
    expect(captureTemplate(film({ texts: [text({ text: '  ' })] }), who).texts).toEqual([])
  })

  it('keeps the fade that most clips have into the one before, and none when there is none', () => {
    const faded = film({
      clips: [
        clip('a', 30),
        clip('b', 30, { fade: 2 }),
        clip('c', 30, { fade: 1 }),
        clip('d', 30, { fade: 1 }),
        clip('e', 30, { gap: 3, fade: 5 })
      ]
    })
    const captured = captureTemplate(faded, who)
    expect(captured.fade).toBe(1)
    expect(filmTemplateSchema.safeParse(captured).success).toBe(true)
    expect('fade' in captureTemplate(full, who)).toBe(false)
  })

  it('keeps the length within what a template allows', () => {
    expect(captureTemplate(film({ clips: [clip('a', 2)] }), who).length).toBe(5)
  })
})

describe('applyTemplate', () => {
  const captured = captureTemplate(full, who)
  const person = { name: 'Bo Chen', day: '2026-06-01', music: summer }

  it('fits a template to a shorter and a longer film', () => {
    const shorter = applyTemplate(sixty, captured, person).edit
    expect(shorter.texts.map((t) => [t.text, t.at, t.seconds])).toEqual([
      ['Bo Chen', 0, 4],
      ['Thanks for flying, 2026-06-01', 52, 8]
    ])
    const longer = applyTemplate(film({ clips: [clip('a', 200)] }), captured, person).edit
    expect(longer.texts[1]?.at).toBe(192)
  })

  it('cuts the music to the film and to the music file', () => {
    expect(applyTemplate(sixty, captured, person).edit.music[0]).toMatchObject({
      id: 'music-1',
      at: 0,
      end: 60,
      volume: 0.8
    })
    const long = film({ clips: [clip('a', 200)] })
    expect(applyTemplate(long, captured, person).edit.music[0]?.end).toBe(120)
    const small = [{ name: 'Summer.mp3', seconds: 30 }]
    expect(applyTemplate(long, captured, { ...person, music: small }).edit.music[0]?.end).toBe(30)
  })

  it('keeps $ sequences in a name as written and trims the day too', () => {
    const template = captureTemplate(full, who)
    const { texts } = applyTemplate(sixty, template, {
      name: 'Cash $& $$',
      day: ' 1 May ',
      music: summer
    }).edit
    expect(texts.map((t) => t.text)).toEqual(['Cash $& $$', 'Thanks for flying, 1 May'])
  })

  it('cuts music to the film when the music files are not checked', () => {
    const late = template({ length: 60, music: [piece({ at: 50, end: 120 })] })
    const [kept] = applyTemplate(sixty, late, { ...person, music: null }).edit.music
    expect(kept).toMatchObject({ at: 50, start: 0, end: 10 })
  })

  it('says which music it cut because the film is too short for it', () => {
    const result = applyTemplate(sixty, template({ music: [piece({ at: 70 })] }), person)
    expect(result.cut).toEqual(['Summer.mp3'])
    expect(result.left).toEqual([])
  })

  it('leaves out music that is not in the music folder and says which', () => {
    const result = applyTemplate(sixty, captured, { ...person, music: [] })
    expect(result.edit.music).toEqual([])
    expect(result.left).toEqual(['Summer.mp3'])
  })

  it('keeps the music names when it does not check files', () => {
    const result = applyTemplate(sixty, captured, { ...person, music: null })
    expect(result.edit.music[0]).toMatchObject({ name: 'Summer.mp3', end: 60 })
    expect(result.left).toEqual([])
  })

  it('shortens and moves texts that would stick out of the film', () => {
    const wide = template({
      texts: [tpl({ seconds: 30 }), tpl({ from: 'end', at: 10, seconds: 10, text: 'End' })]
    })
    const out = applyTemplate(film({ clips: [clip('a', 12)] }), wide, person).edit.texts
    expect(out.map((t) => [t.at, t.seconds])).toEqual([
      [0, 12],
      [2, 10]
    ])
  })

  it('leaves a text out when the name it needs is empty', () => {
    const out = applyTemplate(sixty, captured, { ...person, name: ' ' }).edit.texts
    expect(out.map((t) => t.text)).toEqual(['Thanks for flying, 2026-06-01'])
  })

  it('applies to a film with no videos', () => {
    const empty = film({ clips: [] })
    const { edit } = applyTemplate(empty, captured, { ...person, music: summer })
    expect(edit.texts.map((t) => t.at)).toEqual([0, 0])
    expect(edit.music[0]?.end).toBe(120)
  })

  it('leaves the clips, gaps, photos and fades as they were', () => {
    const busy = film({
      clips: [clip('a', 30), clip('b', 30, { gap: 2 }), clip('c', 20, { fade: 1 })]
    })
    const { edit } = applyTemplate(busy, captured, person)
    expect(edit.clips).toBe(busy.clips)
    expect(edit.underSound).toBe(0.3)
  })

  it('fades each clip after the first into the one before, apart from those after a gap', () => {
    const busy = film({ clips: [clip('a', 30), clip('b', 30), clip('c', 20, { gap: 2 })] })
    const { edit } = applyTemplate(busy, template({ fade: 1.5 }), person)
    expect(edit.clips.map((one) => one.fade)).toEqual([undefined, 1.5, undefined])
  })

  it('gives the same template back when it captures what it applied', () => {
    const again = captureTemplate(
      applyTemplate(film({ clips: [clip('a', 120)] }), captured, { ...who, music: summer }).edit,
      who
    )
    expect(again).toEqual(captured)
    expect(filmLength(film({ clips: [clip('a', 120)] }))).toBe(120)
  })
})
