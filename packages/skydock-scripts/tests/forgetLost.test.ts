// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { forgetLostFiles } from '../src/forgetLost'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir } from './fixtures'

/* Footage that is nowhere is not listed: a file freed from this machine and since deleted on the
   storage has nothing left anywhere, so the app forgets it rather than showing a row that cannot be
   opened, uploaded or freed (RULES, File status). */

let dir: string

const onDisk = (name: string) => {
  const full = path.join(dir, name)
  fs.writeFileSync(full, 'x')
  return full
}

const file = (over: Partial<ManifestFile> = {}): ManifestFile => ({
  path: path.join(dir, 'never-written.mp4'),
  size: 100,
  mtime: 1_700_000_000,
  filename: 'a.mp4',
  id: 'id-a',
  destination: 'Yverdon',
  freed: true,
  processed: {
    path: path.join(dir, 'no-copy.mp4'),
    size: 90,
    at: 1_700_000_100,
    source: { id: 'id-a', size: 100, mtime: 1_700_000_000, cropStart: null, cropEnd: null }
  },
  uploaded: {
    remotePath: '/home/Yverdon/a.mp4',
    md5: 'abc',
    size: 90,
    localPath: path.join(dir, 'no-copy.mp4'),
    at: 1_700_000_200
  },
  ...over
})

const manifestOf = (files: ManifestFile[], groups: ManifestGroup[] = []): Manifest => ({
  version: 1,
  createdAt: '2026-09-20',
  files,
  groups
})

const jump = (files: ManifestFile[], over: Partial<ManifestGroup> = {}): ManifestGroup => ({
  id: 'jump-1',
  label: 'Jump 1',
  day: '2026-09-20',
  destination: 'Yverdon',
  files,
  ...over
})

/* the folder answered, and it does not hold it */
const lostOnStorage = { dirs: ['/home/Yverdon'], sizes: {} }

beforeEach(() => {
  dir = createTmpDir('skydock-forget-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('footage that is nowhere', () => {
  it('is forgotten when it was freed here and the storage no longer holds it', () => {
    const manifest = manifestOf([file()])

    expect(forgetLostFiles(manifest, lostOnStorage)).toEqual(['a.mp4'])
    expect(manifest.files).toEqual([])
  })

  it('takes the jump it was the last of with it', () => {
    const lost = file()
    const manifest = manifestOf([lost], [jump([lost])])

    forgetLostFiles(manifest, lostOnStorage)

    expect(manifest.groups).toEqual([])
  })

  it('leaves the jump standing while something of it is left', () => {
    const lost = file()
    const kept = file({ id: 'id-b', filename: 'b.mp4', path: onDisk('b.mp4'), freed: false })
    const manifest = manifestOf([lost, kept], [jump([lost, kept])])

    forgetLostFiles(manifest, lostOnStorage)

    expect(manifest.files.map((f) => f.id)).toEqual(['id-b'])
    expect(manifest.groups[0]!.files.map((f) => f.id)).toEqual(['id-b'])
  })

  /* the film outlives the rushes it was cut from: a montage whose delivery is still on the storage
     keeps its folder even once every rush of it has gone */
  it('keeps a montage whose delivered film the storage still holds', () => {
    const lost = file()
    const manifest = manifestOf(
      [lost],
      [
        jump([lost], {
          id: 'montage-1',
          montageJump: true,
          uploaded: {
            at: 1_700_000_300,
            film: {
              remotePath: '/home/Tandems/Ana/film.mp4',
              md5: 'f',
              size: 10,
              localPath: '/o/processed/Tandems/Ana/ana.mp4',
              at: 1_700_000_300
            }
          }
        })
      ]
    )

    forgetLostFiles(manifest, {
      dirs: ['/home/Yverdon', '/home/Tandems/Ana'],
      sizes: { '/home/Tandems/Ana/film.mp4': 10 }
    })

    expect(manifest.groups).toHaveLength(1)
    expect(manifest.groups[0]!.files).toEqual([])
  })
})

/* Only what the storage answered about, and only what the disk confirms is not here: everything
   else is no evidence at all, and nothing is forgotten on no evidence. */
describe('what is left exactly as it was', () => {
  it('a file whose folder the storage never answered about', () => {
    const manifest = manifestOf([file()])

    expect(forgetLostFiles(manifest, { dirs: ['/home/Colombier'], sizes: {} })).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })

  it('a file checked against no listing at all', () => {
    const manifest = manifestOf([file()])

    expect(forgetLostFiles(manifest, null)).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })

  it('a file the storage holds at another size — something is there', () => {
    const manifest = manifestOf([file()])

    expect(
      forgetLostFiles(manifest, { dirs: ['/home/Yverdon'], sizes: { '/home/Yverdon/a.mp4': 5 } })
    ).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })

  it('a freed file whose original another jump kept on this machine', () => {
    const manifest = manifestOf([file({ path: onDisk('shared.mp4') })])

    expect(forgetLostFiles(manifest, lostOnStorage)).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })

  it('a file whose processed copy is still on this machine', () => {
    const copy = onDisk('copy.mp4')
    const kept = file()
    kept.processed!.path = copy
    const manifest = manifestOf([kept])

    expect(forgetLostFiles(manifest, lostOnStorage)).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })

  it('a file that was never freed, whatever the storage says', () => {
    const manifest = manifestOf([file({ freed: false })])

    expect(forgetLostFiles(manifest, lostOnStorage)).toEqual([])
    expect(manifest.files).toHaveLength(1)
  })
})
