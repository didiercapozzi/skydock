// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askKde, cameraName, lookForCameras, overMtp } from '../src/cameraWatch'
import { CameraGone } from '../src/copy'
import { fileIn, namesIn, readerFor } from '../src/kio'
import type { KioReader } from '../src/kio'
import { copyOverKio, kioCameras } from '../src/kioCamera'
import { createTmpDir } from './fixtures'

/* A camera read through KDE: no drive, no path, only what `kioclient` says of it (RULES, Copying a
   camera off). Stood in for here by a reader over a real folder, so what is copied really is. */

let device: string
let outputDir: string

const CAMERA = 'mtp:/HERO5 Black/GoPro MTP Client Disk Volume'
const SHOT = new Date(2026, 7, 1, 10, 0, 0)

/* the camera's store as KDE would show it, held in a folder here */
const onCamera = (where: string, bytes = 'clip') => {
  const file = path.join(device, 'HERO5 Black', 'GoPro MTP Client Disk Volume', where)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes)
  fs.utimesSync(file, SHOT, SHOT)
  return file
}

const localOf = (url: string) => path.join(device, url.slice('mtp:/'.length))

/* KDE, as far as SkyDock can tell: a name to a line, a size and a time, a whole file copied */
const reader = (over: Partial<KioReader> = {}): KioReader => ({
  ls: async (url) => {
    try {
      return fs.readdirSync(localOf(url))
    } catch {
      return []
    }
  },
  stat: async (url) => {
    try {
      const stat = fs.statSync(localOf(url))
      return { size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }
    } catch {
      return null
    }
  },
  copy: async (url, to) => {
    try {
      fs.copyFileSync(localOf(url), to)
      return true
    } catch {
      return false
    }
  },
  ...over
})

const filed = () => {
  const originals = path.join(outputDir, 'original_files')
  return fs.existsSync(originals)
    ? fs
        .readdirSync(originals)
        .flatMap((day) => fs.readdirSync(path.join(originals, day)).map((name) => `${day}/${name}`))
    : []
}

beforeEach(() => {
  device = createTmpDir('skydock-kde-')
  outputDir = createTmpDir('skydock-kde-out-')
  globalThis.skydockCameraWatch = undefined
  globalThis.skydockLive = undefined
})

afterEach(() => {
  fs.rmSync(device, { recursive: true, force: true })
  fs.rmSync(outputDir, { recursive: true, force: true })
  delete process.env.SKYDOCK_CAMERA_ROOTS
  globalThis.skydockCameraWatch = undefined
})

describe('what kioclient says', () => {
  it('names what is in a folder, and not the folder or its parent', () => {
    expect(namesIn('190GOPRO\n\n191GOPRO\n.\n..\n')).toEqual(['190GOPRO', '191GOPRO'])
  })

  it('says how big a file is and when it was written, as seconds', () => {
    expect(fileIn('NAME GOPR0001.MP4\nSIZE 4096\nMODIFICATION_TIME 1785000000\n')).toEqual({
      size: 4096,
      mtime: 1785000000
    })
  })

  it('reads the time where it is written out as a date', () => {
    const said = fileIn('UDS_SIZE: 12\nUDS_MODIFICATION_TIME: 2026-08-01T10:00:00Z\n')
    expect(said).toEqual({ size: 12, mtime: Math.floor(Date.parse('2026-08-01T10:00:00Z') / 1000) })
  })

  it('does not take a longer field for the size', () => {
    expect(fileIn('SIZE_LARGE 99\nSIZE 12\n')?.size).toBe(12)
  })

  it('knows no time rather than a wrong one', () => {
    expect(fileIn('SIZE 12\nMODIFICATION_TIME soon\n')).toEqual({ size: 12, mtime: null })
  })

  /* word for word what a HERO5 Black says of a photo, over MTP */
  it('reads what a GoPro says of a file, which has a size and no time', () => {
    const gopro = [
      'NAME                  G0062266.JPG',
      'SIZE                  2118308',
      'FILE_TYPE             0100000',
      'INODE                 1269',
      'MIME_TYPE             image/jpeg',
      'ACCESS                0555',
      'MODIFICATION_TIME     Thu Jan 1 01:00:00 1970',
      'ACCESS_TIME           Thu Jan 1 01:00:00 1970',
      'CREATION_TIME         Thu Jan 1 01:00:00 1970'
    ].join('\n')

    expect(fileIn(gopro)).toEqual({ size: 2118308, mtime: null })
  })

  /* an answer that says how big a file is counts, however the program ends: thrown away, it would
     cost a clip fetched whole again only to be found here already */
  it('is taken at its word even when it ends unhappily', async () => {
    const program = path.join(device, 'kioclient')
    fs.writeFileSync(
      program,
      [
        '#!/bin/sh',
        "printf 'NAME  G0062266.JPG\\nSIZE  2118308\\nMODIFICATION_TIME  Thu Jan 1 01:00:00 1970\\n'",
        'exit 1'
      ].join('\n')
    )
    fs.chmodSync(program, 0o755)

    expect(await readerFor(program).stat('mtp:/HERO5 Black/x/G0062266.JPG')).toEqual({
      size: 2118308,
      mtime: null
    })
  })

  it('knows nothing of a file it cannot find a size for', () => {
    expect(fileIn('NAME GOPR0001.MP4\n')).toBeNull()
  })
})

