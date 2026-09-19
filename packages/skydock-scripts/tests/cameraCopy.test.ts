// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookForCameras, mountedCameras, watchCameras } from '../src/cameraWatch'
import { CameraGone, copyCamera } from '../src/copy'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifest } from '../src/manifest'
import { createTmpDir } from './fixtures'

/* A camera is copied off into the originals — by hand or by plugging it in. Real files, really
   copied: what matters is what ends up on the disk, and what never does. */

let media: string
let outputDir: string

/* a camera's card: its clips in DCIM, each with the time it was shot */
const card = (name: string, clips: Record<string, { bytes: number; fill: number; at: Date }>) => {
  const root = path.join(media, name)
  for (const [clip, { bytes, fill, at }] of Object.entries(clips)) {
    const file = path.join(root, 'DCIM', '100GOPRO', clip)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.alloc(bytes, fill))
    fs.utimesSync(file, at, at)
  }
  return root
}

const DAY = new Date(2026, 7, 1, 10, 0, 0)
const day = (...parts: string[]) => path.join(outputDir, 'original_files', '2026-08-01', ...parts)

beforeEach(() => {
  media = createTmpDir('skydock-media-')
  outputDir = createTmpDir('skydock-copy-')
  globalThis.skydockCameraWatch = undefined
  globalThis.skydockLive = undefined
})

afterEach(() => {
  fs.rmSync(media, { recursive: true, force: true })
  fs.rmSync(outputDir, { recursive: true, force: true })
  /* back to the test run's own: no camera watched */
  process.env.SKYDOCK_CAMERA_ROOTS = ''
})

describe('copying a camera off', () => {
  it('puts every file in a folder named after the day it was shot, keeping its time', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })

    const result = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, skipped: 0, total: 1 })
    expect(Math.floor(fs.statSync(day('GX010001.MP4')).mtimeMs / 1000)).toBe(DAY.getTime() / 1000)
  })

  /* a card that has been through a Mac carries a `._` sidecar beside every clip: a few hundred
     bytes of Finder notes, which no player opens and nobody wants among the originals */
  it('leaves behind the sidecar files a Mac writes beside each clip', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    fs.writeFileSync(path.join(root, 'DCIM', '100GOPRO', '._GX010001.MP4'), Buffer.alloc(241, 0))

    const result = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, total: 1 })
    expect(fs.existsSync(day('._GX010001.MP4'))).toBe(false)
  })

  /* plugging the same camera in again costs nothing, and writes nothing */
  it('passes over what is already there without writing it again', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    const before = fs.statSync(day('GX010001.MP4')).ino

    const again = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(again).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.statSync(day('GX010001.MP4')).ino).toBe(before)
  })

  /* two cameras of one make both start at GX010001 — the second must never write over the first */
  it('keeps a second camera’s clip of the same name beside the first, never over it', async () => {
    const first = card('GOPRO_A', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    const second = card('GOPRO_B', { 'GX010001.MP4': { bytes: 48, fill: 2, at: DAY } })

    await copyCamera({ cameraDir: path.join(first, 'DCIM'), outputDir })
    await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    expect(fs.readFileSync(day('GX010001.MP4'))).toEqual(Buffer.alloc(32, 1))
    expect(fs.readFileSync(day('GX010001_2.MP4'))).toEqual(Buffer.alloc(48, 2))
  })

  it('knows the second camera’s clip under its numbered name when that camera comes back', async () => {
    const first = card('GOPRO_A', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    const second = card('GOPRO_B', { 'GX010001.MP4': { bytes: 48, fill: 2, at: DAY } })
    await copyCamera({ cameraDir: path.join(first, 'DCIM'), outputDir })
    await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    const again = await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    expect(again).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.readdirSync(path.dirname(day('x'))).sort()).toEqual([
      'GX010001.MP4',
      'GX010001_2.MP4'
    ])
  })

  /* a card pulled out half way leaves nothing that could be taken for an original */
  it('stops when the camera goes, keeping what was whole and nothing half-written', async () => {
    const root = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: DAY }
    })

    await expect(
      copyCamera({
        cameraDir: path.join(root, 'DCIM'),
        outputDir,
        /* unplugged once the first file is across */
        onProgress: (p) => {
          if (p.done === 1) fs.rmSync(root, { recursive: true, force: true })
        }
      })
    ).rejects.toBeInstanceOf(CameraGone)

    expect(fs.readdirSync(path.dirname(day('x')))).toEqual(['GX010001.MP4'])
  })
})

