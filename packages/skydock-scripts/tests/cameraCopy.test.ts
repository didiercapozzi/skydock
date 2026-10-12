// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answerCamera,
  cameraCopying,
  cameraKey,
  copyAgain,
  lookForCameras,
  mountedCameras,
  overMtp
} from '../src/cameraWatch'
import { CameraGone, CopyStopped, copyBack, copyCamera } from '../src/copy'
import { forgetCamera, knownCameras, rememberCamera } from '../src/knownCameras'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { loadManifestAsync, saveManifest } from '../src/manifest'
import { scanMedia } from '../src/scan'
import { readTransfers } from '../src/transfers'
import { getManifestPath } from '../src/utils'
import { computeFileId } from '../src/fileId'
import { createTmpDir, onPlatform } from './fixtures'

let media: string
let outputDir: string

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

beforeEach(() => {
  media = createTmpDir('skydock-media-')
  outputDir = createTmpDir('skydock-copy-')
  globalThis.skydockCameraWatch = undefined
  globalThis.skydockLive = undefined
})

afterEach(() => {
  fs.rmSync(media, { recursive: true, force: true })
  fs.rmSync(outputDir, { recursive: true, force: true })
  process.env.SKYDOCK_CAMERA_ROOTS = ''
})

describe('copying a camera off', () => {
  it('puts every file in a folder named after the day it was shot, keeping its time', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })

    const result = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, skipped: 0, total: 1 })
    expect(Math.floor(fs.statSync(day('GX010001.MP4')).mtimeMs / 1000)).toBe(DAY.getTime() / 1000)
  })

  it('leaves behind the sidecar files a Mac writes beside each clip', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    fs.writeFileSync(path.join(root, 'DCIM', '100GOPRO', '._GX010001.MP4'), Buffer.alloc(241, 0))

    const result = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(result).toMatchObject({ copied: 1, total: 1 })
    expect(fs.existsSync(day('._GX010001.MP4'))).toBe(false)
  })

  it('passes over what is already there without writing it again', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    const before = fs.statSync(day('GX010001.MP4')).ino

    const again = await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })

    expect(again).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.statSync(day('GX010001.MP4')).ino).toBe(before)
  })

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

  const freeIt = async (filename: string) => {
    await scanMedia({ outputDir })
    const manifestPath = getManifestPath(outputDir)
    const manifest = (await loadManifestAsync(manifestPath))!
    manifest.files = manifest.files.map((f) =>
      f.filename === filename ? { ...f, freed: true } : f
    )
    await saveManifest(manifestPath, manifest)
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

  it('copies a freed file back when it is asked for by name, and it is a file again', async () => {
    const root = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    await freeIt('GX010001.MP4')
    const onCard = path.join(root, 'DCIM', '100GOPRO', 'GX010001.MP4')

    const back = await copyBack({ paths: [onCard], outputDir })
    await scanMedia({ outputDir })

    expect(back).toMatchObject({ copied: 1, skipped: 0 })
    expect(fs.existsSync(day('GX010001.MP4'))).toBe(true)
    const entry = (await loadManifestAsync(getManifestPath(outputDir)))!.files.find(
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

  it('stops when the camera goes, keeping what was whole and nothing half-written', async () => {
    const root = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: DAY }
    })

    await expect(
      copyCamera({
        cameraDir: path.join(root, 'DCIM'),
        outputDir,
        onProgress: (p) => {
          if (p.done === 1) fs.rmSync(root, { recursive: true, force: true })
        }
      })
    ).rejects.toBeInstanceOf(CameraGone)

    expect(fs.readdirSync(path.dirname(day('x')))).toEqual(['GX010001.MP4'])
  })
})

