import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'

const CLIPS = [
  ['DJI_20260905100000_0001_D.MP4', '2026-09-05T10:00:00'],
  ['DJI_20260905100240_0002_D.MP4', '2026-09-05T10:02:40'],
  ['DJI_20260905100520_0003_D.MP4', '2026-09-05T10:05:20'],
  ['DJI_20260905143000_0004_D.MP4', '2026-09-05T14:30:00'],
  ['DJI_20260905143300_0005_D.MP4', '2026-09-05T14:33:00'],
  ['DJI_20260906090000_0006_D.MP4', '2026-09-06T09:00:00'],
  ['DJI_20260906090300_0007_D.MP4', '2026-09-06T09:03:00']
] as const
const PHOTOS = [['DJI_20260906090130_0008_D.JPG', '2026-09-06T09:01:30']] as const

const DROPS = [['GX010001.MP4', '2026-09-06T16:00:00']] as const

const dayFolder = (world: { output: string }, when: string) => {
  const folder = path.join(world.output, 'original_files', when.slice(0, 10))
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

const tool = (name: 'ffmpeg' | 'ffprobe' | 'exiftool') =>
  process.env[`SKYDOCK_${name.toUpperCase()}_PATH`] ?? name

const ffmpeg = (...args: string[]) => execFileSync(tool('ffmpeg'), ['-y', '-v', 'error', ...args])

const stamp = (file: string, when: string) => {
  const at = new Date(when)
  fs.utimesSync(file, at, at)
}

const makeClip = (file: string, when: string, seconds = 4) => {
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=320x240:rate=25:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-metadata',
    `creation_time=${when}Z`,
    file
  )
  stamp(file, when)
}

const makePhoto = (file: string, when: string) => {
  ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=1', '-frames:v', '1', file)
  stamp(file, when)
}

const makeBigClip = (
  file: string,
  when: string,
  { seconds = 3, size = '1280x720', fast = false } = {}
) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${size}:rate=25:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:v',
    'libx264',
    ...(fast ? ['-preset', 'ultrafast', '-crf', '30'] : []),
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-metadata',
    `creation_time=${when}Z`,
    file
  )
  stamp(file, when)
}

const makeOwnPhoto = (file: string, when: string, n = 0) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  ffmpeg('-f', 'lavfi', '-i', `testsrc2=size=${320 + n}x240:rate=1`, '-frames:v', '1', file)
  stamp(file, when)
}

const ffprobe = (...args: string[]) =>
  String(execFileSync(tool('ffprobe'), ['-v', 'error', ...args]))

const probeSchema = z.object({
  streams: z.array(z.object({ width: z.number(), height: z.number() }).passthrough())
})

const probe = (file: string) => {
  const parsed = probeSchema.parse(
    JSON.parse(
      ffprobe(
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration',
        '-of',
        'json',
        file
      )
    )
  )
  const seconds = Number(
    ffprobe('-show_entries', 'format=duration', '-of', 'csv=p=0', file).trim().split('\n')[0]
  )
  return { seconds, width: parsed.streams[0]!.width, height: parsed.streams[0]!.height }
}

const filesUnder = (folder: string): string[] =>
  fs.existsSync(folder)
    ? fs
        .readdirSync(folder, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? filesUnder(path.join(folder, entry.name)).map((f) => `${entry.name}/${f}`)
            : [entry.name]
        )
        .sort()
    : []

const WHO = 'Luc Favre'
const FILM = 'luc_favre_20260906.mp4'
const PROJECT = 'luc_favre_20260906.kdenlive'
const STEM = 'luc_favre_20260906_090000'

const originalsDir = (world: { output: string }) => path.join(world.output, 'original_files')

const originalFile = (world: { output: string }, day: string, name: string) =>
  path.join(originalsDir(world), day, name)

const originalsOf = (world: { output: string }) => filesUnder(originalsDir(world))

const montageFolder = (world: { output: string }, who = WHO) =>
  path.join(world.output, 'processed', 'Montages', who)

const projectFile = (world: { output: string }, who = WHO) =>
  path.join(montageFolder(world, who), PROJECT)
const filmFile = (world: { output: string }, who = WHO, name = FILM) =>
  path.join(montageFolder(world, who), name)

const renderFilm = (world: { output: string }, who = WHO, name = FILM, seconds = 3) =>
  makeClip(filmFile(world, who, name), '2026-09-06T09:00:00', seconds)

export {
  CLIPS,
  dayFolder,
  DROPS,
  FILM,
  filesUnder,
  ffprobe,
  filmFile,
  makeBigClip,
  makeClip,
  makeOwnPhoto,
  makePhoto,
  montageFolder,
  originalFile,
  originalsDir,
  originalsOf,
  PHOTOS,
  probe,
  PROJECT,
  projectFile,
  renderFilm,
  STEM,
  tool,
  WHO
}
