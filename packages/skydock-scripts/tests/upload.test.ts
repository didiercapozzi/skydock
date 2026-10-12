// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { planUpload } from '../src/publish'
import { goneFromStorage, goneSent, resolveUploadTargets, targetForGroup } from '../src/upload'
import type { Manifest, ManifestGroup } from '../src/types'
import { createTmpDir, jsonResponse, nasStubs, seen, stubFetch } from './fixtures'

beforeEach(() => {
  seen.length = 0
})

const made: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const md5Of = (content: string) => crypto.createHash('md5').update(content).digest('hex')

const makeLocal = (contents: Record<string, string>) => {
  const dir = createTmpDir('skydock-plan-')
  made.push(dir)
  for (const [name, body] of Object.entries(contents)) {
    const target = path.join(dir, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
  }
  return dir
}

const plan = (localDir: string) =>
  planUpload({ host: 'https://nas', sid: 'sid', localDir, remoteDir: '/nas/jump' })

const group = (over: Partial<ManifestGroup>): ManifestGroup => ({
  id: 'group_1',
  label: 'yverdon',
  day: '29.08.2026',
  files: [{ path: '/src/a.mp4', size: 5, mtime: 1_700_000_000, filename: 'a.mp4', id: 'f1' }],
  processed: true,
  ...over
})

const manifestOf = (groups: ManifestGroup[], over: Partial<Manifest> = {}): Manifest => ({
  version: 1,
  createdAt: '',
  files: [],
  groups,
  destinations: [
    { name: 'Yverdon', path: '/nas/Yverdon' },
    { name: 'Passengers', path: '/nas/Passengers' }
  ],
  ...over
})

describe('skipping what is already on the storage', () => {
  it('skips a file whose name, size and checksum all match, and uploads the rest', async () => {
    const dir = makeLocal({ 'videos/same.mp4': 'identical', 'videos/new.mp4': 'fresh' })
    const stub = nasStubs({
      files: { '/nas/jump/videos': [{ name: 'same.mp4', size: 'identical'.length }] },
      md5: { '/nas/jump/videos/same.mp4': md5Of('identical') }
    })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const planned = await plan(dir)
    expect(planned.skip.map((v) => path.basename(v.localPath))).toEqual(['same.mp4'])
    expect(planned.upload.map((f) => path.basename(f))).toEqual(['new.mp4'])
    expect(planned.skip[0]).toMatchObject({
      remotePath: '/nas/jump/videos/same.mp4',
      md5: md5Of('identical'),
      size: 'identical'.length
    })
  })

  it('uploads a same-sized file whose checksum differs', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaa' })
    const stub = nasStubs({
      files: { '/nas/jump': [{ name: 'a.mp4', size: 4 }] },
      md5: { '/nas/jump/a.mp4': md5Of('bbbb') }
    })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const planned = await plan(dir)
    expect(planned.skip).toEqual([])
    expect(planned.upload.map((f) => path.basename(f))).toEqual(['a.mp4'])
  })

  it('never asks for a checksum when the sizes already differ', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaaaaaa' })
    const stub = nasStubs({ files: { '/nas/jump': [{ name: 'a.mp4', size: 3 }] } })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const planned = await plan(dir)
    expect(planned.upload).toHaveLength(1)
    expect(seen.some((c) => c.url.includes('SYNO.FileStation.MD5'))).toBe(false)
  })

  it('sends the file when the storage cannot checksum it — uncertainty never means skip', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaa' })
    const stub = nasStubs({ files: { '/nas/jump': [{ name: 'a.mp4', size: 4 }] }, md5: {} })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const planned = await plan(dir)
    expect(planned.skip).toEqual([])
    expect(planned.upload).toHaveLength(1)
  })
})

