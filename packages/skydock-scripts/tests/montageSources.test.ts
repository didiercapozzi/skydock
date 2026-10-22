// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editSources, montageSources } from '../src/filmEdit'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs, filmShape } from '../src/filmRender'
import { cutProxiesOf } from '../src/montageClips'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { durationOf, rgbAt } from './ffmpegFixtures'
import { createTmpDir } from './fixtures'

let dir: string

/* two seconds of red, then two of blue */
const twoColours = (file: string, size = '320x180') =>
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=red:s=${size}:r=25:d=2`,
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:s=${size}:r=25:d=2`,
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    file
  ])

const clip = (name: string, over: Partial<ManifestFile> = {}, size?: string): ManifestFile => {
  const file = path.join(dir, 'original_files', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  twoColours(file, size)
  return { path: file, size: 1, mtime: 1_788_000_000, filename: name, id: name, ...over }
}

const montage = (files: ManifestFile[]): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '08.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files
})

const board = (group: ManifestGroup): Manifest => ({
  version: 1,
  createdAt: '2026-08-08',
  files: group.files,
  groups: [group],
  destinations: []
})

const colourAt = (file: string, at: number) => {
  const { r, b } = rgbAt(file, { at, filter: 'scale=1:1' })
  return r > b ? 'red' : 'blue'
}

beforeEach(() => {
  dir = createTmpDir('skydock-montage-sources-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the clips a film can be edited from, with nothing processed', () => {
  it('are the montage’s own clips, whole and played as they are when the board changed nothing', async () => {
    const group = montage([clip('GX010001.MP4')])

    const [source] = await editSources(dir, group)

    expect(source).toMatchObject({
      path: group.files[0]!.path,
      play: group.files[0]!.path,
      seconds: expect.closeTo(4, 0),
      key: 'GX010001.MP4'
    })
    expect(source?.origin).toBeUndefined()
  })

  it('play the proxy of a clip that has one', async () => {
    const proxy = path.join(dir, 'proxy.mp4')
    twoColours(proxy, '160x90')
    const group = montage([{ ...clip('GX010001.MP4'), proxy }])

    expect((await editSources(dir, group))[0]?.play).toBe(proxy)
  })

  it('are as long as what the board left of them, and wait for their small copy', async () => {
    const group = montage([clip('GX010001.MP4', { cropStart: 2, cropEnd: 3.5 })])

    const found = await montageSources(dir, group)

    expect(found.sources).toEqual([])
    expect(found.waiting.map((one) => one.filename)).toEqual(['GX010001.MP4'])
    expect(found.waiting[0]?.source).toMatchObject({
      seconds: 1.5,
      origin: { offset: 2 }
    })
  })

  it('play the small copy once it is cut', async () => {
    const proxy = path.join(dir, 'proxy.mp4')
    twoColours(proxy, '160x90')
    const group = montage([{ ...clip('GX010001.MP4', { cropStart: 2 }), proxy }])
    await cutProxiesOf(board(group), dir)

    const { sources, waiting } = await montageSources(dir, group)

    expect(waiting).toEqual([])
    expect(sources[0]?.seconds).toBeCloseTo(2, 0)
    expect(sources[0]?.play).toContain(path.join('proxies', 'cut', 'g1'))
    expect(colourAt(sources[0]!.play, 0.5)).toBe('blue')
  })

  it('are listed with the names their copies will have', async () => {
    const group = montage([
      clip('GX010001.MP4'),
      clip('GX010002.MP4', { id: 'b', mtime: 1_788_000_300 })
    ])

    const names = (await editSources(dir, group)).map((one) => one.name)

    expect(names).toHaveLength(2)
    for (const name of names) expect(name).toMatch(/^luc_favre_\d{8}_\d{6}\.mp4$/)
  })
})

describe('the render of a clip the board changed, done on the clip itself', () => {
  const render = (
    group: ManifestGroup,
    sources: EditSource[],
    edit: FilmEdit,
    width = 320,
    height = 180
  ) => {
    const out = path.join(dir, 'film.mp4')
    execFileSync(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        ...filmArgs({
          edit,
          sources: new Map(sources.map((one) => [one.name, one])),
          music: new Map(),
          width,
          height,
          fonts: {},
          textFileOf: (id) => path.join(dir, `${id}.txt`),
          out
        })
      ],
      { stdio: 'pipe' }
    )
    return out
  }

  const filmOf = (name: string, end: number): FilmEdit => ({
    version: 1,
    clips: [{ id: 'clip-1', name, start: 0, end, sound: false }],
    music: [],
    texts: [],
    underSound: 0.15
  })

  it('starts where the board’s trim starts, whatever the film’s own trim', async () => {
    const group = montage([clip('GX010001.MP4', { cropStart: 2 })])
    const { waiting } = await montageSources(dir, group)
    const sources = waiting.map((one) => one.source)

    const out = render(group, sources, filmOf(sources[0]!.name, 1.5))

    expect(durationOf(out)).toBeCloseTo(1.5, 0)
    expect(colourAt(out, 0.2)).toBe('blue')
    expect(colourAt(out, 1.2)).toBe('blue')
  })

  it('is untouched for a clip the board left whole', async () => {
    const group = montage([clip('GX010001.MP4')])
    const sources = await editSources(dir, group)

    const out = render(group, sources, filmOf(sources[0]!.name, 3.5))

    expect(colourAt(out, 0.5)).toBe('red')
    expect(colourAt(out, 3)).toBe('blue')
  })

  it('is the shape the board gave it: turned, a landscape clip is upright', async () => {
    const group = montage([clip('GX010001.MP4', { rotation: 90 })])
    const sources = await editSources(dir, group, { waiting: true })

    expect(sources[0]?.origin?.upright).toBe(true)
    expect(await filmShape(sources[0])).toEqual({ width: 1080, height: 1920 })
  })

  it('is framed by the board’s frame inside the film', async () => {
    const group = montage([clip('GX010001.MP4', { frame: { x: 0, y: 0, width: 0.5, height: 1 } })])
    const sources = await editSources(dir, group, { waiting: true })

    expect(sources[0]?.origin?.filter).toContain('crop=')
    const out = render(group, sources, filmOf(sources[0]!.name, 1))
    expect(colourAt(out, 0.5)).toBe('red')
  })
})

describe('the montage’s folder', () => {
  it('is made with the first edit that is saved, since nothing was processed into it', async () => {
    const { saveEdit, editPathOf } = await import('../src/filmEdit')
    const group = montage([clip('GX010001.MP4')])
    const editPath = editPathOf(dir, group)
    expect(fs.existsSync(path.dirname(editPath))).toBe(false)

    await saveEdit(editPath, { version: 1, clips: [], music: [], texts: [], underSound: 0.15 })

    expect(fs.existsSync(editPath)).toBe(true)
  })
})
