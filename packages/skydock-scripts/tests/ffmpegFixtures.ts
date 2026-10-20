import { execFileSync, spawnSync } from 'node:child_process'
import * as path from 'node:path'
import type { EditSource } from '../src/filmEditShape'

const makeClip = (dir: string, name: string, color: string, seconds: number, sound = true) => {
  const file = path.join(dir, name)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=320x180:r=25:d=${seconds}`,
    ...(sound ? ['-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`] : []),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    ...(sound ? ['-c:a', 'aac', '-shortest'] : []),
    file
  ])
  return { name, path: file, play: file, seconds, sound, marks: [] } satisfies EditSource
}

const durationOf = (file: string) =>
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

const rgbAt = (file: string, { at, filter }: { at?: number; filter: string }) => {
  const [r = 0, g = 0, b = 0] = execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    ...(at === undefined ? [] : ['-ss', String(at)]),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    filter,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  return { r, g, b }
}

const meanDb = (file: string, from: number, to: number, band = 'anull') => {
  const ran = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-ss',
      String(from),
      '-t',
      String(to - from),
      '-i',
      file,
      '-af',
      `${band},volumedetect`,
      '-vn',
      '-f',
      'null',
      '-'
    ],
    { encoding: 'utf-8' }
  )
  return Number(/mean_volume: (-?[\d.]+|-inf) dB/.exec(ran.stderr)?.[1] ?? Number.NEGATIVE_INFINITY)
}

export { durationOf, makeClip, meanDb, rgbAt }
