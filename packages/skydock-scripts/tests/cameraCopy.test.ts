// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cameraCopying,
  copyAgain,
  lookForCameras,
  mountedCameras,
  overMtp,
  watchCameras
} from '../src/cameraWatch'
import { CameraGone, CopyStopped, copyBack, copyCamera } from '../src/copy'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifest, saveManifest } from '../src/manifest'
import { scanMedia } from '../src/scan'
import { getManifestPath } from '../src/utils'
import { computeFileId } from '../src/fileId'
import { createTmpDir, onPlatform } from './fixtures'

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

  /* the board lists the card before the first file is copied, and marks each as it goes (RULES,
     Copying a camera off) */
  it('names every file on the card first, then says how each one went', async () => {
    const root = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 16, fill: 2, at: DAY }
    })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    fs.writeFileSync(path.join(root, 'DCIM', '100GOPRO', 'GX010003.MP4'), Buffer.alloc(8, 3))
    const said: unknown[] = []

    await copyCamera({
      cameraDir: path.join(root, 'DCIM'),
      outputDir,
      onProgress: (p) => said.push(p)
    })

    expect(said[0]).toMatchObject({
      done: 0,
      total: 3,
      files: [
        { name: 'GX010001.MP4', size: 32 },
        { name: 'GX010002.MP4', size: 16 },
        { name: 'GX010003.MP4', size: 8 }
      ]
    })
    expect(
      said.flatMap((p) => {
        const last = (p as { last?: string }).last
        return last ? [last] : []
      })
    ).toEqual(['skipped', 'skipped', 'copied'])
  })

  /* a long clip is watched filling, and each file is handed over, by what it contains, as it lands */
  it('fills the bar of the file being copied as its bytes land, and says what it holds once it has', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 3 * 1024 * 1024, fill: 1, at: DAY } })
    const said: { part?: number }[] = []
    const landed: { dest: string; id: string; shot: number }[] = []
    const slow = Date.now
    let clock = 0
    Date.now = () => (clock += 250)
    try {
      await copyCamera({
        cameraDir: path.join(root, 'DCIM'),
        outputDir,
        onProgress: (p) => said.push(p),
        onCopied: (c) => {
          landed.push(c)
        }
      })
    } finally {
      Date.now = slow
    }

    const parts = said.flatMap((p) => (p.part === undefined ? [] : [p.part]))
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p, i) => p > 0 && p <= 1 && (i === 0 || p >= parts[i - 1]!))).toBe(true)
    expect(landed).toEqual([
      {
        dest: day('GX010001.MP4'),
        id: await computeFileId(day('GX010001.MP4')),
        shot: Math.floor(DAY.getTime() / 1000)
      }
    ])
  })

  /* one file that will not come across does not stop the rest; it is named (RULES, Copying a camera
     off) — here, a day it cannot be filed under, since a file of that name is in the way */
  it('passes over a file it cannot copy, names it, and copies the rest', async () => {
    const root = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: new Date(2026, 7, 2, 10, 0, 0) }
    })
    fs.mkdirSync(path.join(outputDir, 'original_files'), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'original_files', '2026-08-01'), 'in the way')

    const result = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, unreadable: ['GX010001.MP4'] })
    expect(
      fs.existsSync(path.join(outputDir, 'original_files', '2026-08-02', 'GX010002.MP4'))
    ).toBe(true)
  })

  /* asked to stop, the copy finishes the file in hand and begins nothing after it (RULES, Copying a
     camera off) */
  it('stops between one file and the next when asked, leaving the rest on the card', async () => {
    const root = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: DAY }
    })
    const stop = new AbortController()

    await expect(
      copyCamera({
        cameraDir: path.join(root, 'DCIM'),
        outputDir,
        stop: stop.signal,
        onCopied: () => stop.abort()
      })
    ).rejects.toBeInstanceOf(CopyStopped)

    expect(fs.existsSync(day('GX010001.MP4'))).toBe(true)
    expect(fs.existsSync(day('GX010002.MP4'))).toBe(false)
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

  /* freeing is deliberate: the original goes once the storage is proved to hold it, and the record
     stays behind to say so. Plugging the camera in again must not undo that choice. */
  const freeIt = async (filename: string) => {
    await scanMedia({ outputDir })
    const manifestPath = getManifestPath(outputDir)
    const manifest = loadManifest(manifestPath)!
    manifest.files = manifest.files.map((f) =>
      f.filename === filename ? { ...f, freed: true } : f
    )
    saveManifest(manifestPath, manifest)
    fs.rmSync(day(filename))
  }

  it('passes over a file this machine freed, rather than copying it off the camera again', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    await freeIt('GX010001.MP4')

    const again = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(again).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.existsSync(day('GX010001.MP4'))).toBe(false)
  })

  /* the one way back: freeing is undone by asking for that file, never by plugging the card in */
  it('copies a freed file back when it is asked for by name, and it is a file again', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    await freeIt('GX010001.MP4')
    const onCard = path.join(root, 'DCIM', '100GOPRO', 'GX010001.MP4')

    const back = await copyBack({ paths: [onCard], outputDir })
    await scanMedia({ outputDir })

    expect(back).toMatchObject({ copied: 1, skipped: 0 })
    expect(fs.existsSync(day('GX010001.MP4'))).toBe(true)
    const entry = loadManifest(getManifestPath(outputDir))!.files.find(
      (f) => f.filename === 'GX010001.MP4'
    )
    expect(entry?.freed).toBeUndefined()
  })

  it('leaves a file that is already here alone rather than copying it beside itself', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    const onCard = path.join(root, 'DCIM', '100GOPRO', 'GX010001.MP4')

    const back = await copyBack({ paths: [onCard], outputDir })

    expect(back).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.readdirSync(path.dirname(day('x')))).toEqual(['GX010001.MP4'])
  })

  it('knows a freed file under the numbered name a second camera’s clip was given', async () => {
    const first = card('GOPRO_A', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    const second = card('GOPRO_B', { 'GX010001.MP4': { bytes: 48, fill: 2, at: DAY } })
    await copyCamera({ cameraDir: path.join(first, 'DCIM'), outputDir })
    await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })
    await freeIt('GX010001_2.MP4')

    const again = await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    expect(again).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.readdirSync(path.dirname(day('x')))).toEqual(['GX010001.MP4'])
  })

  it('copies a file that only shares a name and a size with one freed from another day', async () => {
    const first = card('GOPRO_A', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(first, 'DCIM'), outputDir })
    await freeIt('GX010001.MP4')
    const later = new Date(2026, 7, 2, 10, 0, 0)
    const second = card('GOPRO_B', { 'GX010001.MP4': { bytes: 32, fill: 2, at: later } })

    const result = await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1 })
    expect(
      fs.existsSync(path.join(outputDir, 'original_files', '2026-08-02', 'GX010001.MP4'))
    ).toBe(true)
  })

  it('copies a file of another size, whatever was freed under that name', async () => {
    const first = card('GOPRO_A', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(first, 'DCIM'), outputDir })
    await freeIt('GX010001.MP4')
    const second = card('GOPRO_B', { 'GX010001.MP4': { bytes: 48, fill: 2, at: DAY } })

    const result = await copyCamera({ cameraDir: path.join(second, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1 })
    expect(fs.readFileSync(day('GX010001.MP4'))).toEqual(Buffer.alloc(48, 2))
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

/* A camera is copied when it is plugged in, and again whenever asked, without unplugging it — which
   is how what went missing here comes back across (RULES, Copy off the cameras). */
describe('copying a camera again while it stays plugged in', () => {
  const copied = async () => {
    await vi.waitFor(() => expect(cameraCopying()).toBe(false), { timeout: 5000 })
  }

  it('copies what is not here, and passes over what is', async () => {
    const root = card('GOPRO', {
      'GX01.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX02.MP4': { bytes: 32, fill: 2, at: DAY }
    })
    copyAgain(outputDir, root, [root])
    await copied()
    fs.rmSync(day('GX01.MP4'))
    const kept = fs.statSync(day('GX02.MP4')).mtimeMs

    copyAgain(outputDir, root, [root])
    await copied()

    expect(fs.readdirSync(day()).sort()).toEqual(['GX01.MP4', 'GX02.MP4'])
    expect(fs.statSync(day('GX02.MP4')).mtimeMs).toBe(kept)
  })

  /* each file is on the board the moment it lands, loose in Fresh files, not when the card is done;
     once it is, what came off is gathered into jumps (RULES, Copying a camera off) */
  it('puts each file on the board as it lands, and gathers them into jumps at the end', async () => {
    saveManifest(getManifestPath(outputDir), { version: 2, createdAt: 'x', files: [], groups: [] })
    const root = card('GOPRO', {
      'GX01.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX02.MP4': { bytes: 32, fill: 2, at: new Date(DAY.getTime() + 60_000) }
    })
    const onBoardAsItLanded: number[] = []
    const stop = subscribe((event) => {
      if (event.kind === 'camera' && event.last === 'copied')
        onBoardAsItLanded.push(loadManifest(getManifestPath(outputDir))!.files.length)
    })

    copyAgain(outputDir, root, [root])
    await copied()
    stop()

    expect(onBoardAsItLanded).toEqual([1, 2])
    const board = loadManifest(getManifestPath(outputDir))!
    expect(board.groups.map((g) => g.files.map((f) => f.filename))).toEqual([
      ['GX01.MP4', 'GX02.MP4']
    ])
  })

  it('asks for nothing of a camera that is not plugged in', () => {
    expect(copyAgain(outputDir, path.join(media, 'GONE'), [])).toBe(0)
  })

  it('does not queue a camera twice while it is being copied', async () => {
    const root = card('GOPRO', { 'GX01.MP4': { bytes: 32, fill: 1, at: DAY } })

    copyAgain(outputDir, root, [root])
    copyAgain(outputDir, root, [root])

    expect(globalThis.skydockCameraWatch?.queue).toEqual([])
    await copied()
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

  /* A GoPro, and most cameras of the last few years, has no drive to offer at all: it speaks MTP,
     and the desktop mounts it through gvfs. Each camera is then a folder inside that one mount, and
     its pictures are inside one of its stores rather than at its own top — `HERO5 Black` holds
     `GoPro MTP Client Disk Volume`, and that holds DCIM (RULES, Copying a camera off). */
  describe('a camera that hands its files over rather than showing them', () => {
    const handedOver = (device: string, store: string) => {
      const gvfs = path.join(media, 'gvfs')
      const root = path.join(gvfs, device, store)
      fs.mkdirSync(path.join(root, 'DCIM', '100GOPRO'), { recursive: true })
      fs.writeFileSync(path.join(root, 'DCIM', '100GOPRO', 'GX010001.MP4'), 'x')
      return { gvfs, root }
    }

    /* A camera SkyDock was pointed at itself — mounted by jmtpfs, go-mtpfs or anything else that
       hands an MTP camera over as files. The mount is the camera, and its stores are folders inside
       it, exactly as they are on the device. */
    it('is found in the store of a mount SkyDock was pointed at', () => {
      const mounted = path.join(media, 'cameras', 'gopro')
      const store = path.join(mounted, 'GoPro MTP Client Disk Volume')
      fs.mkdirSync(path.join(store, 'DCIM', '100GOPRO'), { recursive: true })
      fs.writeFileSync(path.join(store, 'DCIM', '100GOPRO', 'GX010001.MP4'), 'x')
      process.env.SKYDOCK_CAMERA_ROOTS = path.join(media, 'cameras')

      expect(mountedCameras(mountinfo([mounted]))).toEqual([store])
    })

    it('is found inside the store that holds its pictures', () => {
      const { gvfs, root } = handedOver(
        'mtp:host=%5Busb%3A003%2C011%5D',
        'GoPro MTP Client Disk Volume'
      )
      process.env.SKYDOCK_CAMERA_ROOTS = gvfs

      expect(mountedCameras(mountinfo([gvfs]))).toEqual([root])
    })

    /* the folder gvfs makes is looked into only while it is a live mount: one that is not is one
       nobody has to wait on, and this runs every couple of seconds */
    it('is not looked for while nothing is mounted there', () => {
      const { gvfs } = handedOver('mtp:host=%5Busb%3A003%2C011%5D', 'GoPro MTP Client Disk Volume')
      process.env.SKYDOCK_CAMERA_ROOTS = gvfs

      expect(mountedCameras(mountinfo(['/proc']))).toEqual([])
    })

    it('says it hands its files over, which is why it is slower than a card', () => {
      const gvfs = path.join(media, 'gvfs')
      vi.stubEnv('XDG_RUNTIME_DIR', media)

      expect(overMtp(path.join(gvfs, 'mtp:host=x', 'Store', 'DCIM'))).toBe(true)
      expect(overMtp(path.join(media, 'GOPRO'))).toBe(false)
    })
  })

  /* macOS has no list of mounts to read: a drive is a folder in /Volumes, so that is what is
     looked at — and the DCIM folder decides, exactly as it does everywhere else */
  it('is a volume on a Mac, found without any list of mounts', () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    fs.mkdirSync(path.join(media, 'Macintosh HD'), { recursive: true })

    onPlatform('darwin', () => {
      expect(mountedCameras()).toEqual([camera])
    })
  })

  /* Windows gives a camera a drive letter of its own, so the drive itself is the camera rather
     than something mounted under it */
  it('is the drive itself on Windows', () => {
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    process.env.SKYDOCK_CAMERA_ROOTS = [camera, path.join(media, 'nothing')].join(path.delimiter)

    onPlatform('win32', () => {
      expect(mountedCameras()).toEqual([camera])
    })
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
      said: '',
      kde: [],
      asking: false,
      askUntil: 0,
      askedAt: 0,
      seenOn: {}
    }

    watchCameras(outputDir)
    vi.advanceTimersByTime(10_000)

    expect(oldLooks).toBe(0)
  })
})
