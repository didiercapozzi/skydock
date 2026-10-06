// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { trashUnsorted } from '../src/trashUnsorted'
import type { Manifest, ManifestFile } from '../src/types'

/* Unsorted files nobody wants go to the bin: off the board, out of the originals, never erased. The
   bin is a folder of its own, apart from the output folder. */

let out = ''
let trash = ''

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-trash-'))
  trash = path.join(out, 'bin')
})

afterEach(() => {
  fs.rmSync(out, { recursive: true, force: true })
})

const original = (id: string, extra: Partial<ManifestFile> = {}): ManifestFile => {
  const p = path.join(out, 'original_files', '2026-09-12', `${id}.MP4`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, id)
  return { id, path: p, filename: `${id}.MP4`, size: 10, mtime: 1_785_000_000, ...extra }
}

const board = (files: ManifestFile[], groups: Manifest['groups'] = []): Manifest => ({
  version: 1,
  createdAt: 'x',
  files,
  groups
})

describe('putting unsorted files in the bin', () => {
  it('moves the file out of the originals into the bin, keeping its day folder', async () => {
    const a = original('a')
    const manifest = board([a])

    const { bin } = await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(fs.existsSync(a.path)).toBe(false)
    expect(bin.startsWith(trash)).toBe(true)
    expect(fs.readFileSync(path.join(bin, '2026-09-12', 'a.MP4'), 'utf-8')).toBe('a')
  })

  it('takes the file off the board, and a jump left with nothing goes with it', async () => {
    const a = original('a')
    const b = original('b')
    const manifest = board(
      [a, b],
      [
        { id: 'g1', label: 'jump', day: '12.09.2026', files: [a] },
        { id: 'g2', label: 'jump', day: '12.09.2026', files: [b] }
      ]
    )

    await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(manifest.files.map((f) => f.id)).toEqual(['b'])
    expect(manifest.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('says how many files and how much went in', async () => {
    const manifest = board([original('a'), original('b')])

    expect(await trashUnsorted(manifest, new Set(['a', 'b']), out, trash)).toMatchObject({
      count: 2,
      bytes: 20
    })
  })

  /* filed is somebody's: sending it back to Unsorted is the step that says it no longer is */
  /* out of a montage, when that is the way out chosen for them (RULES, Montages) */
  it('takes a montage’s file into a folder of the bin named after the montage', async () => {
    const a = original('a')
    const b = original('b')
    const manifest = board(
      [a, b],
      [
        {
          id: 'm1',
          label: 'm1',
          day: '12.09.2026',
          montageJump: true,
          passenger: { firstname: 'Boogie', lastname: '2026' },
          files: [a, b]
        }
      ]
    )

    const { bin } = await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(path.basename(bin)).toMatch(/^montage-boogie-2026-/)
    expect(fs.existsSync(path.join(bin, '2026-09-12', 'a.MP4'))).toBe(true)
    expect(manifest.groups[0]?.files.map((f) => f.id)).toEqual(['b'])
  })

  it('refuses a copy in a montage, whose original stays where it is', async () => {
    const a = original('a')
    const copy = { ...a, id: 'a~1', copyOf: 'a' }
    const manifest = board(
      [a, copy],
      [
        {
          id: 'm1',
          label: 'm1',
          day: '12.09.2026',
          montageJump: true,
          passenger: { firstname: 'Boogie', lastname: '2026' },
          files: [copy]
        }
      ]
    )

    await expect(trashUnsorted(manifest, new Set(['a~1']), out, trash)).rejects.toThrow(/copy/)
    expect(fs.existsSync(a.path)).toBe(true)
  })

  /* a copy is a jump's hold on its original: while a jump holds one the original stays, and once no jump
     does — the jump was deleted — the copy is nobody's and goes with it */
  it('refuses a file a jump still holds a copy of', async () => {
    const a = original('a')
    const copy = { ...a, id: 'a~1', copyOf: 'a' }
    const manifest = board([a, copy], [{ id: 'm1', label: 'm1', day: '12.09.2026', files: [copy] }])

    await expect(trashUnsorted(manifest, new Set(['a']), out, trash)).rejects.toThrow(
      /copied into a jump/
    )
    expect(fs.existsSync(a.path)).toBe(true)
  })

  it('takes a file whose jump was uploaded, leaving the jump’s copy as a file given back', async () => {
    const a = original('a')
    const copy = { ...a, id: 'a~1', copyOf: 'a' }
    const manifest = board(
      [a, copy],
      [
        {
          id: 'm1',
          label: 'm1',
          day: '12.09.2026',
          montageJump: true,
          passenger: { firstname: 'Boogie', lastname: '2026' },
          uploaded: { at: 1 },
          files: [copy]
        }
      ]
    )

    await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(fs.existsSync(a.path)).toBe(false)
    expect(manifest.files.map((f) => f.id)).toEqual(['a~1'])
    expect(manifest.groups[0]?.files[0]).toMatchObject({ id: 'a~1', freed: true })
  })

  it('takes a file whose copy no jump holds any more, and the copy with it', async () => {
    const a = original('a')
    const copy = { ...a, id: 'a~1', copyOf: 'a' }
    const manifest = board([a, copy], [])

    await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(manifest.files).toEqual([])
    expect(fs.existsSync(a.path)).toBe(false)
  })

  /* from a dropzone too, once that is the way out chosen for them (RULES, Putting files in the bin) */
  it('takes a dropzone’s file into a folder of the bin named after the dropzone', async () => {
    const a = original('a')
    const b = original('b', { destination: 'Yverdon' })
    const manifest = board(
      [a, b],
      [{ id: 'g1', label: 'jump', day: '12.09.2026', destination: 'Yverdon', files: [a] }]
    )

    const { bin } = await trashUnsorted(manifest, new Set(['a', 'b']), out, trash)

    expect(path.basename(bin)).toMatch(/^dropzone-yverdon-/)
    expect(manifest.files).toEqual([])
  })

  /* the bin moves only what is on this machine: the storage keeps what it holds, so a file that went up can go */
  it('takes a file already on the storage too, whether it is still here or only there', async () => {
    const here = original('a', {
      destination: 'Yverdon',
      uploaded: { remotePath: '/nas/a.mp4', md5: 'x', size: 10, localPath: '/o/a.mp4', at: 1 }
    })
    const only = {
      ...original('b', { destination: 'Yverdon' }),
      freed: true as const,
      uploaded: { remotePath: '/nas/b.mp4', md5: 'y', size: 10, localPath: '/o/b.mp4', at: 1 }
    }
    fs.rmSync(only.path)
    const manifest = board([here, only])

    const { count } = await trashUnsorted(manifest, new Set(['a', 'b']), out, trash)

    expect(count).toBe(2)
    expect(manifest.files).toEqual([])
    expect(fs.existsSync(here.path)).toBe(false)
  })

  it('deletes the copy and the proxy made from it, which have nothing left to come from', async () => {
    const copy = path.join(out, 'processed', 'a.mp4')
    const proxy = path.join(out, 'proxies', 'a.mp4')
    for (const p of [copy, proxy]) {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, 'x')
    }
    const manifest = board([
      original('a', {
        processed: { path: copy, size: 1, at: 1, source: { id: 'a', size: 10, mtime: 1 } }
      })
    ])

    await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(fs.existsSync(copy)).toBe(false)
    expect(fs.existsSync(proxy)).toBe(false)
  })

  it('takes a file already gone from the disk off the board without complaint', async () => {
    const a = original('a')
    fs.rmSync(a.path)
    const manifest = board([a])

    await trashUnsorted(manifest, new Set(['a']), out, trash)

    expect(manifest.files).toHaveLength(0)
  })
})
