// @vitest-environment node
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeArchive } from '../src/archive'
import { deleteFromCameras, listCameras } from '../src/cameraFiles'
import { copyCamera } from '../src/copy'
import { computeFileId } from '../src/fileId'
import { saveManifest } from '../src/manifest'
import { trashUnsorted } from '../src/trashUnsorted'
import type { NasSession } from '../src/nas'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir, nasStubs, stubFetch } from './fixtures'

/* What is on a camera plugged in, and taking off it what is already safe on the storage (RULES,
   Seeing what is on a camera). Real files on a real card and a real board; only the storage's
   answers are stubbed. A file leaves the card only once the storage is proved to hold it by its
   bytes — never by its name, which changes on the way — and it goes to the bin, not erased. */

let media: string
let outputDir: string
let trashDir: string

const DAY = new Date(2026, 7, 1, 10, 0, 0)
const session: NasSession = { hostname: 'http://nas.test', username: 'u', sessionId: 'sid' }
const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

const card = (clips: Record<string, number>) => {
  const root = path.join(media, 'GOPRO')
  for (const [clip, fill] of Object.entries(clips)) {
    const file = path.join(root, 'DCIM', '100GOPRO', clip)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.alloc(32, fill))
    fs.utimesSync(file, DAY, DAY)
  }
  return root
}

const onCard = (root: string, clip: string) => path.join(root, 'DCIM', '100GOPRO', clip)
const original = (clip: string) => path.join(outputDir, 'original_files', '2026-08-01', clip)

/* a board file for an original copied off the card, known by its content as a scan knows it */
const entry = async (clip: string): Promise<ManifestFile> => ({
  id: await computeFileId(original(clip)),
  path: original(clip),
  filename: clip,
  size: 32,
  mtime: DAY.getTime() / 1000
})

/* the dropzone's copy of it — renamed and changed, as processing changes it — sent to the storage */
const sentAsCopy = (file: ManifestFile, storage: Record<string, string>) => {
  const copy = path.join(outputDir, 'processed', 'Yverdon', `yverdon_${file.filename}`)
  fs.mkdirSync(path.dirname(copy), { recursive: true })
  fs.writeFileSync(copy, Buffer.concat([fs.readFileSync(file.path), Buffer.from('stamped')]))
  const remotePath = `/SkyDock/Yverdon/yverdon_${file.filename}`
  storage[remotePath] = md5(copy)
  return {
    ...file,
    processed: {
      path: copy,
      size: 39,
      at: 1,
      source: { id: file.id!, size: 32, mtime: file.mtime }
    },
    uploaded: { localPath: copy, remotePath, md5: md5(copy), size: 39, at: 1 }
  }
}

const dropzone = (files: ManifestFile[]): ManifestGroup => ({
  id: 'dz',
  label: 'dz',
  day: '01.08.2026',
  destination: 'Yverdon',
  files
})

const board = (groups: ManifestGroup[]): Manifest => ({
  version: 1,
  createdAt: 'x',
  files: groups.flatMap((g) => g.files),
  groups
})

const withStorage = (hashes: Record<string, string>) => {
  const stub = nasStubs({ md5: hashes })
  stubFetch((url) => stub(url) ?? new Response('{}'))
}

beforeEach(() => {
  media = createTmpDir('skydock-card-')
  outputDir = createTmpDir('skydock-card-out-')
  trashDir = path.join(outputDir, 'bin')
  globalThis.skydockCameraWatch = undefined
})