describe('a camera KDE reaches', () => {
  it('is the store that holds DCIM, named after the camera itself', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')

    expect(await kioCameras(reader())).toEqual([CAMERA])
    expect(cameraName(CAMERA)).toBe('HERO5 Black')
    /* and it says why it is slower than a card */
    expect(overMtp(CAMERA)).toBe(true)
  })

  it('is not a store with no DCIM in it', async () => {
    onCamera('Get_started_with_GoPro.url')

    expect(await kioCameras(reader())).toEqual([])
  })

  it('is nothing at all on a machine without KDE', async () => {
    expect(await kioCameras(null)).toEqual([])
  })
})

describe('a camera read through KDE, copied off', () => {
  it('files each clip under the day it was shot, as a card is', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4', 'one')
    onCamera('DCIM/191GOPRO/GOPR0002.MP4', 'two')

    const said = await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })

    expect(said).toEqual({ done: 2, total: 2, copied: 2, skipped: 0 })
    expect(filed().sort()).toEqual(['2026-08-01/GOPR0001.MP4', '2026-08-01/GOPR0002.MP4'])
  })

  /* the thumbnails and low-resolution copies a GoPro keeps beside each clip are not media */
  it('passes over what a GoPro keeps beside each clip', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')
    onCamera('DCIM/190GOPRO/GOPR0001.THM')
    onCamera('DCIM/190GOPRO/GOPR0001.LRV')

    const said = await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })

    expect(said.total).toBe(1)
    expect(filed()).toEqual(['2026-08-01/GOPR0001.MP4'])
  })

  /* plugging the camera in again reads almost nothing: a clip here already costs a question */
  it('passes over what is here already, without fetching it again', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')
    await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })

    const fetched: string[] = []
    const said = await copyOverKio({
      camera: CAMERA,
      reader: reader({
        copy: async (url) => {
          fetched.push(url)
          return false
        }
      }),
      outputDir
    })

    expect(said).toEqual({ done: 1, total: 1, copied: 0, skipped: 1 })
    expect(fetched).toEqual([])
  })

  /* A GoPro says every file was written in 1970, which is no time at all: a clip is known by its
     name and its size alone then, and plugging the camera in again still fetches nothing. */
  it('passes over what is here already when the camera gives no time', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')
    const timeless = reader({
      stat: async (url) => ({ size: fs.statSync(localOf(url)).size, mtime: null })
    })
    await copyOverKio({ camera: CAMERA, reader: timeless, outputDir })

    const fetched: string[] = []
    const said = await copyOverKio({
      camera: CAMERA,
      reader: { ...timeless, copy: async (url) => (fetched.push(url), false) },
      outputDir
    })

    expect(said.skipped).toBe(1)
    expect(fetched).toEqual([])
  })

  /* a camera that cannot say how big a clip is has it fetched and compared here instead */
  it('lets go of a clip that turns out to be here after all', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')
    await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })

    const said = await copyOverKio({
      camera: CAMERA,
      reader: reader({ stat: async () => null }),
      outputDir
    })

    expect(said.skipped).toBe(1)
    expect(filed()).toEqual(['2026-08-01/GOPR0001.MP4'])
  })

  /* a second camera's first clip always has the first camera's name */
  it('gives a different clip of the same name the next number', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4', 'first camera')
    await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })
    onCamera('DCIM/190GOPRO/GOPR0001.MP4', 'another camera altogether')

    await copyOverKio({ camera: CAMERA, reader: reader(), outputDir })

    expect(filed().sort()).toEqual(['2026-08-01/GOPR0001.MP4', '2026-08-01/GOPR0001_2.MP4'])
  })

  /* what came before is whole; the clip that was cut short leaves nothing behind */
  it('stops, leaving nothing half written, when the camera stops answering', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')

    await expect(
      copyOverKio({ camera: CAMERA, reader: reader({ copy: async () => false }), outputDir })
    ).rejects.toBeInstanceOf(CameraGone)

    expect(filed()).toEqual([])
    expect(fs.existsSync(path.join(outputDir, '.incoming'))).toBe(false)
  })

  it('stops when less came across than the camera said there was', async () => {
    onCamera('DCIM/190GOPRO/GOPR0001.MP4', 'the whole clip')

    await expect(
      copyOverKio({
        camera: CAMERA,
        reader: reader({ stat: async () => ({ size: 999_999, mtime: null }) }),
        outputDir
      })
    ).rejects.toBeInstanceOf(CameraGone)
    expect(filed()).toEqual([])
  })
})

/* KDE is asked only while that could have changed: a program run is not something to do every
   couple of seconds for ever on a machine with nothing plugged in */
describe('a camera KDE reaches, plugged in', () => {
  it('is copied off by itself once KDE says it reaches it', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = device
    onCamera('DCIM/190GOPRO/GOPR0001.MP4')

    await askKde(async () => [CAMERA])
    lookForCameras(outputDir, path.join(device, 'no-mounts'))

    expect(globalThis.skydockCameraWatch?.seen.has(CAMERA)).toBe(true)
  })

  it('is not asked for at all where nowhere is set to look', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = ''
    let asked = 0

    await askKde(async () => {
      asked++
      return [CAMERA]
    })

    expect(asked).toBe(0)
  })

  it('is not asked again until something changes', async () => {
    process.env.SKYDOCK_CAMERA_ROOTS = device
    let asked = 0
    const ask = async () => {
      asked++
      return []
    }

    await askKde(ask)
    globalThis.skydockCameraWatch!.askUntil = 0
    await askKde(ask)

    expect(asked).toBe(1)
  })
})
