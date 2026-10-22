// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { importFile } from '../src/importFile'
import { loadManifestAsync, saveManifest } from '../src/manifest'
import type { ImportTarget } from '../src/importFile'
import type { Manifest } from '../src/types'
import { createTmpDir } from './fixtures'

let outputDir: string

const TAKEN = new Date(2026, 7, 1, 11, 30, 0).getTime()

const manifestPath = () => path.join(outputDir, 'manifest.json')

const setup = async (extra: Partial<Manifest> = {}) => {
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files: [],
    groups: [
      {
        id: 'g1',
        label: 'jump',
        day: '01.08.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files: []
      }
    ],
    destinations: [{ name: 'Passengers' }, { name: 'Yverdon' }],
    ...extra
  }
  await saveManifest(manifestPath(), manifest)
}

const twoMontages = () =>
  setup({
    groups: [
      {
        id: 'g1',
        label: 'jump',
        day: '01.08.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files: []
      },
      {
        id: 'g2',
        label: 'jump',
        day: '01.08.2026',
        montageJump: true,
        passenger: { firstname: 'Juliana', lastname: 'Roth' },
        files: []
      }
    ]
  })

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
  it('copies it into the day it was taken, under its own name, and into the montage', async () => {
    await setup()
    await add('IMG_0042.JPG', 'photo', { kind: 'group', groupId: 'g1' })

    const dest = path.join(outputDir, 'original_files', '2026-08-01', 'IMG_0042.JPG')
    expect(fs.readFileSync(dest, 'utf-8')).toBe('photo')
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['IMG_0042.JPG'])
    expect(after.groups[0]?.processed).toBeUndefined()
    expect(after.files[0]).toMatchObject({ path: dest, size: 5 })
  })

  it('stops copying when told to, and leaves no file and no half of one behind', async () => {
    await setup()
    const stopper = new AbortController()
    const never = new Readable({ read() {} })
    never.push(Buffer.from('half of it'))

    const copying = importFile({
      outputDir,
      filename: 'long.mp4',
      lastModified: TAKEN,
      body: never,
      target: { kind: 'sort' },
      signal: stopper.signal
    })
    setTimeout(() => stopper.abort(), 50)

    await expect(copying).rejects.toThrow()
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files).toEqual([])
    expect(fs.existsSync(path.join(outputDir, 'original_files'))).toBe(false)
    expect(fs.existsSync(path.join(outputDir, '.incoming'))).toBe(false)
  })

  it('files it under a dropzone as a lone file', async () => {
    await setup()
    await add('clip.mp4', 'video', { kind: 'destination', name: 'Yverdon' })
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files[0]?.destination).toBe('Yverdon')
    expect(after.groups[0]?.files).toEqual([])
  })

  it('leaves it loose in the sorting area when dropped there', async () => {
    await setup()
    await add('clip.mp4', 'video', { kind: 'sort' })
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files[0]?.destination).toBeUndefined()
    expect(after.groups[0]?.files).toEqual([])
  })

  it('keeps both when two different files share a name', async () => {
    await setup()
    await add('clip.mp4', 'one', { kind: 'sort' })
    await add('clip.mp4', 'two', { kind: 'sort' })
    expect(fs.readdirSync(path.join(outputDir, 'original_files', '2026-08-01')).sort()).toEqual([
      'clip.mp4',
      'clip_2.mp4'
    ])
  })

  it('moves a file already on the board to where it is dropped again, whatever it is called', async () => {
    await setup()
    await add('clip.mp4', 'same', { kind: 'sort' })
    const again = await add('copy of clip.mp4', 'same', { kind: 'group', groupId: 'g1' })

    expect(again).toMatchObject({ outcome: 'moved', from: 'Fresh files' })
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files).toHaveLength(1)
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['clip.mp4'])
    expect(fs.existsSync(path.join(outputDir, '.incoming'))).toBe(false)
  })

  it('puts the bytes back where they were when the file was freed from this machine after its upload', async () => {
    await setup()
    await add('clip.mp4', 'same', { kind: 'sort' })
    const before = (await loadManifestAsync(manifestPath()))!
    const held = before.files[0]!
    fs.rmSync(held.path)
    before.files[0] = {
      ...held,
      freed: true,
      uploaded: { remotePath: '/v/clip.mp4', md5: 'x', size: 4, localPath: held.path, at: 1 }
    }
    await saveManifest(manifestPath(), before)

    const again = await add('clip.mp4', 'same', { kind: 'group', groupId: 'g1' })

    expect(again).toMatchObject({ outcome: 'moved' })
    expect(fs.readFileSync(held.path, 'utf8')).toBe('same')
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files[0]?.freed).toBeUndefined()
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['clip.mp4'])
  })

  it('leaves a montage freed from this machine freed when a file of it is dropped again', async () => {
    await setup()
    await add('clip.mp4', 'same', { kind: 'group', groupId: 'g1' })
    const before = (await loadManifestAsync(manifestPath()))!
    const held = before.files[0]!
    fs.rmSync(held.path)
    const gone = { ...held, freed: true as const }
    before.files[0] = gone
    before.groups[0] = {
      ...before.groups[0]!,
      files: [gone],
      freed: { at: 1, bytes: 4 }
    }
    await saveManifest(manifestPath(), before)

    await add('clip.mp4', 'same', { kind: 'sort' })

    const after = (await loadManifestAsync(manifestPath()))!
    expect(fs.readFileSync(held.path, 'utf8')).toBe('same')
    expect(after.groups.find((g) => g.id === 'g1')?.freed).toEqual({ at: 1, bytes: 4 })
    expect(after.groups.find((g) => g.id === 'g1')?.freedBefore).toBeUndefined()
  })

  it('says so, and changes nothing, when it is already exactly there', async () => {
    await setup()
    await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    const again = await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    expect(again.outcome).toBe('there')
    expect((await loadManifestAsync(manifestPath()))!.files[0]?.destination).toBe('Yverdon')
  })

  it('takes it out of a montage into a dropzone, as a drag on the board would', async () => {
    await setup()
    await add('clip.mp4', 'same', { kind: 'group', groupId: 'g1' })
    const again = await add('clip.mp4', 'same', { kind: 'destination', name: 'Yverdon' })
    expect(again).toMatchObject({ outcome: 'moved', from: 'Luc Favre' })
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.files[0]?.destination).toBe('Yverdon')
    expect(after.groups).toHaveLength(0)
  })

  it('takes the same footage into another jump as well, leaving it in the one it is in', async () => {
    await twoMontages()
    await add('briefing.mp4', 'the theory', { kind: 'group', groupId: 'g1' })

    const again = await add('briefing.mp4', 'the theory', { kind: 'group', groupId: 'g2' })

    expect(again).toMatchObject({ outcome: 'copied', stays: 'Luc Favre' })
    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.groups.map((g) => g.files.map((f) => f.filename))).toEqual([
      ['briefing.mp4'],
      ['briefing.mp4']
    ])
    expect(new Set(after.groups.flatMap((g) => g.files.map((f) => f.path))).size).toBe(1)
    expect(fs.readdirSync(path.join(outputDir, 'original_files', '2026-08-01'))).toEqual([
      'briefing.mp4'
    ])
  })

  it('says so, and changes nothing, when the jump already holds that footage', async () => {
    await setup()
    await add('briefing.mp4', 'the theory', { kind: 'group', groupId: 'g1' })

    const again = await add('briefing again.mp4', 'the theory', { kind: 'group', groupId: 'g1' })

    expect(again.outcome).toBe('there')
    expect((await loadManifestAsync(manifestPath()))!.groups[0]?.files).toHaveLength(1)
  })

  it('takes only a name, never a path, and only videos and photos', async () => {
    await setup()
    await add('../../escape/clip.mp4', 'x', { kind: 'sort' })
    expect(fs.existsSync(path.join(outputDir, 'original_files', '2026-08-01', 'clip.mp4'))).toBe(
      true
    )
    await expect(add('notes.txt', 'x', { kind: 'sort' })).rejects.toThrow(/not a video or a photo/)
  })

  it('refuses a destination with no name', async () => {
    await setup()
    await expect(add('clip.mp4', 'x', { kind: 'destination', name: '  ' })).rejects.toThrow(
      /dropzone, a montage or the sorting area/
    )
  })

  it('takes it into a montage whose film is edited in SkyDock', async () => {
    await setup()
    const folder = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'luc_favre_20260801.edit.json'), '{"version":1}')

    await add('clip.mp4', 'x', { kind: 'group', groupId: 'g1' })

    expect((await loadManifestAsync(manifestPath()))!.groups[0]?.files).toHaveLength(1)
  })
})

describe('adding a file from the computer to a montage that is prepared', () => {
  it('joins it without putting the montage back to be processed', async () => {
    await setup()

    const answer = await add('GX010003.MP4', 'video', { kind: 'montage', groupId: 'g1' })

    const after = (await loadManifestAsync(manifestPath()))!
    expect(after.groups[0]?.processed).toBe(true)
    expect(after.groups[0]?.files.map((f) => f.filename)).toEqual(['GX010003.MP4'])
    expect(answer).toMatchObject({ outcome: 'added' })
  })

  it('copies in a clip the board has already', async () => {
    await twoMontages()
    const first = await add('GX010003.MP4', 'video', { kind: 'group', groupId: 'g2' })
    expect(first.outcome).toBe('added')

    const answer = await add('GX010003.MP4', 'video', { kind: 'montage', groupId: 'g1' })

    const after = (await loadManifestAsync(manifestPath()))!
    expect(answer.outcome).toBe('copied')
    expect(after.groups[1]?.files).toHaveLength(1)
    expect(after.groups[0]?.files).toHaveLength(1)
  })
})