afterEach(() => {
  fs.rmSync(media, { recursive: true, force: true })
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('what is on a camera', () => {
  it('says of each file whether it is on the storage, only copied here, in the bin, or not copied yet', async () => {
    const root = card({ 'GX01.MP4': 1, 'GX02.MP4': 2 })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    card({ 'GX03.MP4': 3 })
    card({ 'GX04.MP4': 4 })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    fs.rmSync(original('GX03.MP4'))
    const unwanted = board([])
    unwanted.files = [await entry('GX04.MP4')]
    await trashUnsorted(unwanted, new Set([unwanted.files[0]!.id!]), outputDir, trashDir)
    card({ 'GX05.MP4': 5 })
    const storage: Record<string, string> = {}
    saveManifest(
      path.join(outputDir, 'manifest.json'),
      board([dropzone([sentAsCopy(await entry('GX01.MP4'), storage), await entry('GX02.MP4')])])
    )

    const [camera] = await listCameras(outputDir, [root], trashDir)

    expect(camera?.files.map((f) => [path.basename(f.name), f.state])).toEqual([
      ['GX01.MP4', 'stored'],
      ['GX02.MP4', 'copied'],
      ['GX03.MP4', 'missing'],
      ['GX04.MP4', 'binned'],
      ['GX05.MP4', 'missing']
    ])
  })
})

describe('what is on a camera, put in the bin', () => {
  const binnedOne = async () => {
    const root = card({ 'GX01.MP4': 1 })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    const copies = board([])
    copies.files = [await entry('GX01.MP4')]
    const { bin } = await trashUnsorted(
      copies,
      new Set([copies.files[0]!.id!]),
      outputDir,
      trashDir
    )
    return { root, inBin: path.join(bin, '2026-08-01', 'GX01.MP4') }
  }
  const stateOf = async (root: string) =>
    (await listCameras(outputDir, [root], trashDir))[0]?.files[0]?.state

  it('knows a copy in the bin by its bytes, whatever it is called there', async () => {
    const { root, inBin } = await binnedOne()
    fs.renameSync(inBin, path.join(path.dirname(inBin), 'not wanted.MP4'))

    expect(await stateOf(root)).toBe('binned')
  })

  it('does not take a file of the same name and size in the bin for its copy', async () => {
    const { root, inBin } = await binnedOne()
    fs.writeFileSync(inBin, Buffer.alloc(32, 9))

    expect(await stateOf(root)).toBe('missing')
  })

  /* two folders of a card often hold files of the same name: the second copy is taken with _2, and
     both are still known to be in the bin */
  it('says a file is in the bin when its copy went there under a name taken with _2', async () => {
    const root = card({})
    const twice = (folder: string, fill: number) => {
      const file = path.join(root, 'DCIM', folder, 'TIMELAPSE_0001.JPG')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, Buffer.alloc(16 + fill, fill))
      fs.utimesSync(file, DAY, DAY)
    }
    twice('001_0057', 1)
    twice('001_0058', 2)
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    const copies = board([])
    copies.files = await Promise.all(
      ['TIMELAPSE_0001.JPG', 'TIMELAPSE_0001_2.JPG'].map(async (name) => ({
        ...(await entry(name)),
        size: fs.statSync(original(name)).size
      }))
    )
    await trashUnsorted(copies, new Set(copies.files.map((f) => f.id!)), outputDir, trashDir)

    const [camera] = await listCameras(outputDir, [root], trashDir)

    expect(camera?.files.map((f) => [f.name, f.state]).sort()).toEqual([
      ['001_0057/TIMELAPSE_0001.JPG', 'binned'],
      ['001_0058/TIMELAPSE_0001.JPG', 'binned']
    ])
  })
})

describe('the camera page', () => {
  it('lists the files on the card newest first', async () => {
    const root = card({ 'GX01.MP4': 1, 'GX02.MP4': 2 })
    const later = new Date(DAY.getTime() + 3600_000)
    fs.utimesSync(onCard(root, 'GX02.MP4'), later, later)

    const [camera] = await listCameras(outputDir, [root], trashDir)

    expect(camera?.files.map((f) => path.basename(f.name))).toEqual(['GX02.MP4', 'GX01.MP4'])
  })
})

describe('deleting from a camera', () => {
  const setup = async () => {
    const root = card({ 'GX01.MP4': 1 })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    return { root, file: await entry('GX01.MP4') }
  }
  const remove = (root: string, manifest: Manifest) =>
    deleteFromCameras({
      paths: [onCard(root, 'GX01.MP4')],
      manifest,
      connect: async () => session,
      trashDir,
      mounts: [root]
    })

  it('takes a dropzone file off the card once the copy made from it is on the storage', async () => {
    const { root, file } = await setup()
    const storage: Record<string, string> = {}
    const manifest = board([dropzone([sentAsCopy(file, storage)])])
    withStorage(storage)

    const result = await remove(root, manifest)

    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(false)
    expect(result).toMatchObject({ count: 1, bytes: 32 })
    expect(fs.existsSync(path.join(result.bins[0]!, 'DCIM', '100GOPRO', 'GX01.MP4'))).toBe(true)
  })

  it('keeps it on the card when the storage no longer holds what was sent', async () => {
    const { root, file } = await setup()
    const storage: Record<string, string> = {}
    const manifest = board([dropzone([sentAsCopy(file, storage)])])
    withStorage({ '/SkyDock/Yverdon/yverdon_GX01.MP4': 'something-else' })

    await expect(remove(root, manifest)).rejects.toThrow(
      /Nothing was deleted: GX01\.MP4 could not be matched with what the storage holds/
    )
    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(true)
  })

  it('keeps it on the card while it is only copied here, not uploaded', async () => {
    const { root, file } = await setup()
    withStorage({})

    await expect(remove(root, board([dropzone([file])]))).rejects.toThrow(/is not uploaded yet/)
    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(true)
  })

  it('takes a file off the card once its copy here was put in the bin, without the storage', async () => {
    const { root, file } = await setup()
    const manifest = board([])
    manifest.files = [file]
    await trashUnsorted(manifest, new Set([file.id!]), outputDir, trashDir)
    const connect = vi.fn(async () => null)

    await deleteFromCameras({
      paths: [onCard(root, 'GX01.MP4')],
      manifest,
      connect,
      trashDir,
      mounts: [root]
    })

    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(false)
    expect(connect).not.toHaveBeenCalled()
  })

  it('keeps it on the card when what is in the bin under its name is a different file', async () => {
    const { root, file } = await setup()
    const manifest = board([])
    manifest.files = [file]
    fs.writeFileSync(file.path, Buffer.alloc(32, 9))
    await trashUnsorted(manifest, new Set([file.id!]), outputDir, trashDir)

    await expect(remove(root, manifest)).rejects.toThrow(/neither on the board nor in the bin/)
    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(true)
  })

  /* a montage's original goes to the backup inside a zip: the entry in it is held against the camera
     file, byte for byte, and the zip against the storage */
  it('takes a montage file off the card when the backup zip holds it, byte for byte', async () => {
    const { root, file } = await setup()
    const zip = path.join(outputDir, 'luc.rushes.zip')
    await writeArchive(zip, [{ file: file.path, name: file.filename }], { level: 0 })
    const rushes = {
      localPath: zip,
      remotePath: '/Backup/luc.rushes.zip',
      md5: md5(zip),
      size: 1,
      at: 1
    }
    const manifest = board([
      {
        ...dropzone([file]),
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, rushes }
      }
    ])
    withStorage({ [rushes.remotePath]: rushes.md5 })

    await remove(root, manifest)

    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(false)
  })

  /* freeing a montage deletes its archive here: nothing is left to hold the file against, and it says so */
  it('keeps a montage file on the card, and says why, once its archive was freed from this machine', async () => {
    const { root, file } = await setup()
    const rushes = {
      localPath: path.join(outputDir, 'gone.rushes.zip'),
      remotePath: '/Backup/gone.rushes.zip',
      md5: 'x',
      size: 1,
      at: 1
    }
    const manifest = board([
      {
        ...dropzone([file]),
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, rushes }
      }
    ])
    withStorage({ [rushes.remotePath]: 'x' })

    await expect(remove(root, manifest)).rejects.toThrow(
      /GX01\.MP4 is in a montage freed from this machine, whose archive is no longer here/
    )
    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(true)
  })

  /* the archive is gone, but what it held was written down as it went up, and the storage holds that zip */
  it('takes a montage file off the card once its archive was freed, by what the upload wrote down', async () => {
    const { root, file } = await setup()
    const rushes = {
      localPath: path.join(outputDir, 'gone.rushes.zip'),
      remotePath: '/Backup/gone.rushes.zip',
      md5: 'zipsum',
      size: 1,
      at: 1,
      holds: ['videos' as const],
      entries: { [`videos/${file.filename}`]: md5(file.path) }
    }
    const manifest = board([
      {
        ...dropzone([file]),
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, rushes }
      }
    ])
    withStorage({ [rushes.remotePath]: 'zipsum' })

    const [camera] = await listCameras(outputDir, [root], trashDir)
    expect(camera?.files[0]?.locked).toBeUndefined()

    await remove(root, manifest)

    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(false)
  })

  it('lists such a file as locked, so it is never offered for deleting', async () => {
    const { root, file } = await setup()
    const rushes = {
      localPath: path.join(outputDir, 'gone.rushes.zip'),
      remotePath: '/Backup/gone.rushes.zip',
      md5: 'x',
      size: 1,
      at: 1
    }
    saveManifest(
      path.join(outputDir, 'manifest.json'),
      board([
        {
          ...dropzone([file]),
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          uploaded: { at: 1, rushes }
        }
      ])
    )

    const [camera] = await listCameras(outputDir, [root], trashDir)

    expect(camera?.files[0]).toMatchObject({ state: 'stored', locked: true })
  })

  it('keeps a montage file on the card when the backup zip holds a different file of that name', async () => {
    const { root, file } = await setup()
    const other = path.join(outputDir, 'other.MP4')
    fs.writeFileSync(other, Buffer.alloc(32, 7))
    const zip = path.join(outputDir, 'luc.rushes.zip')
    await writeArchive(zip, [{ file: other, name: file.filename }], { level: 0 })
    const rushes = {
      localPath: zip,
      remotePath: '/Backup/luc.rushes.zip',
      md5: md5(zip),
      size: 1,
      at: 1
    }
    const manifest = board([
      {
        ...dropzone([file]),
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, rushes }
      }
    ])
    withStorage({ [rushes.remotePath]: rushes.md5 })

    await expect(remove(root, manifest)).rejects.toThrow(/could not be matched/)
    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(true)
  })

  it('never touches a file that is not on a camera plugged in', async () => {
    const elsewhere = path.join(media, 'notes.MP4')
    fs.writeFileSync(elsewhere, 'x')

    await expect(
      deleteFromCameras({
        paths: [elsewhere],
        manifest: board([]),
        connect: async () => session,
        trashDir,
        mounts: [card({})]
      })
    ).rejects.toThrow(/not on a camera plugged in now/)
    expect(fs.existsSync(elsewhere)).toBe(true)
  })

  it('deletes nothing while a camera is being copied', async () => {
    const { root, file } = await setup()
    const storage: Record<string, string> = {}
    const manifest = board([dropzone([sentAsCopy(file, storage)])])
    withStorage(storage)
    globalThis.skydockCameraWatch = {
      timer: null,
      seen: new Set(),
      queue: [],
      copying: true,
      said: '',
      kde: [],
      asking: false,
      askUntil: 0,
      askedAt: 0,
      seenOn: {}
    }

    await expect(remove(root, manifest)).rejects.toThrow(/being copied/)
  })
})
