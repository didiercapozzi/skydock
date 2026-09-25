// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bringBackFromBin, listBin } from '../src/bin'
import { computeFileId } from '../src/fileId'
import type { Manifest } from '../src/types'

/* The bin, looked into and brought back from (RULES, Putting files in the bin). Nothing is ever
   deleted from it here: a file brought back leaves it for the originals, and everything else stays
   exactly where it was put. */

let out = ''
let trash = ''

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-bin-'))
  trash = path.join(out, '.trash')
})

afterEach(() => {
  fs.rmSync(out, { recursive: true, force: true })
})

/* 12 September 2026, 10:00 local: the day a file is put back under, when it says nothing else */
const SHOT = new Date(2026, 8, 12, 10, 0, 0)

const putAside = (folder: string, within: string, bytes = within) => {
  const at = path.join(trash, folder, within)
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.writeFileSync(at, bytes)
  fs.utimesSync(at, SHOT, SHOT)
  return at
}

const empty = (): Manifest => ({ version: 2, createdAt: '2026-09-12', files: [], groups: [] })

describe('what the bin holds', () => {
  it('is each time something was put aside, the latest first, saying from where', () => {
    putAside('unsorted-2026-09-20T09-00-00-000Z', '2026-09-12/GX010001.MP4')
    putAside('camera-OsmoNano-2026-09-24T12-30-05-123Z', 'DCIM/100MEDIA/DJI_0001.MP4')

    const batches = listBin(trash)

    expect(batches.map((b) => [b.from, b.camera, b.files.map((f) => f.name)])).toEqual([
      ['camera', 'OsmoNano', ['DJI_0001.MP4']],
      ['fresh', undefined, ['GX010001.MP4']]
    ])
    expect(batches[0]?.at).toBe(Date.UTC(2026, 8, 24, 12, 30, 5) / 1000)
  })

  it('lists only pictures and films, and nothing for a bin never used', () => {
    putAside('unsorted-2026-09-20T09-00-00-000Z', 'notes.txt')
    expect(listBin(trash)).toEqual([])
    expect(listBin(path.join(out, 'nowhere'))).toEqual([])
  })
})

describe('a file brought back from the bin', () => {
  it('goes into the originals, under the day it was shot, and leaves the bin', async () => {
    const binned = putAside('unsorted-2026-09-20T09-00-00-000Z', '2026-09-12/GX010001.MP4')

    const result = await bringBackFromBin({
      paths: [binned],
      manifest: empty(),
      outputDir: out,
      trashDir: trash
    })

    expect(result).toEqual({ back: ['GX010001.MP4'], kept: [] })
    expect(fs.existsSync(binned)).toBe(false)
    expect(fs.existsSync(path.join(out, 'original_files', '2026-09-12', 'GX010001.MP4'))).toBe(true)
  })

  it('never takes the place of a file of the same name', async () => {
    fs.mkdirSync(path.join(out, 'original_files', '2026-09-12'), { recursive: true })
    fs.writeFileSync(path.join(out, 'original_files', '2026-09-12', 'GX010001.MP4'), 'another')
    const binned = putAside('unsorted-2026-09-20T09-00-00-000Z', '2026-09-12/GX010001.MP4')

    await bringBackFromBin({ paths: [binned], manifest: empty(), outputDir: out, trashDir: trash })

    expect(
      fs.readFileSync(path.join(out, 'original_files', '2026-09-12', 'GX010001.MP4'), 'utf-8')
    ).toBe('another')
    expect(fs.existsSync(path.join(out, 'original_files', '2026-09-12', 'GX010001_2.MP4'))).toBe(
      true
    )
  })

  it('stays in the bin when its footage is on the board already', async () => {
    const binned = putAside('unsorted-2026-09-20T09-00-00-000Z', '2026-09-12/GX010001.MP4')
    const manifest = empty()
    manifest.files.push({
      id: await computeFileId(binned),
      path: '/o/x.MP4',
      filename: 'x.MP4',
      size: 1,
      mtime: 1
    })

    const result = await bringBackFromBin({
      paths: [binned],
      manifest,
      outputDir: out,
      trashDir: trash
    })

    expect(result).toEqual({ back: [], kept: ['GX010001.MP4'] })
    expect(fs.existsSync(binned)).toBe(true)
  })

  it('is only ever a file in the bin', async () => {
    const elsewhere = path.join(out, 'original_files', 'x.MP4')
    fs.mkdirSync(path.dirname(elsewhere), { recursive: true })
    fs.writeFileSync(elsewhere, 'x')
    fs.mkdirSync(trash, { recursive: true })

    await expect(
      bringBackFromBin({ paths: [elsewhere], manifest: empty(), outputDir: out, trashDir: trash })
    ).rejects.toThrow(/not in the bin/)
    expect(fs.existsSync(elsewhere)).toBe(true)
  })
})