describe('where an upload goes', () => {
  const outputDir = '/out'

  it('sends a dropzone’s jump into the dropzone’s folder itself, with no folder per jump', async () => {
    const manifest = manifestOf([group({ destination: 'Yverdon' })])
    const [target] = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBe('/nas/Yverdon')
    expect(target.localDir).toBe('/out/processed/Yverdon')
  })

  it('gives the folder of a destination no link by default', async () => {
    const manifest = manifestOf([group({ destination: 'Yverdon' })])
    const targets = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { groupIds: ['group_1'] }
    })
    expect(targets.every((target) => target.share === false)).toBe(true)
  })

  it('leaves out of a destination’s upload what the record says is up there already', async () => {
    const out = createTmpDir('skydock-out-')
    made.push(out)
    const dir = path.join(out, 'processed', 'sion')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'sent.mp4'), 'sent')
    fs.writeFileSync(path.join(dir, 'new.mp4'), 'new!')
    const lone = (name: string, size: number, sent: boolean) => ({
      path: `/src/${name}`,
      size,
      mtime: 1,
      filename: name,
      id: name,
      destination: 'sion',
      processed: {
        path: path.join(dir, name),
        size,
        at: 1,
        source: {
          id: name,
          size,
          mtime: 1,
          cropStart: null,
          cropEnd: null,
          frame: null,
          rotation: null
        }
      },
      ...(sent
        ? {
            uploaded: {
              remotePath: `/nas/Sion/${name}`,
              md5: 'x',
              size,
              localPath: path.join(dir, name),
              at: 1
            }
          }
        : {})
    })
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      destinations: [{ name: 'sion', path: '/nas/Sion' }],
      groups: [],
      files: [lone('sent.mp4', 4, true), lone('new.mp4', 4, false)]
    }

    const [target] = await resolveUploadTargets({
      outputDir: out,
      manifest,
      scope: { destination: 'sion' }
    })

    expect(target?.files?.map((f) => path.basename(f))).toEqual(['new.mp4'])

    const [again] = await resolveUploadTargets({
      outputDir: out,
      manifest,
      scope: { destination: 'sion' },
      remote: { dirs: ['/nas/Sion'], sizes: {} }
    })
    expect(again?.files?.map((f) => path.basename(f)).sort()).toEqual(['new.mp4', 'sent.mp4'])
  })

  it('gives a montage no folder of its own to be uploaded into as a place', () => {
    const manifest = manifestOf([
      group({
        id: 'group_2',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' }
      })
    ])
    const target = targetForGroup(manifest.groups[0], outputDir, manifest)
    expect(target.remoteDir).toBeNull()
  })

  it('leaves a montage out of an upload, however it was asked for', async () => {
    const manifest = manifestOf([
      group({ destination: 'Yverdon' }),
      group({
        id: 'group_2',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' }
      })
    ])
    const byId = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { groupIds: ['group_1', 'group_2'] }
    })
    expect(byId.map((t) => t.key)).toEqual(['group:group_1'])

    const byDestination = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { destination: 'Passengers' }
    })
    expect(byDestination).toEqual([])
  })

  it('uploads two jumps of one dropzone as a single upload', async () => {
    const manifest = manifestOf([
      group({ id: 'group_1', destination: 'Yverdon' }),
      group({ id: 'group_2', destination: 'Yverdon' })
    ])
    const targets = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { destination: 'Yverdon' }
    })
    expect(targets).toHaveLength(1)
    expect(targets[0].groupIds.sort()).toEqual(['group_1', 'group_2'])
  })

  it('covers a dropzone that holds nothing but loose files', async () => {
    const manifest = manifestOf([], {
      files: [
        {
          path: '/src/x.mp4',
          size: 1,
          mtime: 1,
          filename: 'x.mp4',
          id: 'x',
          destination: 'Yverdon'
        }
      ]
    })
    const targets = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { destination: 'Yverdon' }
    })
    expect(targets).toHaveLength(1)
    expect(targets[0].remoteDir).toBe('/nas/Yverdon')
  })

  it("uses a destination's own path with no default folder at all", async () => {
    const manifest = manifestOf([group({ destination: 'Yverdon' })], {
      destinations: [{ name: 'Yverdon', path: '/volume1/dropzones/yverdon' }]
    })
    const [target] = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBe('/volume1/dropzones/yverdon')
  })

  it('says a folder is missing rather than guessing one', async () => {
    const manifest = manifestOf([group({ destination: undefined })])
    const [target] = await resolveUploadTargets({
      outputDir,
      manifest,
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBeNull()
  })
})

describe('what of an upload the storage no longer has', () => {
  const sent = (remotePath: string, size: number) => ({
    remotePath,
    md5: 'x',
    size,
    localPath: '/local',
    at: 1
  })
  const record = {
    at: 1,
    film: sent('/Pax/Luc Favre/luc.mp4', 300),
    photos: sent('/Pax/Luc Favre/luc.photos.zip', 50),
    rushes: sent('/Backup/luc.rushes.zip', 900)
  }

  it('finds nothing gone while everything is still there', () => {
    const remote = {
      dirs: ['/Pax/Luc Favre', '/Backup'],
      sizes: {
        '/Pax/Luc Favre/luc.mp4': 300,
        '/Pax/Luc Favre/luc.photos.zip': 50,
        '/Backup/luc.rushes.zip': 900
      }
    }
    expect(goneFromStorage(record, remote)).toEqual([])
  })

  it('names a file deleted over there, and one that is not the size that was sent', () => {
    const remote = {
      dirs: ['/Pax/Luc Favre', '/Backup'],
      sizes: { '/Pax/Luc Favre/luc.photos.zip': 49, '/Backup/luc.rushes.zip': 900 }
    }
    expect(goneFromStorage(record, remote).map((f) => f.remotePath)).toEqual([
      '/Pax/Luc Favre/luc.mp4',
      '/Pax/Luc Favre/luc.photos.zip'
    ])
  })

  it('takes nothing away for a folder that did not answer, or a size it did not give', () => {
    const remote = {
      dirs: ['/Pax/Luc Favre'],
      sizes: { '/Pax/Luc Favre/luc.mp4': null, '/Pax/Luc Favre/luc.photos.zip': 50 }
    }
    expect(goneFromStorage(record, remote)).toEqual([])
    expect(goneFromStorage(record, null)).toEqual([])
  })
})

describe('what of the items handed over the storage no longer has', () => {
  const record = {
    at: 1,
    sent: [
      { name: 'photos/', holds: ['photos' as const], to: ['/Films'] },
      { name: 'luc.mp4', holds: ['film' as const], to: ['/Films'] }
    ]
  }

  it('does not say a folder of photos is gone while the storage lists photos inside it', () => {
    const remote = {
      dirs: ['/Films', '/Films/photos'],
      sizes: { '/Films/photos/a.jpg': 5, '/Films/luc.mp4': 9 }
    }
    expect(goneSent(record, remote)).toEqual([])
  })

  it('says a folder of photos is gone when its listing came back empty', () => {
    const remote = { dirs: ['/Films', '/Films/photos'], sizes: { '/Films/luc.mp4': 9 } }
    expect(goneSent(record, remote)).toEqual(['/Films/photos/'])
  })
})
