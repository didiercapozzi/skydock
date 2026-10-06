import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/* The footage a person brings: real, tiny files made by the tools the app itself uses, named and dated
   the way the cameras name and date theirs, so scanning, grouping and processing run on real bytes. */

const CLIPS = [
  /* day one, morning: one jump of three clips */
  ['DJI_20260905100000_0001_D.MP4', '2026-09-05T10:00:00'],
  ['DJI_20260905100240_0002_D.MP4', '2026-09-05T10:02:40'],
  ['DJI_20260905100520_0003_D.MP4', '2026-09-05T10:05:20'],
  /* day one, afternoon: a second jump */
  ['DJI_20260905143000_0004_D.MP4', '2026-09-05T14:30:00'],
  ['DJI_20260905143300_0005_D.MP4', '2026-09-05T14:33:00'],
  /* day two: a third jump, and a photo of it */
  ['DJI_20260906090000_0006_D.MP4', '2026-09-06T09:00:00'],
  ['DJI_20260906090300_0007_D.MP4', '2026-09-06T09:03:00']
] as const
const PHOTOS = [['DJI_20260906090130_0008_D.JPG', '2026-09-06T09:01:30']] as const

/* what is on the computer rather than on a card: a GoPro clip, to be dropped on the board */
const DROPS = [['GX010001.MP4', '2026-09-06T16:00:00']] as const

/* where a camera copy puts a file taken on a day: the originals, one folder a day */
const dayFolder = (world: { output: string }, when: string) => {
  const folder = path.join(world.output, 'original_files', when.slice(0, 10))
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

const ffmpeg = (...args: string[]) =>
  execFileSync(process.env.SKYDOCK_FFMPEG_PATH ?? 'ffmpeg', ['-y', '-v', 'error', ...args])

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

/* a clip big enough to be given a small copy of itself, which the board then plays from */
const makeBigClip = (file: string, when: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1280x720:rate=25:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
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

/* every file under a folder, as the folder's own path to it, sorted; none for a folder that is not there */
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

export { CLIPS, dayFolder, DROPS, filesUnder, makeBigClip, makeClip, makePhoto, PHOTOS }
