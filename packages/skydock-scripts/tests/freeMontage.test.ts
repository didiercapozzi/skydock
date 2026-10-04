// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeArchive } from '../src/archive'
import { computeFileId } from '../src/fileId'
import { freeMontage } from '../src/freeMontage'
import { loadManifest, saveManifest } from '../src/manifest'
import type { NasSession } from '../src/nas'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, nasStubs, stubFetch } from './fixtures'

/* Freeing a montage deletes gigabytes that exist nowhere else on this machine, so it only ever
   happens on proof: every file that went up hashed here and hashed by the storage, both matching
   what was sent, and the originals shown to be exactly what the backup holds. Any doubt, and
   nothing at all is deleted. */

const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

const session: NasSession = {
  hostname: 'http://nas.test',
  username: 'u',
  sessionId: 'sid',
  backupFolder: '/Backup'
}

const PAX = '/SkyDock/Passengers/Luc Favre'
const AT = 1_785_000_000

let outputDir: string

/* `projectInBackup`: the editing project was chosen to go into the backup zip with the originals */
const setup = async ({ projectInBackup = false } = {}) => {
  const originals = path.join(outputDir, 'original_files', '2026-08-01')
  const folder = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
  for (const d of [originals, path.join(folder, 'videos'), path.join(folder, 'photos')])
    fs.mkdirSync(d, { recursive: true })

  const source = (name: string, bytes: number, fill: number) => {
    const file = path.join(originals, name)
    fs.writeFileSync(file, Buffer.alloc(bytes, fill))
    return file
  }
  const copy = (sub: string, name: string, bytes: number, fill: number) => {
    const file = path.join(folder, sub, name)
    fs.writeFileSync(file, Buffer.alloc(bytes, fill))
    return file
  }
  const entry = (id: string, src: string, out: string): ManifestFile => ({
    id,
    path: src,
    filename: path.basename(src),
    size: fs.statSync(src).size,
    mtime: AT,
    processed: {
      path: out,
      size: fs.statSync(out).size,
      at: 1,
      source: { id, size: fs.statSync(src).size, mtime: AT }
    }
  })
  const files = [
    entry('v1', source('GX01.MP4', 400, 1), copy('videos', 'luc_1.mp4', 300, 1)),
    entry('p1', source('G001.JPG', 100, 2), copy('photos', 'luc_2.jpg', 90, 2))
  ]
  const film = path.join(folder, 'luc.mp4')
  fs.writeFileSync(film, Buffer.alloc(200, 9))
  fs.writeFileSync(path.join(folder, 'luc.kdenlive'), '<mlt/>')
  const photosZip = (await writeArchive(path.join(folder, 'luc.photos.zip'), [
    { file: files[1]!.processed!.path, name: 'luc_2.jpg' }
  ]))!
  const rushesZip = (await writeArchive(path.join(folder, 'luc.rushes.zip'), [
    { file: files[0]!.path, name: 'GX01.MP4' },
    ...(projectInBackup ? [{ file: path.join(folder, 'luc.kdenlive'), name: 'luc.kdenlive' }] : [])
  ]))!

  const sent = (local: string, remote: string) => ({
    localPath: local,
    remotePath: remote,
    md5: md5(local),
    size: fs.statSync(local).size,
    at: 1
  })
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files,
    groups: [
      {
        id: 'g1',
        label: 'jump',
        day: '01.08.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files,
        uploaded: {
          at: 1,
          film: sent(film, `${PAX}/luc.mp4`),
          photos: sent(photosZip, `${PAX}/luc.photos.zip`),
          rushes: sent(rushesZip, '/Backup/luc.rushes.zip')
        }
      }
    ],
    destinations: [{ name: 'Passengers', path: '/SkyDock/Passengers' }]
  }
  /* by default the storage holds exactly what was sent */
  const onStorage = Object.fromEntries(
    [
      manifest.groups[0]!.uploaded!.film!,
      manifest.groups[0]!.uploaded!.photos!,
      manifest.groups[0]!.uploaded!.rushes!
    ].map((f) => [f.remotePath, f.md5])
  )
  return { manifest, folder, film, originals, onStorage }
}

const withStorage = (hashes: Record<string, string>) => {
  const stub = nasStubs({ md5: hashes })
  stubFetch((url) => stub(url) ?? new Response('{}'))
}

const trashDir = () => path.join(outputDir, '.trash')

const free = (manifest: Manifest) =>
  freeMontage({ manifest, outputDir, groupId: 'g1', session, trashDir: trashDir() })

const inTheBin = () =>
  fs.readdirSync(trashDir()).flatMap((d) => fs.readdirSync(path.join(trashDir(), d)))

