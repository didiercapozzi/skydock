// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { importFile } from '../src/importFile'
import { loadManifest, saveManifest } from '../src/manifest'
import type { ImportTarget } from '../src/importFile'
import type { Manifest } from '../src/types'
import { createTmpDir } from './fixtures'

/* A file dragged in from the computer joins the board the way a camera's file does: copied into
   original_files under the day it was taken, keeping its name, and written into the registry —
   into the tandem, the dropzone or the sorting area it was dropped on. */

let outputDir: string

/* 1 August 2026, 11:30 local — a file with no EXIF is dated by its own modification time */
const TAKEN = new Date(2026, 7, 1, 11, 30, 0).getTime()

const manifestPath = () => path.join(outputDir, 'manifest.json')

const setup = (extra: Partial<Manifest> = {}) => {
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files: [],
    groups: [
      {
        id: 'g1',
        label: 'jump',
        day: '01.08.2026',
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files: []
      }
    ],
    destinations: [{ name: 'Tandems' }, { name: 'Yverdon' }],
    ...extra
  }
  saveManifest(manifestPath(), manifest)
}

const add = (filename: string, bytes: string, target: ImportTarget) =>
  importFile({
    outputDir,
    filename,
    lastModified: TAKEN,
    body: Readable.from([Buffer.from(bytes)]),
    target
  })

beforeEach(() => {
  outputDir = createTmpDir('skydock-import-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('adding a file from the computer', () => {
  it('copies it into the day it was taken, under its own name, and into the tandem', async () => {
    setup()
    await add('IMG_0042.JPG', 'photo', { kind: 'group', groupId: 'g1' })

    const dest = path.join(outputDir, 'original_files', '2026-08-01', 'IMG_0042.JPG')
    expect(fs.readFileSync(dest, 'utf-8')).toBe('photo')
    const after = loadManifest(manifestPath())!
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['IMG_0042.JPG'])
    /* something new in it has not been processed yet */
    expect(after.groups[0]?.processed).toBeUndefined()
    expect(after.files[0]).toMatchObject({ path: dest, size: 5 })
  })

  it('files it under a dropzone as a lone file', async () => {
    setup()
    await add('clip.mp4', 'video', { kind: 'destination', name: 'Yverdon' })
    const after = loadManifest(manifestPath())!
    expect(after.files[0]?.destination).toBe('Yverdon')
    expect(after.groups[0]?.files).toEqual([])
  })

  it('leaves it loose in the sorting area when dropped there', async () => {
    setup()
    await add('clip.mp4', 'video', { kind: 'sort' })
    const after = loadManifest(manifestPath())!
    expect(after.files[0]?.destination).toBeUndefined()
    expect(after.groups[0]?.files).toEqual([])
  })

  it('keeps both when two different files share a name', async () => {
    setup()
    await add('clip.mp4', 'one', { kind: 'sort' })
    await add('clip.mp4', 'two', { kind: 'sort' })
    expect(fs.readdirSync(path.join(outputDir, 'original_files', '2026-08-01')).sort()).toEqual([
      'clip.mp4',
      'clip_2.mp4'
    ])
  })

  /* a file is in one place at a time: dropped in again, it goes where it was dropped this time */
  it('moves a file already on the board to where it is dropped again, whatever it is called', async () => {
    setup()
    await add('clip.mp4', 'same', { kind: 'sort' })
    const again = await add('copy of clip.mp4', 'same', { kind: 'group', groupId: 'g1' })

    expect(again).toMatchObject({ outcome: 'moved', from: 'Unsorted jumps' })
    const after = loadManifest(manifestPath())!
    expect(after.files).toHaveLength(1)
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['clip.mp4'])
    /* nothing is left behind of the arrival, not even the folder it arrived in */
    expect(fs.existsSync(path.join(outputDir, '.incoming'))).toBe(false)
  })

  it('says so, and changes nothing, when it is already exactly there', async () => {
    setup()
    await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    const again = await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    expect(again.outcome).toBe('there')
    expect(loadManifest(manifestPath())!.files[0]?.destination).toBe('Yverdon')
  })

  it('takes it out of a tandem into a dropzone, as a drag on the board would', async () => {
    setup()
    await add('clip.mp4', 'same', { kind: 'group', groupId: 'g1' })
    const again = await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    expect(again).toMatchObject({ outcome: 'moved', from: 'Luc Favre' })
    const after = loadManifest(manifestPath())!
    expect(after.files[0]?.destination).toBe('Yverdon')
    /* the tandem it left had nothing else, so it is gone, as after any move */
    expect(after.groups).toHaveLength(0)
  })

  it('leaves it in a tandem that has an edit, and says why', async () => {
    setup()
    await add('clip.mp4', 'same', { kind: 'group', groupId: 'g1' })
    const folder = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'luc.kdenlive'), '<mlt/>')

    const again = await add('clip.mp4', 'same', { kind: 'sort' })
    expect(again).toMatchObject({ outcome: 'kept' })
    expect(loadManifest(manifestPath())!.groups[0]?.files).toHaveLength(1)
  })

  it('takes only a name, never a path, and only videos and photos', async () => {
    setup()
    await add('../../escape/clip.mp4', 'x', { kind: 'sort' })
    expect(fs.existsSync(path.join(outputDir, 'original_files', '2026-08-01', 'clip.mp4'))).toBe(
      true
    )
    await expect(add('notes.txt', 'x', { kind: 'sort' })).rejects.toThrow(/not a video or a photo/)
  })

  it('refuses Tandems itself — a tandem file belongs to a passenger', async () => {
    setup()
    await expect(add('clip.mp4', 'x', { kind: 'destination', name: 'Tandems' })).rejects.toThrow(
      /dropzone, a passenger or the sorting area/
    )
  })

  it('refuses a tandem that has an edit, before writing anything', async () => {
    setup()
    const folder = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'luc.kdenlive'), '<mlt/>')
    await expect(add('clip.mp4', 'x', { kind: 'group', groupId: 'g1' })).rejects.toThrow(/edit/)
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
  })
})