describe('copying a camera again while it stays plugged in', () => {
  const copied = async () => {
    await vi.waitFor(() => expect(cameraCopying()).toBe(false), { timeout: 5000 })
  }

  it('copies what is not here, and passes over what is', async () => {
    const root = card('GOPRO', {
      'GX01.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX02.MP4': { bytes: 32, fill: 2, at: DAY }
    })
    await copyAgain(outputDir, root, [root])
    await copied()
    fs.rmSync(day('GX01.MP4'))
    const kept = fs.statSync(day('GX02.MP4')).mtimeMs

    await copyAgain(outputDir, root, [root])
    await copied()

    expect(fs.readdirSync(day()).sort()).toEqual(['GX01.MP4', 'GX02.MP4'])
    expect(fs.statSync(day('GX02.MP4')).mtimeMs).toBe(kept)
  })

  it('puts the files on the board as they land, and gathers them into jumps at the end', async () => {
    await saveManifest(getManifestPath(outputDir), {
      version: 2,
      createdAt: 'x',
      files: [],
      groups: []
    })
    const root = card('GOPRO', {
      'GX01.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX02.MP4': { bytes: 32, fill: 2, at: new Date(DAY.getTime() + 60_000) }
    })

    await copyAgain(outputDir, root, [root])
    await copied()

    const board = (await loadManifestAsync(getManifestPath(outputDir)))!
    expect(board.groups.map((g) => g.files.map((f) => f.filename))).toEqual([
      ['GX01.MP4', 'GX02.MP4']
    ])
  })

  it('keeps a transfer of what was copied, and none of a plug-in with nothing new', async () => {
    const root = card('GOPRO', { 'GX01.MP4': { bytes: 32, fill: 1, at: DAY } })

    await copyAgain(outputDir, root, [root])
    await copied()
    const first = await readTransfers(outputDir)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ kind: 'camera', state: 'done' })
    expect(first[0]!.items.map((i) => [i.name, i.result])).toEqual([['GX01.MP4', 'done']])

    await copyAgain(outputDir, root, [root])
    await copied()
    expect(await readTransfers(outputDir)).toHaveLength(1)
  })

  it('asks for nothing of a camera that is not plugged in', async () => {
    expect(await copyAgain(outputDir, path.join(media, 'GONE'), [])).toBe(0)
  })

  it('does not queue a camera twice while it is being copied', async () => {
    const root = card('GOPRO', { 'GX01.MP4': { bytes: 32, fill: 1, at: DAY } })

    await copyAgain(outputDir, root, [root])
    await copyAgain(outputDir, root, [root])

    await copied()
    expect(await readTransfers(outputDir)).toHaveLength(1)
  })
})

