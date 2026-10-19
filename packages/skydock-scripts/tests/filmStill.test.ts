// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editSources, firstEdit } from '../src/filmEdit'
import { STILL_MAX, STILL_SECONDS } from '../src/filmEditShape'
import type { EditSource, FilmEdit } from '../src/filmEditShape'
import { filmArgs } from '../src/filmRender'
import { getGroupProcessedDir } from '../src/process'
import type { Manifest, ManifestGroup } from '../src/types'
import { createTmpDir } from './fixtures'

let dir: string

const group: ManifestGroup = {
  id: 'g1',
  label: 'jump',
  day: '01.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  files: []
}

const manifest = { files: [], groups: [group] } as unknown as Manifest

const montageDir = () => getGroupProcessedDir(dir, group).dir

const photo = (name: string, color: string) => {
  const file = path.join(montageDir(), 'photos', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=320x180`,
    '-frames:v',
    '1',
    file
  ])
  return file
}

const video = (name: string, color: string, seconds: number) => {
  const file = path.join(montageDir(), 'videos', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=320x180:r=25:d=${seconds}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    file
  ])
  return file
}

const seconds = (file: string) =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file
    ])
      .toString()
      .trim()
  )

const colourAt = (file: string, at: number) => {
  const [r = 0, , b = 0] = execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-ss',
    String(at),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  return r > b ? 'red' : 'blue'
}

beforeEach(() => {
  dir = createTmpDir('skydock-still-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the photos of a montage in its film', () => {
  it('are sources like the videos, as long as a still may be and with no sound', async () => {
    video('a.mp4', 'blue', 2)
    photo('p.jpg', 'red')
    fs.writeFileSync(path.join(montageDir(), 'photos', 'raw.dng'), 'x')

    const sources = await editSources(manifest, dir, group)

    expect(sources.map((s) => [s.name, s.still ?? false])).toEqual([
      ['a.mp4', false],
      ['p.jpg', true]
    ])
    expect(sources.find((s) => s.name === 'p.jpg')).toMatchObject({
      seconds: STILL_MAX,
      sound: false,
      marks: []
    })
  })

  it('are not laid on the timeline the first time, only the videos are', async () => {
    video('a.mp4', 'blue', 2)
    photo('p.jpg', 'red')

    const first = firstEdit(group, await editSources(manifest, dir, group))

    expect(first.clips.map((c) => c.name)).toEqual(['a.mp4'])
  })

  it('last as long as their clip says, between videos, in the render', async () => {
    video('a.mp4', 'blue', 3)
    photo('p.jpg', 'red')
    const sources = new Map<string, EditSource>(
      (await editSources(manifest, dir, group)).map((one) => [one.name, one])
    )
    const edit: FilmEdit = {
      version: 1,
      clips: [
        { id: 'clip-1', name: 'a.mp4', start: 0, end: 2, sound: false },
        { id: 'clip-2', name: 'p.jpg', start: 0, end: STILL_SECONDS - 2, sound: false },
        { id: 'clip-3', name: 'a.mp4', start: 1, end: 3, sound: false }
      ],
      music: [],
      texts: [],
      underSound: 0.15
    }
    const out = path.join(dir, 'film.mp4')

    execFileSync(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        ...filmArgs({
          edit,
          sources,
          music: new Map(),
          width: 320,
          height: 180,
          fonts: {},
          textFileOf: (id) => path.join(dir, `${id}.txt`),
          out
        })
      ],
      { stdio: 'pipe' }
    )

    expect(seconds(out)).toBeCloseTo(7, 0)
    expect(colourAt(out, 1)).toBe('blue')
    expect(colourAt(out, 3.5)).toBe('red')
    expect(colourAt(out, 5.5)).toBe('blue')
  })
})
