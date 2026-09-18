// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { trashUnsorted } from '../src/trashUnsorted'
import type { Manifest, ManifestFile } from '../src/types'

/* Unsorted files nobody wants go to the bin: off the board, out of the originals, never erased. */

let out = ''

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-trash-'))
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
  it('moves the file out of the originals into the bin, keeping its day folder', () => {
    const a = original('a')
    const manifest = board([a])

    const { bin } = trashUnsorted(manifest, new Set(['a']), out)

    expect(fs.existsSync(a.path)).toBe(false)
    expect(fs.readFileSync(path.join(out, bin, '2026-09-12', 'a.MP4'), 'utf-8')).toBe('a')
  })

  it('takes the file off the board, and a jump left with nothing goes with it', () => {
    const a = original('a')
    const b = original('b')
    const manifest = board(
      [a, b],
      [
        { id: 'g1', label: 'jump', day: '12.09.2026', files: [a] },
        { id: 'g2', label: 'jump', day: '12.09.2026', files: [b] }
      ]
    )

    trashUnsorted(manifest, new Set(['a']), out)

    expect(manifest.files.map((f) => f.id)).toEqual(['b'])
    expect(manifest.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('says how many files and how much went in', () => {
    const manifest = board([original('a'), original('b')])

    expect(trashUnsorted(manifest, new Set(['a', 'b']), out)).toMatchObject({
      count: 2,
      bytes: 20
    })
  })

  /* filed is somebody's: sending it back to Unsorted is the step that says it no longer is */
  it('refuses a file in a jump that has been filed, and moves nothing', () => {
    const a = original('a')
    const manifest = board(
      [a],
      [{ id: 'g1', label: 'jump', day: '12.09.2026', destination: 'Yverdon', files: [a] }]
    )

    expect(() => trashUnsorted(manifest, new Set(['a']), out)).toThrow(/Fresh files/)
    expect(fs.existsSync(a.path)).toBe(true)
    expect(manifest.files).toHaveLength(1)
  })

  it('refuses a loose file filed to a place', () => {
    const a = original('a', { destination: 'Yverdon' })

    expect(() => trashUnsorted(board([a]), new Set(['a']), out)).toThrow(/Fresh files/)
    expect(fs.existsSync(a.path)).toBe(true)
  })

  it('deletes the copy and the proxy made from it, which have nothing left to come from', () => {
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

    trashUnsorted(manifest, new Set(['a']), out)

    expect(fs.existsSync(copy)).toBe(false)
    expect(fs.existsSync(proxy)).toBe(false)
  })

  it('takes a file already gone from the disk off the board without complaint', () => {
    const a = original('a')
    fs.rmSync(a.path)
    const manifest = board([a])

    trashUnsorted(manifest, new Set(['a']), out)

    expect(manifest.files).toHaveLength(0)
  })
})
