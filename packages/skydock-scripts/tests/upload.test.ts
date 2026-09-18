// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ensureShareLink } from '../src/nas'
import { planUpload } from '../src/publish'
import { goneFromStorage, resolveUploadTargets, targetForGroup } from '../src/upload'
import type { Manifest, ManifestGroup } from '../src/types'
import { createTmpDir, jsonResponse, nasStubs, seen, stubFetch } from './fixtures'

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const md5Of = (content: string) => crypto.createHash('md5').update(content).digest('hex')

const makeLocal = (contents: Record<string, string>) => {
  const dir = createTmpDir('skydock-plan-')
  for (const [name, body] of Object.entries(contents)) {
    const target = path.join(dir, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
  }
  return dir
}

const group = (over: Partial<ManifestGroup>): ManifestGroup => ({
  id: 'group_1',
  label: 'yverdon',
  day: '29.08.2026',
  files: [{ path: '/src/a.mp4', size: 5, mtime: 1_700_000_000, filename: 'a.mp4', id: 'f1' }],
  processed: true,
  ...over
})

const manifestOf = (groups: ManifestGroup[], over: Partial<Manifest> = {}): Manifest =>
  ({
    version: 1,
    createdAt: '',
    files: [],
    groups,
    destinations: [{ name: 'Yverdon' }],
    ...over
  }) as Manifest

describe('skipping what is already on the storage', () => {
  it('skips a file whose name, size and MD5 all match, and uploads the rest', async () => {
    const dir = makeLocal({ 'videos/same.mp4': 'identical', 'videos/new.mp4': 'fresh' })
    const stub = nasStubs({
      files: { '/nas/jump/videos': [{ name: 'same.mp4', size: 'identical'.length }] },
      md5: { '/nas/jump/videos/same.mp4': md5Of('identical') }
    })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const plan = await planUpload({
      host: 'https://nas',
      sid: 'sid',
      localDir: dir,
      remoteDir: '/nas/jump'
    })
    expect(plan.skip.map((v) => path.basename(v.localPath))).toEqual(['same.mp4'])
    expect(plan.upload.map((f) => path.basename(f))).toEqual(['new.mp4'])
    /* the verdict carries the proof, so the file can be marked uploaded without re-checking */
    expect(plan.skip[0]).toMatchObject({
      remotePath: '/nas/jump/videos/same.mp4',
      md5: md5Of('identical'),
      size: 'identical'.length
    })
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('uploads a same-sized file whose MD5 differs', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaa' })
    const stub = nasStubs({
      files: { '/nas/jump': [{ name: 'a.mp4', size: 4 }] },
      md5: { '/nas/jump/a.mp4': md5Of('bbbb') }
    })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const plan = await planUpload({
      host: 'https://nas',
      sid: 'sid',
      localDir: dir,
      remoteDir: '/nas/jump'
    })
    expect(plan.skip).toEqual([])
    expect(plan.upload.map((f) => path.basename(f))).toEqual(['a.mp4'])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('never asks for an MD5 when the sizes already differ', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaaaaaa' })
    const stub = nasStubs({ files: { '/nas/jump': [{ name: 'a.mp4', size: 3 }] } })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const plan = await planUpload({
      host: 'https://nas',
      sid: 'sid',
      localDir: dir,
      remoteDir: '/nas/jump'
    })
    expect(plan.upload).toHaveLength(1)
    expect(seen.some((c) => c.url.includes('SYNO.FileStation.MD5'))).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('sends the file when the storage cannot checksum it — uncertainty never means skip', async () => {
    const dir = makeLocal({ 'a.mp4': 'aaaa' })
    const stub = nasStubs({ files: { '/nas/jump': [{ name: 'a.mp4', size: 4 }] }, md5: {} })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    const plan = await planUpload({
      host: 'https://nas',
      sid: 'sid',
      localDir: dir,
      remoteDir: '/nas/jump'
    })
    expect(plan.skip).toEqual([])
    expect(plan.upload).toHaveLength(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('asks for no listing work beyond one call per remote folder', async () => {
    const dir = makeLocal({ 'videos/a.mp4': 'a', 'videos/b.mp4': 'b', 'photos/c.jpg': 'c' })
    const stub = nasStubs({ files: {} })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    await planUpload({ host: 'https://nas', sid: 'sid', localDir: dir, remoteDir: '/nas/jump' })
    const lists = seen.filter((c) => c.url.includes('filetype=file'))
    expect(lists).toHaveLength(2)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('share links', () => {
  it('reuses a live link for the same folder and never creates a second one', async () => {
    const stub = nasStubs({ links: [{ url: '/sharing/kept', path: '/nas/jump', status: 'valid' }] })
    stubFetch((url) => stub(url) ?? jsonResponse({ success: true }))
    await expect(ensureShareLink('https://nas', 'sid', '/nas/jump')).resolves.toBe(
      'https://nas/sharing/kept'
    )
    expect(seen.some((c) => c.url.includes('method=create'))).toBe(false)
  })

  it('creates a link when the only match has expired', async () => {
    const stub = nasStubs({
      links: [{ url: '/sharing/dead', path: '/nas/jump', status: 'expired' }]
    })
    stubFetch(
      (url) =>
        stub(url) ?? jsonResponse({ success: true, data: { links: [{ url: '/sharing/fresh' }] } })
    )
    await expect(ensureShareLink('https://nas', 'sid', '/nas/jump')).resolves.toBe(
      'https://nas/sharing/fresh'
    )
  })
})

describe('where an upload goes', () => {
  const outputDir = '/out'

  it('sends a flat fun jump to the destination folder itself, with no per-jump subfolder', () => {
    const manifest = manifestOf([group({ destination: 'Yverdon' })])
    const [target] = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: '/nas',
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBe('/nas/Yverdon')
    expect(target.localDir).toBe('/out/processed/Yverdon')
  })

  /* Still where a passenger's folder goes — delivering asks for this target directly, which is the
     only way a tandem ever reaches the storage. */
  it('gives a tandem its passenger folder inside the destination', () => {
    const manifest = manifestOf([
      group({
        id: 'group_2',
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' }
      })
    ])
    const target = targetForGroup(manifest.groups[0], outputDir, manifest, '/nas')
    expect(target.remoteDir).toBe('/nas/Tandems/Luc Favre')
  })

  /* An upload sends a folder whole, and a passenger's holds the project, the working copies and
     the archive of the originals as well as the film. RULES says a tandem is delivered and not
     uploaded; this is the code saying it too, wherever the scope came from. */
  it('leaves a tandem out of an upload, however it was asked for', () => {
    const manifest = manifestOf([
      group({ destination: 'Yverdon' }),
      group({
        id: 'group_2',
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' }
      })
    ])
    const byId = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: '/nas',
      scope: { groupIds: ['group_1', 'group_2'] }
    })
    expect(byId.map((t) => t.key)).toEqual(['group:group_1'])

    const byDestination = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: '/nas',
      scope: { destination: 'Tandems' }
    })
    expect(byDestination).toEqual([])
  })

  it('treats two fun jumps in one destination as a single upload', () => {
    const manifest = manifestOf([
      group({ id: 'group_1', destination: 'Yverdon' }),
      group({ id: 'group_2', destination: 'Yverdon' })
    ])
    const targets = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: '/nas',
      scope: { destination: 'Yverdon' }
    })
    expect(targets).toHaveLength(1)
    expect(targets[0].groupIds.sort()).toEqual(['group_1', 'group_2'])
  })

  it('covers a destination that holds nothing but lone files', () => {
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
    const targets = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: '/nas',
      scope: { destination: 'Yverdon' }
    })
    expect(targets).toHaveLength(1)
    expect(targets[0].remoteDir).toBe('/nas/Yverdon')
  })

  it("uses a destination's own path with no default folder at all", () => {
    const manifest = manifestOf([group({ destination: 'Yverdon' })], {
      destinations: [{ name: 'Yverdon', path: '/volume1/dropzones/yverdon' }]
    })
    const [target] = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: null,
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBe('/volume1/dropzones/yverdon')
  })

  it('reports an unresolvable folder rather than inventing one', () => {
    const manifest = manifestOf([group({ destination: undefined })])
    const [target] = resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: null,
      scope: { groupIds: ['group_1'] }
    })
    expect(target.remoteDir).toBeNull()
  })
})

/* A tandem is uploaded while the storage holds what was sent. Only a folder that answered is
   evidence: a listing that failed must not make an upload disappear. */
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
