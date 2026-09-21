// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeArchive } from '../src/archive'
import { freeTandem } from '../src/freeTandem'
import { loadManifest, saveManifest } from '../src/manifest'
import type { NasSession } from '../src/nas'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, nasStubs, stubFetch } from './fixtures'

/* Freeing a tandem deletes gigabytes that exist nowhere else on this machine, so it only ever
   happens on proof: every file that went up hashed here and hashed by the storage, both matching
   what was sent, and the originals shown to be exactly what the backup holds. Any doubt, and
   nothing at all is deleted. */

const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

const session: NasSession = {
  hostname: 'http://nas.test',
  username: 'u',
  sessionId: 'sid',
  defaultFolder: '/SkyDock',
  backupFolder: '/Backup'
}

const PAX = '/SkyDock/Tandems/Luc Favre'
const AT = 1_785_000_000

let outputDir: string

/* `projectInBackup`: the editing project was chosen to go into the backup zip with the originals */
const setup = async ({ projectInBackup = false } = {}) => {
  const originals = path.join(outputDir, 'original_files', '2026-08-01')
  const folder = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
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
        destination: 'Tandems',
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
    destinations: [{ name: 'Tandems' }]
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

const free = (manifest: Manifest) => freeTandem({ manifest, outputDir, groupId: 'g1', session })

beforeEach(() => {
  outputDir = createTmpDir('skydock-free-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('freeing an uploaded tandem', () => {
  it('deletes the originals and everything made from them, and keeps the project', async () => {
    const { manifest, folder, originals, onStorage } = await setup()
    withStorage(onStorage)

    const result = await free(manifest)

    expect(fs.readdirSync(folder)).toEqual(['luc.kdenlive'])
    expect(fs.readdirSync(originals)).toEqual([])
    expect(result.bytes).toBeGreaterThan(1000)
  })

  /* the project in the backup is a second copy of the edit, not a stranger in the zip */
  it('frees a tandem whose backup zip also holds the editing project', async () => {
    const { manifest, folder, onStorage } = await setup({ projectInBackup: true })
    withStorage(onStorage)

    await free(manifest)

    expect(fs.readdirSync(folder)).toEqual(['luc.kdenlive'])
  })

  /* a clip copied into another jump is not this tandem's alone to delete */
  it('leaves on the disk an original another jump still holds a copy of', async () => {
    const { manifest, originals, onStorage } = await setup()
    withStorage(onStorage)
    const shared = manifest.files[0]!
    const copy = { ...shared, id: `${shared.id}~1`, copyOf: shared.id, processed: undefined }
    /* a list of its own: the scene hands the registry and the tandem the same one */
    manifest.files = [...manifest.files, copy]
    manifest.groups.push({ id: 'g2', label: 'g2', day: '01.08.2026', files: [copy] })

    await free(manifest)

    expect(fs.readdirSync(originals)).toEqual(['GX01.MP4'])
    /* and it is not said to be on the storage only, since it is on the disk: a file the board calls
       gone is one nothing can be done with — not copied into a jump, not moved, not dropped in again */
    expect(manifest.files.find((f) => f.id === shared.id)?.freed).toBeUndefined()
    expect(manifest.groups[0]?.files.find((f) => f.id === shared.id)?.freed).toBeUndefined()
    /* the rest of the tandem went, and says so */
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

  /* The edit was saved again after the upload, so the backup holds an older one. Freeing keeps the
     project here, so nothing is lost by it — what freeing has to prove is the originals. */
  it('still frees when the project was saved again after it went into the backup', async () => {
    const { manifest, folder, onStorage } = await setup({ projectInBackup: true })
    withStorage(onStorage)
    const later = new Date(Date.now() + 60_000)
    fs.utimesSync(path.join(folder, 'luc.kdenlive'), later, later)

    await free(manifest)

    expect(fs.readdirSync(folder)).toEqual(['luc.kdenlive'])
  })

  it('refuses a tandem that was never uploaded', async () => {
    const { manifest } = await setup()
    delete manifest.groups[0]!.uploaded
    await expect(free(manifest)).rejects.toThrow(/Upload this tandem first/)
  })

  it('keeps a freed tandem through a later scan, rather than dropping its missing files', async () => {
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