describe('which drives are cameras', () => {
  it('is a drive mounted where cameras are, with a DCIM folder at its root', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    const windows = path.join(media, 'WINDOWS')
    fs.mkdirSync(path.join(windows, 'Program Files'), { recursive: true })

    expect(await mountedCameras(mountinfo([camera, windows, '/proc']))).toEqual([camera])
  })

  it('is found under a name with a space in it', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('SD CARD', { 'IMG_0001.JPG': { bytes: 1, fill: 1, at: DAY } })

    expect(await mountedCameras(mountinfo([camera]))).toEqual([camera])
  })

  it('is looked for nowhere when there is nowhere set to look', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = ''
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })

    expect(await mountedCameras(mountinfo([camera]))).toEqual([])
  })

  describe('a camera that hands its files over rather than showing them', () => {
    const handedOver = (device: string, store: string) => {
      const gvfs = path.join(media, 'gvfs')
      const root = path.join(gvfs, device, store)
      fs.mkdirSync(path.join(root, 'DCIM', '100GOPRO'), { recursive: true })
      fs.writeFileSync(path.join(root, 'DCIM', '100GOPRO', 'GX010001.MP4'), 'x')
      return { gvfs, root }
    }

    it('is found in the store of a mount SkyDock was pointed at', async () => {
      const mounted = path.join(media, 'cameras', 'gopro')
      const store = path.join(mounted, 'GoPro MTP Client Disk Volume')
      fs.mkdirSync(path.join(store, 'DCIM', '100GOPRO'), { recursive: true })
      fs.writeFileSync(path.join(store, 'DCIM', '100GOPRO', 'GX010001.MP4'), 'x')
      process.env.SKYDOCK_CAMERA_ROOTS = path.join(media, 'cameras')

      expect(await mountedCameras(mountinfo([mounted]))).toEqual([store])
    })

    it('is found inside the store that holds its pictures', async () => {
      const { gvfs, root } = handedOver(
        'mtp:host=%5Busb%3A003%2C011%5D',
        'GoPro MTP Client Disk Volume'
      )
      process.env.SKYDOCK_CAMERA_ROOTS = gvfs

      expect(await mountedCameras(mountinfo([gvfs]))).toEqual([root])
    })

    it('is not looked for while nothing is mounted there', async () => {
      const { gvfs } = handedOver('mtp:host=%5Busb%3A003%2C011%5D', 'GoPro MTP Client Disk Volume')
      process.env.SKYDOCK_CAMERA_ROOTS = gvfs

      expect(await mountedCameras(mountinfo(['/proc']))).toEqual([])
    })

    it('is not asked of a network share that gvfs mounts beside it', async () => {
      const { gvfs } = handedOver('mtp:host=%5Busb%3A003%2C011%5D', 'GoPro MTP Client Disk Volume')
      const share = path.join(gvfs, 'smb-share:server=nas.local,share=video')
      fs.mkdirSync(path.join(share, 'DCIM'), { recursive: true })
      vi.stubEnv('XDG_RUNTIME_DIR', media)
      process.env.SKYDOCK_CAMERA_ROOTS = gvfs

      expect(
        (await mountedCameras(mountinfo([gvfs]))).some((camera) => camera.startsWith(share))
      ).toBe(false)
      expect(await mountedCameras(mountinfo([gvfs]))).toHaveLength(1)
    })

    it('says it hands its files over, which is why it is slower than a card', () => {
      const gvfs = path.join(media, 'gvfs')
      vi.stubEnv('XDG_RUNTIME_DIR', media)

      expect(overMtp(path.join(gvfs, 'mtp:host=x', 'Store', 'DCIM'))).toBe(true)
      expect(overMtp(path.join(media, 'GOPRO'))).toBe(false)
    })
  })

  it('is a volume on a Mac, found without any list of mounts', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    fs.mkdirSync(path.join(media, 'Macintosh HD'), { recursive: true })

    await onPlatform('darwin', async () => {
      expect(await mountedCameras()).toEqual([camera])
    })
  })

  it('is the drive itself on Windows', async () => {
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 1, fill: 1, at: DAY } })
    process.env.SKYDOCK_CAMERA_ROOTS = [camera, path.join(media, 'nothing')].join(path.delimiter)

    await onPlatform('win32', async () => {
      expect(await mountedCameras()).toEqual([camera])
    })
  })
})

