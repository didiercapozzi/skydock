// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { bringBack } from '../src/bringBack'
import { computeFileId } from '../src/fileId'
import type { NasSession } from '../src/nas'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir } from './fixtures'

/* A file freed from this machine is on the storage alone, and nothing brings it back by itself —
   that is what freeing means. Asked for, it is fetched from where its upload record says it went
   (RULES, Freeing space). */

const session: NasSession = { hostname: 'https://nas.local:5001', username: 'u', sessionId: 'sid' }

let dir: string
let held: Buffer

const entryOf = (id: string, over: Partial<ManifestFile> = {}): ManifestFile => ({
  path: path.join(dir, 'original_files', '2026-09-20', 'DJI_0088.MP4'),
  size: 1000,
  mtime: 1_700_000_000,
  filename: 'DJI_0088.MP4',
  id,
  freed: true,
  cropStart: 37,
  cropEnd: 112,
  uploaded: {
    remotePath: '/home/Photos/Skydive/Yverdon/yverdon_20260920_100250.mp4',
    md5: 'abc',
    size: 400,
    localPath: path.join(dir, 'processed', 'yverdon', 'yverdon_20260920_100250.mp4'),
    at: 1_700_000_200
  },
  ...over
})

const manifestOf = (file: ManifestFile): Manifest => ({
  version: 1,
  createdAt: '2026-09-20',
  files: [file],
  groups: [
    {
      id: 'g1',
      label: 'Jump 1',
      day: '20.09.2026',
      destination: 'yverdon',
      freed: { at: 1, bytes: 1000 },
      files: [file]
    }
  ]
})

/* a storage that hands over the bytes it holds */
const storageHolds = (bytes: Buffer) => {
  held = bytes
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob([new Uint8Array(held)]).stream()))
  )
}

beforeEach(() => {
  dir = createTmpDir('skydock-bringback-')
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('a file fetched back off the storage', () => {
  /* a tandem's originals go up as themselves, so what comes back is the original, whole */
  it('is the original again when the storage held the original', async () => {
    const original = Buffer.from('the whole clip as it was shot')
    storageHolds(original)
    const id = await computeFileId(
      (() => {
        const probe = path.join(dir, 'probe')
        fs.writeFileSync(probe, original)
        return probe
      })()
    )
    const manifest = manifestOf(entryOf(id))

    const back = await bringBack({ manifest, session, fileId: id })

    expect(back).toMatchObject({ filename: 'DJI_0088.MP4', original: true })
    expect(fs.existsSync(manifest.files[0]!.path)).toBe(true)
    expect(manifest.files[0]!.freed).toBeUndefined()
    /* everything decided about it still applies: it is that same file */
    expect(manifest.files[0]!.cropStart).toBe(37)
    expect(manifest.groups[0]!.freed).toBeUndefined()
  })

  /* a dropzone never sends originals: what went up is the copy that was delivered, already cut */
  it('is the delivered copy when that is what the storage held, with its trim cleared', async () => {
    storageHolds(Buffer.from('the delivered copy, already trimmed'))
    const manifest = manifestOf(entryOf('b699e6083df5095a'))

    const back = await bringBack({ manifest, session, fileId: 'b699e6083df5095a' })

    expect(back.original).toBe(false)
    const after = manifest.files[0]!
    expect(after.cropStart).toBeUndefined()
    expect(after.cropEnd).toBeUndefined()
    expect(after.freed).toBeUndefined()
    /* it is the file that is there now, by what it contains */
    expect(after.id).not.toBe('b699e6083df5095a')
    expect(manifest.groups[0]!.files[0]!.id).toBe(after.id)
  })

  it('says so rather than fetching when the file is already on this machine', async () => {
    storageHolds(Buffer.from('anything'))
    const manifest = manifestOf(entryOf('id-a'))
    fs.mkdirSync(path.dirname(manifest.files[0]!.path), { recursive: true })
    fs.writeFileSync(manifest.files[0]!.path, 'here already')

    await expect(bringBack({ manifest, session, fileId: 'id-a' })).rejects.toThrow(
      /already on this machine/
    )
  })

  it('says so rather than fetching when it was never uploaded', async () => {
    storageHolds(Buffer.from('anything'))
    const manifest = manifestOf(entryOf('id-a', { uploaded: undefined }))

    await expect(bringBack({ manifest, session, fileId: 'id-a' })).rejects.toThrow(/never uploaded/)
  })
})
