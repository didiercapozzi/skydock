import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { copyCamera } from '../src/copy'
import { shotTimes } from '../src/scan'
import { createTmpDir } from './fixtures'

/* When a clip was shot, as its camera wrote it (RULES, The workflow): a DJI keeps a video's time in
   UTC, as the format says, a GoPro keeps it on its clock as a photo does — and both are read as the
   time on this machine's clock. Summer in Switzerland, two hours ahead of UTC, so a clip read the wrong
   way is two hours off. */
process.env.TZ = 'Europe/Zurich'

const camera = createTmpDir('skydock-clock-camera-')
const output = createTmpDir('skydock-clock-output-')

const clip = (name: string, createDate: string, encoder?: string) => {
  const file = path.join(camera, 'DCIM', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y', '-f', 'lavfi'],
    ...['-i', 'testsrc=size=160x120:rate=25:duration=0.2', '-pix_fmt', 'yuv420p', file]
  ])
  execFileSync('exiftool', [
    ...['-q', '-overwrite_original', `-QuickTime:CreateDate=${createDate}`],
    ...(encoder ? [`-ItemList:Encoder=${encoder}`] : []),
    file
  ])
  return file
}

const at = (local: string) => new Date(local).getTime() / 1000

let dji: string
let gopro: string
let djiAfterMidnight: string

beforeAll(() => {
  dji = clip('DJI_20260905141144_0059_D.MP4', '2026:09:05 12:11:44', 'DJI Osmo Nano')
  gopro = clip('GX018683.MP4', '2026:09:05 14:11:44')
  djiAfterMidnight = clip('DJI_20260906013000_0074_D.MP4', '2026:09:05 23:30:00', 'DJI Osmo Nano')
})

afterAll(() => {
  fs.rmSync(camera, { recursive: true, force: true })
  fs.rmSync(output, { recursive: true, force: true })
})

describe('when a clip was shot', () => {
  test('a DJI video, kept in UTC, is on the local clock', async () => {
    expect((await shotTimes([dji])).get(dji)).toBe(at('2026-09-05T14:11:44'))
  })

  test('a GoPro video, kept on its own clock, is read as it says', async () => {
    expect((await shotTimes([gopro])).get(gopro)).toBe(at('2026-09-05T14:11:44'))
  })

  test('a DJI video shot after midnight is copied into the day it was shot on', async () => {
    await copyCamera({ cameraDir: path.join(camera, 'DCIM'), outputDir: output })
    const copied = path.join(
      output,
      'original_files',
      '2026-09-06',
      path.basename(djiAfterMidnight)
    )
    expect(fs.existsSync(copied)).toBe(true)
  })
})