describe('a camera plugged in', () => {
  const heard: LiveEvent[] = []
  const ending = () =>
    new Promise<Extract<LiveEvent, { kind: 'job' }>>((resolve) => {
      const stop = subscribe((e) => {
        if (e.kind === 'job' && e.type === 'camera-copy' && e.outcome) {
          stop()
          resolve(e)
        }
      })
    })

  beforeEach(async () => {
    heard.length = 0
    process.env.SKYDOCK_CAMERA_ROOTS = media
    process.env.SKYDOCK_CONFIG_DIR = createTmpDir('skydock-config-')
    await rememberCamera({ key: 'name:GOPRO', name: 'GOPRO', auto: true })
  })

  it('is copied off and scanned by itself, saying how far it has got as it goes', async () => {
    const camera = card('GOPRO', {
      'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
      'GX010002.MP4': { bytes: 32, fill: 2, at: new Date(DAY.getTime() + 60_000) }
    })
    subscribe((e) => heard.push(e))
    const done = ending()

    await lookForCameras(outputDir, mountinfo([camera]))

    expect(await done).toMatchObject({
      label: 'GOPRO',
      total: 2,
      outcome: { state: 'done', copied: 2 }
    })
    expect(
      heard.filter((e) => e.kind === 'job' && e.type === 'camera-copy' && !e.outcome).length
    ).toBeGreaterThan(1)
    expect((await loadManifestAsync(path.join(outputDir, 'manifest.json')))?.files).toHaveLength(2)
  })

  it('is copied once while it stays plugged in, and again when it comes back', async () => {
    const camera = card('GOPRO', { 'GX010001.MP4': { bytes: 32, fill: 1, at: DAY } })
    const first = ending()
    await lookForCameras(outputDir, mountinfo([camera]))
    await first

    let more = 0
    const stop = subscribe((e) => {
      if (e.kind === 'job' && e.type === 'camera-copy') more++
    })
    await lookForCameras(outputDir, mountinfo([camera]))
    await new Promise((r) => setTimeout(r, 50))
    stop()
    expect(more).toBe(0)

    await lookForCameras(outputDir, mountinfo([]))
    fs.writeFileSync(path.join(camera, 'DCIM', '100GOPRO', 'GX010002.MP4'), Buffer.alloc(8, 9))
    const again = ending()
    await lookForCameras(outputDir, mountinfo([camera]))
    expect(await again).toMatchObject({ outcome: { copied: 1, skipped: 1 } })
  })

  it('is left alone when it is not a camera', async () => {
    const drive = path.join(media, 'BACKUP')
    fs.mkdirSync(path.join(drive, 'photos'), { recursive: true })
    fs.writeFileSync(path.join(drive, 'photos', 'a.jpg'), 'x')
    subscribe((e) => heard.push(e))

    await lookForCameras(outputDir, mountinfo([drive]))
    await new Promise((r) => setTimeout(r, 50))

    expect(heard.filter((e) => e.kind === 'job' && e.type === 'camera-copy')).toEqual([])
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
  })
})