beforeEach(() => {
  outputDir = createTmpDir('skydock-free-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('freeing an uploaded montage', () => {
  it('deletes the originals and the whole of its folder, putting the project in the bin', async () => {
    const { manifest, folder, originals, onStorage } = await setup()
    withStorage(onStorage)

    const result = await free(manifest)

    expect(fs.existsSync(folder)).toBe(false)
    expect(inTheBin()).toEqual(['luc.kdenlive'])
    expect(fs.readdirSync(originals)).toEqual([])
    expect(result.bytes).toBeGreaterThan(1000)
  })

  /* the project in the backup is a second copy of the edit, not a stranger in the zip */
  it('frees a montage whose backup zip also holds the editing project', async () => {
    const { manifest, folder, onStorage } = await setup({ projectInBackup: true })
    withStorage(onStorage)

    await free(manifest)

    expect(fs.existsSync(folder)).toBe(false)
  })

  /* a clip copied into another jump is not this montage's alone to delete */
  it('leaves on the disk an original another jump still holds a copy of', async () => {
    const { manifest, originals, onStorage } = await setup()
    withStorage(onStorage)
    const shared = manifest.files[0]!
    const copy = { ...shared, id: `${shared.id}~1`, copyOf: shared.id, processed: undefined }
    /* a list of its own: the scene hands the registry and the montage the same one */
    manifest.files = [...manifest.files, copy]
    manifest.groups.push({ id: 'g2', label: 'g2', day: '01.08.2026', files: [copy] })

    await free(manifest)

    expect(fs.readdirSync(originals)).toEqual(['GX01.MP4'])
    /* and it is not said to be on the storage only, since it is on the disk: a file the board calls
       gone is one nothing can be done with — not copied into a jump, not moved, not dropped in again */
    expect(manifest.files.find((f) => f.id === shared.id)?.freed).toBeUndefined()
    expect(manifest.groups[0]?.files.find((f) => f.id === shared.id)?.freed).toBeUndefined()
    /* the rest of the montage went, and says so */
    expect(manifest.files.filter((f) => f.freed).length).toBeGreaterThan(0)
  })

  it('remembers that it lives on the storage only, and says every file is uploaded', async () => {
    const { manifest, onStorage } = await setup()
    withStorage(onStorage)
    await free(manifest)
    expect(manifest.groups[0]?.freed?.bytes).toBeGreaterThan(0)
    expect(manifest.files.every((f) => f.freed)).toBe(true)
    /* the record of what was sent where is kept */
    expect(manifest.groups[0]?.uploaded?.film?.remotePath).toBe(`${PAX}/luc.mp4`)
  })

  it('refuses, deleting nothing, when the storage does not hold what was sent', async () => {
    const { manifest, folder, originals, onStorage } = await setup()
    withStorage({ ...onStorage, [`${PAX}/luc.mp4`]: 'ffffffffffffffffffffffffffffffff' })

    await expect(free(manifest)).rejects.toThrow(/luc\.mp4 on the storage is not the file/)
    expect(fs.readdirSync(folder)).toContain('luc.mp4')
    expect(fs.readdirSync(originals)).toHaveLength(2)
  })

  /* one passenger is one folder: two jumps in it cannot be freed one at a time */
  it('refuses a passenger with more than one jump, deleting nothing', async () => {
    const { manifest, originals, onStorage } = await setup()
    withStorage(onStorage)
    const first = manifest.groups[0]!
    manifest.groups.push({ ...first, id: 'g2', files: [], uploaded: undefined })

    await expect(free(manifest)).rejects.toThrow(/more than one jump/)
    expect(fs.readdirSync(originals)).toHaveLength(2)
  })

  it('refuses when the storage cannot say', async () => {
    const { manifest, onStorage } = await setup()
    const { [`${PAX}/luc.photos.zip`]: _gone, ...rest } = onStorage
    withStorage(rest)
    await expect(free(manifest)).rejects.toThrow(/could not be checked/)
  })

  it('refuses when the film here changed since it was uploaded', async () => {
    const { manifest, film, onStorage } = await setup()
    withStorage(onStorage)
    fs.writeFileSync(film, Buffer.alloc(200, 8))
    await expect(free(manifest)).rejects.toThrow(/luc\.mp4 changed here/)
  })

  it('refuses when an original is no longer what the backup zip holds', async () => {
    const { manifest, originals, onStorage } = await setup()
    withStorage(onStorage)
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(path.join(originals, 'GX01.MP4'), later, later)
    await expect(free(manifest)).rejects.toThrow(/GX01\.MP4 changed since the backup zip was made/)
    expect(fs.existsSync(path.join(originals, 'GX01.MP4'))).toBe(true)
  })

  /* The edit was saved again after the upload, so the backup holds an older one. Freeing puts the
     project in the bin, so nothing is lost by it — what freeing has to prove is the originals. */
  it('still frees when the project was saved again after it went into the backup', async () => {
    const { manifest, folder, onStorage } = await setup({ projectInBackup: true })
    withStorage(onStorage)
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(path.join(folder, 'luc.kdenlive'), later, later)

    await free(manifest)

    expect(fs.existsSync(folder)).toBe(false)
    expect(inTheBin()).toEqual(['luc.kdenlive'])
  })

  /* freed once, and some of it came back (copied back off a camera, or fetched from the storage): what
     freeing proved then still stands, so what is here again can be freed without preparing and uploading
     the whole montage a second time */
  describe('a montage freed before, with its originals back', () => {
    const cameBack = async (bytes = 400, fill = 1) => {
      const { manifest, originals, onStorage } = await setup()
      manifest.groups[0]!.uploaded!.sent = [
        {
          name: 'luc.rushes.zip',
          holds: ['videos'],
          to: ['/Backup'],
          zip: true,
          contents: ['videos/GX01.MP4']
        }
      ]
      withStorage(onStorage)
      await free(manifest)
      /* the original is back where it was, and the montage no longer reads as freed */
      const group = manifest.groups[0]!
      const back = path.join(originals, 'GX01.MP4')
      fs.mkdirSync(originals, { recursive: true })
      fs.writeFileSync(back, Buffer.alloc(bytes, fill))
      const id = await computeFileId(back)
      for (const f of [group.files[0]!, manifest.files[0]!]) {
        f.id = id
        f.freed = undefined
        if (f.processed) f.processed.source.id = id
      }
      group.freedBefore = group.freed
      group.freed = undefined
      return { manifest, back, group }
    }

    it('is freed again, what is here deleted, without its prepared copies or archives', async () => {
      const { manifest, back, group } = await cameBack()
      /* the archives and prepared copies are long gone: that is what freeing did */
      expect(fs.existsSync(group.uploaded!.rushes!.localPath)).toBe(false)

      const result = await free(manifest)

      expect(fs.existsSync(back)).toBe(false)
      expect(result.bytes).toBeGreaterThan(0)
      expect(manifest.groups[0]!.freed).toBeDefined()
      expect(manifest.groups[0]!.freedBefore).toBeUndefined()
    })

    /* an upload from before zips were listed names no files: the copy made from it before the upload does */
    it('is freed again when the upload names no files but a copy was made from it before', async () => {
      const { manifest, back, group } = await cameBack()
      group.uploaded!.sent = group.uploaded!.sent!.map((s) => ({ ...s, contents: undefined }))
      group.files[0]!.processed = {
        path: path.join(outputDir, 'gone.mp4'),
        size: 1,
        at: group.uploaded!.at - 10,
        source: {
          id: group.files[0]!.id,
          size: 400,
          mtime: 1,
          cropStart: null,
          cropEnd: null,
          frame: null,
          rotation: null
        }
      }

      await free(manifest)

      expect(fs.existsSync(back)).toBe(false)
    })

    it('is refused, deleting nothing, when what came back is not the file that was uploaded', async () => {
      const { manifest, back } = await cameBack(400, 7)
      /* its content is another's, though it has the name and the size */
      manifest.groups[0]!.files[0]!.id = 'someone-elses'

      await expect(free(manifest)).rejects.toThrow(/is not the file that was uploaded/)
      expect(fs.existsSync(back)).toBe(true)
    })

    it('is refused when the storage no longer holds what was sent', async () => {
      const { manifest, back, group } = await cameBack()
      withStorage({ [group.uploaded!.film!.remotePath]: 'something-else' })

      await expect(free(manifest)).rejects.toThrow(/Not freed, nothing was deleted/)
      expect(fs.existsSync(back)).toBe(true)
    })
  })

  it('refuses a montage that was never uploaded', async () => {
    const { manifest } = await setup()
    delete manifest.groups[0]!.uploaded
    await expect(free(manifest)).rejects.toThrow(/Upload this montage first/)
  })

  /* the whole point of freeing: the card may still hold the original, and plugging it in must not
     bring back what was deliberately let go */
  it('leaves the originals on the camera when it is plugged in again, rather than copying them back', async () => {
    const { manifest, onStorage } = await setup()
    withStorage(onStorage)
    await free(manifest)
    saveManifest(path.join(outputDir, 'manifest.json'), manifest)
    const card = path.join(outputDir, 'card', 'DCIM', '100GOPRO')
    fs.mkdirSync(card, { recursive: true })
    const clip = path.join(card, 'GX01.MP4')
    fs.writeFileSync(clip, Buffer.alloc(400, 1))
    const shot = new Date(2026, 7, 1, 10, 0, 0)
    fs.utimesSync(clip, shot, shot)

    const { copyCamera } = await import('../src/copy')
    const result = await copyCamera({ cameraDir: path.dirname(path.dirname(card)), outputDir })

    expect(result).toMatchObject({ copied: 0, skipped: 1 })
    expect(fs.existsSync(path.join(outputDir, 'original_files', '2026-08-01', 'GX01.MP4'))).toBe(
      false
    )
  })

  it('keeps a freed montage through a later scan, rather than dropping its missing files', async () => {
    const { manifest, onStorage } = await setup()
    withStorage(onStorage)
    await free(manifest)
    const manifestPath = path.join(outputDir, 'manifest.json')
    saveManifest(manifestPath, manifest)

    const { scanMedia } = await import('../src/scan')
    await scanMedia({ outputDir })

    const after = loadManifest(manifestPath)!
    expect(after.groups[0]?.files.map((f) => f.id)).toEqual(['v1', 'p1'])
    expect(after.files.every((f) => f.freed)).toBe(true)
  })
})
