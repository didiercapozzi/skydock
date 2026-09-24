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
  it('says of each file whether it is on the storage, only copied here, or not copied yet', async () => {
    const root = card({ 'GX01.MP4': 1, 'GX02.MP4': 2 })
    await copyCamera({ cameraDir: path.join(root, 'DCIM'), outputDir })
    card({ 'GX03.MP4': 3 })
    const storage: Record<string, string> = {}
    saveManifest(
      path.join(outputDir, 'manifest.json'),
      board([dropzone([sentAsCopy(await entry('GX01.MP4'), storage), await entry('GX02.MP4')])])
    )

    const [camera] = await listCameras(outputDir, [root])

    expect(camera?.files.map((f) => [path.basename(f.name), f.state])).toEqual([
      ['GX01.MP4', 'stored'],
      ['GX02.MP4', 'copied'],
      ['GX03.MP4', 'missing']
    ])
  })
})

describe('the camera page', () => {
  it('lists the files on the card newest first', async () => {
    const root = card({ 'GX01.MP4': 1, 'GX02.MP4': 2 })
    const later = new Date(DAY.getTime() + 3600_000)
    fs.utimesSync(onCard(root, 'GX02.MP4'), later, later)

    const [camera] = await listCameras(outputDir, [root])

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
      session,
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

  /* a tandem's original goes to the backup inside a zip: the entry in it is held against the camera
     file, byte for byte, and the zip against the storage */
  it('takes a tandem file off the card when the backup zip holds it, byte for byte', async () => {
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
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: { at: 1, rushes }
      }
    ])
    withStorage({ [rushes.remotePath]: rushes.md5 })

    await remove(root, manifest)

    expect(fs.existsSync(onCard(root, 'GX01.MP4'))).toBe(false)
  })

  it('keeps a tandem file on the card when the backup zip holds a different file of that name', async () => {
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
        destination: 'Tandems',
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
        session,
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
      askedAt: 0
    }

    await expect(remove(root, manifest)).rejects.toThrow(/being copied/)
  })
})