describe('cameras this machine knows', () => {
  const clips = {
    'GX010001.MP4': { bytes: 32, fill: 1, at: DAY },
    'GX010002.MP4': { bytes: 32, fill: 2, at: new Date(DAY.getTime() + 60_000) }
  }
  const last = (heard: LiveEvent[]) =>
    [...heard]
      .reverse()
      .find((e): e is Extract<LiveEvent, { kind: 'cameras' }> => e.kind === 'cameras')
  const quiet = () => new Promise((r) => setTimeout(r, 1500))

  beforeEach(() => {
    process.env.SKYDOCK_CAMERA_ROOTS = media
    process.env.SKYDOCK_CONFIG_DIR = createTmpDir('skydock-config-')
  })

  it('asks about a camera it has never met, and copies nothing from it', async () => {
    const camera = card('GOPRO', clips)
    const heard: LiveEvent[] = []
    subscribe((e) => heard.push(e))

    await lookForCameras(outputDir, mountinfo([camera]))
    await quiet()

    expect(last(heard)).toMatchObject({
      mounted: [{ camera: 'GOPRO', mount: camera, known: false, auto: false, fresh: 2 }],
      prompts: [camera]
    })
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
    expect(knownCameras()).toEqual([])
  })

  it('looks at a known camera that is not copied by itself, and says how many files are new', async () => {
    await rememberCamera({ key: 'name:GOPRO', name: 'GOPRO', auto: false })
    const camera = card('GOPRO', clips)
    const heard: LiveEvent[] = []
    subscribe((e) => heard.push(e))

    await lookForCameras(outputDir, mountinfo([camera]))
    await quiet()

    expect(last(heard)).toMatchObject({
      mounted: [{ known: true, auto: false, fresh: 2 }],
      prompts: []
    })
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
  })

  it('leaves a camera nobody has answered out of a rescan of every camera', async () => {
    const camera = card('GOPRO', clips)
    await lookForCameras(outputDir, mountinfo([camera]))
    await quiet()

    expect(await copyAgain(outputDir, undefined, [camera])).toBe(0)
    await quiet()
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
  })

  it('copies a known camera by itself when it was told to', async () => {
    await rememberCamera({ key: 'name:GOPRO', name: 'GOPRO', auto: true })
    const camera = card('GOPRO', clips)
    const done = new Promise((resolve) => {
      const stop = subscribe((e) => {
        if (e.kind === 'job' && e.type === 'camera-copy' && e.outcome) {
          stop()
          resolve(e)
        }
      })
    })

    await lookForCameras(outputDir, mountinfo([camera]))

    expect(await done).toMatchObject({ outcome: { copied: 2 } })
  })

  it('copies only the files picked, and the others are still new afterwards', async () => {
    await rememberCamera({ key: 'name:GOPRO', name: 'GOPRO', auto: false })
    const camera = card('GOPRO', clips)
    const heard: LiveEvent[] = []
    subscribe((e) => heard.push(e))
    await lookForCameras(outputDir, mountinfo([camera]))
    await quiet()
    const done = new Promise((resolve) => {
      const stop = subscribe((e) => {
        if (e.kind === 'job' && e.type === 'camera-copy' && e.outcome) {
          stop()
          resolve(e)
        }
      })
    })

    await copyAgain(
      outputDir,
      camera,
      [camera],
      new Set([path.join(camera, 'DCIM', '100GOPRO', 'GX010002.MP4')])
    )
    await done
    await quiet()

    expect(fs.readdirSync(day())).toEqual(['GX010002.MP4'])
    expect(last(heard)).toMatchObject({ mounted: [{ fresh: 1 }] })
  })

  it('remembers a camera answered, copying now when asked, and forgets it again', async () => {
    const camera = card('GOPRO', clips)
    await lookForCameras(outputDir, mountinfo([camera]))
    await quiet()
    const done = new Promise((resolve) => {
      const stop = subscribe((e) => {
        if (e.kind === 'job' && e.type === 'camera-copy' && e.outcome) {
          stop()
          resolve(e)
        }
      })
    })

    await answerCamera(outputDir, { remember: 'name:GOPRO', auto: false, copy: true })

    expect(await done).toMatchObject({ outcome: { copied: 2 } })
    expect(knownCameras()).toMatchObject([{ key: 'name:GOPRO', name: 'GOPRO', auto: false }])
    await answerCamera(outputDir, { auto: { key: 'name:GOPRO', on: true } })
    expect(knownCameras()[0]?.auto).toBe(true)
    await forgetCamera('name:GOPRO')
    expect(knownCameras()).toEqual([])
  })

  it('knows a card by its disk, wherever it is mounted, and by its name where there is no disk', async () => {
    const ids = createTmpDir('skydock-ids-')
    const device = path.join(ids, 'sdb1')
    fs.writeFileSync(device, '')
    fs.mkdirSync(path.join(ids, 'by-uuid'))
    fs.symlinkSync(device, path.join(ids, 'by-uuid', '1234-ABCD'))
    process.env.SKYDOCK_DISK_IDS = path.join(ids, 'by-uuid')
    try {
      const mountinfo = path.join(ids, 'mountinfo')
      const at = (mount: string) => {
        fs.writeFileSync(mountinfo, `100 1 8:17 / ${mount} rw - vfat ${device} rw`)
        return cameraKey(mount, mountinfo)
      }
      expect(await at('/media/a/CARD')).toBe('id:1234-ABCD')
      expect(await at('/media/b/OTHER')).toBe('id:1234-ABCD')
      fs.writeFileSync(mountinfo, '')
      expect(await cameraKey('/media/a/CARD', mountinfo)).toBe('name:CARD')
    } finally {
      delete process.env.SKYDOCK_DISK_IDS
      fs.rmSync(ids, { recursive: true, force: true })
    }
  })
})
