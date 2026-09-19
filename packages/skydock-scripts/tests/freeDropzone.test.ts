// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { freeDropzone } from '../src/freeDropzone'
import type { NasSession } from '../src/nas'
import { resolveUploadTargets } from '../src/upload'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, nasStubs, stubFetch } from './fixtures'

/* Freeing a dropzone (RULES, Freeing space): what of it went up is its copies, so once each copy is
   hashed here and by the storage and both match what was sent, the copy, its original and its
   working copies are deleted from this machine. A jump is freed whole or not at all; one with a file
   still to upload stays. Any doubt, and nothing is deleted. */

const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

const session: NasSession = {
  hostname: 'http://nas.test',
  username: 'u',
  sessionId: 'sid',
  defaultFolder: '/SkyDock',
  backupFolder: '/Backup'
}

const DZ = 'Yverdon'
const AT = 1_785_000_000

let outputDir: string

const setup = () => {
  const originals = path.join(outputDir, 'original_files', '2026-08-01')
  const folder = path.join(outputDir, 'processed', DZ)
  fs.mkdirSync(originals, { recursive: true })
  fs.mkdirSync(folder, { recursive: true })
  const onStorage: Record<string, string> = {}

  /* a file off the camera, its copy in the dropzone's folder, and — when `up` — that copy sent */
  const file = (
    id: string,
    fill: number,
    { up = true, trimmed = false, loose = false } = {}
  ): ManifestFile => {
    const src = path.join(originals, `${id}.MP4`)
    const out = path.join(folder, `yverdon_${id}.mp4`)
    fs.writeFileSync(src, Buffer.alloc(400, fill))
    fs.writeFileSync(out, Buffer.alloc(300, fill))
    const crop = trimmed ? { cropStart: 1, cropEnd: 2 } : {}
    const remotePath = `/SkyDock/${DZ}/yverdon_${id}.mp4`
    if (up) onStorage[remotePath] = md5(out)
    return {
      id,
      path: src,
      filename: path.basename(src),
      size: 400,
      mtime: AT,
      ...crop,
      ...(loose ? { destination: DZ } : {}),
      processed: { path: out, size: 300, at: 1, source: { id, size: 400, mtime: AT, ...crop } },
      ...(up ? { uploaded: { localPath: out, remotePath, md5: md5(out), size: 300, at: 1 } } : {})
    }
  }
  const upJump = [file('a', 1), file('b', 2, { trimmed: true })]
  const halfJump = [file('c', 3), file('d', 4, { up: false })]
  const lone = file('e', 5, { loose: true })
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files: [...upJump, ...halfJump, lone],
    groups: [
      { id: 'up', label: 'up', day: '01.08.2026', destination: DZ, processed: true, files: upJump },
      { id: 'half', label: 'half', day: '01.08.2026', destination: DZ, files: halfJump }
    ],
    destinations: [{ name: DZ, path: `/SkyDock/${DZ}` }]
  }
  return { manifest, originals, folder, onStorage }
}

const withStorage = (hashes: Record<string, string>) => {
  const stub = nasStubs({ md5: hashes })
  stubFetch((url) => stub(url) ?? new Response('{}'))
}

const free = (manifest: Manifest) => freeDropzone({ manifest, outputDir, destination: DZ, session })

beforeEach(() => {
  outputDir = createTmpDir('skydock-free-dz-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('freeing a dropzone', () => {
  it('deletes each jump and loose file on the storage — the original, trimmed or not, and its copy', async () => {
    const { manifest, originals, folder, onStorage } = setup()
    withStorage(onStorage)

    const result = await free(manifest)

    expect(fs.readdirSync(originals).sort()).toEqual(['c.MP4', 'd.MP4'])
    expect(fs.readdirSync(folder).sort()).toEqual(['yverdon_c.mp4', 'yverdon_d.mp4'])
    expect(result.bytes).toBe(3 * (400 + 300))
  })

  it('leaves whole a jump with a file still to upload', async () => {
    const { manifest, onStorage } = setup()
    withStorage(onStorage)

    const result = await free(manifest)

    expect(result.groupIds).toEqual(['up'])
    expect(result.kept).toBe(1)
    expect(manifest.groups.find((g) => g.id === 'half')?.freed).toBeUndefined()
    expect(manifest.groups.find((g) => g.id === 'half')?.files.some((f) => f.freed)).toBe(false)
  })

  it('remembers what lives on the storage only', async () => {
    const { manifest, onStorage } = setup()
    withStorage(onStorage)

    await free(manifest)

    expect(manifest.groups.find((g) => g.id === 'up')?.freed).toBeDefined()
    expect(manifest.files.filter((f) => f.freed).map((f) => f.id)).toEqual(['a', 'b', 'e'])
    /* the record of what was sent where is kept */
    expect(manifest.files.find((f) => f.id === 'a')?.uploaded?.remotePath).toBe(
      `/SkyDock/${DZ}/yverdon_a.mp4`
    )
  })

  it('deletes nothing when the storage holds something else, and names it', async () => {
    const { manifest, originals, onStorage } = setup()
    withStorage({ ...onStorage, [`/SkyDock/${DZ}/yverdon_b.mp4`]: 'not-it' })

    await expect(free(manifest)).rejects.toThrow(
      /nothing was deleted: yverdon_b\.mp4 on the storage is not the file that was sent/
    )
    expect(fs.readdirSync(originals)).toHaveLength(5)
  })

  it('deletes nothing when a copy changed here since it went up', async () => {
    const { manifest, originals, folder, onStorage } = setup()
    withStorage(onStorage)
    fs.writeFileSync(path.join(folder, 'yverdon_a.mp4'), Buffer.alloc(300, 9))

    await expect(free(manifest)).rejects.toThrow(
      /yverdon_a\.mp4 changed here since it was uploaded/
    )
    expect(fs.readdirSync(originals)).toHaveLength(5)
  })

  it('says there is nothing to free before anything went up', async () => {
    const { manifest } = setup()
    for (const f of manifest.files) delete f.uploaded
    await expect(free(manifest)).rejects.toThrow(/Nothing of Yverdon is on the storage yet/)
  })

  it('a freed jump is not uploaded again', async () => {
    const { manifest, onStorage } = setup()
    withStorage(onStorage)
    await free(manifest)

    const targets = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: null,
      scope: { destination: DZ }
    })
    expect(targets.flatMap((t) => t.groupIds)).toEqual(['half'])
  })
})