describe('which drives are cameras', () => {
  const mountinfo = (points: string[]) => {
    const file = path.join(media, 'mountinfo')
    fs.writeFileSync(
      file,
      points
        .map((p, i) => `${100 + i} 1 8:${i} / ${p.replace(/ /g, '\\040')} rw - vfat /dev/sd${i} rw`)
        .join('\n')
    )
    return file
  }

  it('is a drive mounted where cameras are, with a DCIM folder at its root', () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    const windows = path.join(media, 'WINDOWS')
    fs.mkdirSync(path.join(windows, 'Program Files'), { recursive: true })

    expect(mountedCameras(mountinfo([camera, windows, '/proc']))).toEqual([camera])
  })

  it('is found under a name with a space in it', () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('SD CARD', { 'IMG_0001.JPG': { bytes: 1, fill: 1, at: DAY } })

    expect(mountedCameras(mountinfo([camera]))).toEqual([camera])
  })

  it('is looked for nowhere when there is nowhere set to look', () => {
    process.env.SKYDOCK_CAMERA_ROOTS = ''
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })

    expect(mountedCameras(mountinfo([camera]))).toEqual([])
  })
})

describe('a camera plugged in', () => {
  const heard: LiveEvent[] = []
  const ending = () =>
    new Promise<Extract<LiveEvent, { kind: 'camera' }>>((resolve) => {
      const stop = subscribe((e) => {
        if (e.kind === 'camera' && e.state !== 'copying') {
          stop()
          resolve(e)
        }
      })
    })
  const plugged = (points: string[]) => {
    const file = path.join(media, 'mountinfo')
    fs.writeFileSync(
      file,
      points.map((p, i) => `${100 + i} 1 8:${i} / ${p} rw - vfat x rw`).join('\n')
    )
    return file
  }

  beforeEach(() => {
    heard.length = 0
    process.env.SKYDOCK_CAMERA_ROOTS = media
  })

  it('is copied off and scanned by itself, saying how far it has got as it goes', async () => {
    const camera = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: new Date(DAY.getTime() + 60_000) }
    })
    subscribe((e) => heard.push(e))
    const done = ending()

    lookForCameras(outputDir, plugged([camera]))

    expect(await done).toMatchObject({ camera: 'GOPRO', state: 'done', copied: 2, total: 2 })
    expect(
      heard.filter((e) => e.kind === 'camera' && e.state === 'copying').length
    ).toBeGreaterThan(1)
    expect(loadManifest(path.join(outputDir, 'manifest.json'))?.files).toHaveLength(2)
  })

  it('is copied once while it stays plugged in, and again when it comes back', async () => {
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    const first = ending()
    lookForCameras(outputDir, plugged([camera]))
    await first

    /* still there: nothing more is done */
    let more = 0
    const stop = subscribe((e) => {
      if (e.kind === 'camera') more++
    })
    lookForCameras(outputDir, plugged([camera]))
    await new Promise((r) => setTimeout(r, 50))
    stop()
    expect(more).toBe(0)

    /* unplugged, then plugged in again with a new clip on it */
    lookForCameras(outputDir, plugged([]))
    fs.writeFileSync(path.join(camera, 'DCIM', '100GOPRO', 'GX010002.MP4'), Buffer.alloc(8, 9))
    const again = ending()
    lookForCameras(outputDir, plugged([camera]))
    expect(await again).toMatchObject({ copied: 1, skipped: 1 })
  })

  it('is left alone when it is not a camera', async () => {
    const drive = path.join(media, 'BACKUP')
    fs.mkdirSync(path.join(drive, 'photos'), { recursive: true })
    fs.writeFileSync(path.join(drive, 'photos', 'a.jpg'), 'x')
    subscribe((e) => heard.push(e))

    lookForCameras(outputDir, plugged([drive]))
    await new Promise((r) => setTimeout(r, 50))

    /* a proxy still being built behind an earlier test may speak meanwhile; no camera does */
    expect(heard.filter((e) => e.kind === 'camera')).toEqual([])
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
  })
})

/* The server keeps running while its code is loaded afresh, and the look left running by the old
   code would go on doing what the old code did. So each start takes over from the one before. */
describe('watching for cameras', () => {
  afterEach(() => {
    const state = globalThis.skydockCameraWatch
    if (state?.timer) clearInterval(state.timer)
    vi.useRealTimers()
  })

  it('takes over from a look left running before, rather than running beside it', () => {
    vi.useFakeTimers()
    process.env.SKYDOCK_CAMERA_ROOTS = media
    let oldLooks = 0
    globalThis.skydockCameraWatch = {
      timer: setInterval(() => oldLooks++, 2000),
      seen: new Set(),
      queue: [],
      copying: false,
      said: ''
    }

    watchCameras(outputDir)
    vi.advanceTimersByTime(10_000)

    expect(oldLooks).toBe(0)
  })
})
