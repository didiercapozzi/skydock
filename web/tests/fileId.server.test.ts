import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { computeFileId, ensureManifestFileIds } from '../app/lib/fileId.server'
import type { Manifest } from '../app/lib/types'

const SMALL_CONTENT = Buffer.from('01234567890123456789', 'utf-8')

const writeTempFile = (dir: string, name: string, content: Buffer): string => {
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('computeFileId', () => {
  let tmpDir = ''

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-fileid-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns a 16-char hex id based on file content', async () => {
    const filePath = writeTempFile(tmpDir, 'small.bin', SMALL_CONTENT)

    const id = await computeFileId(filePath)

    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable across repeated calls and unchanged mtimes', async () => {
    const filePath = writeTempFile(tmpDir, 'clip.mp4', SMALL_CONTENT)
    const stat = fs.statSync(filePath)

    const first = await computeFileId(filePath)
    const second = await computeFileId(filePath)

    expect(second).toBe(first)
    expect(fs.statSync(filePath).mtimeMs).toBe(stat.mtimeMs)
  })

  it('changes when binary content changes under the same name', async () => {
    const filePath = writeTempFile(tmpDir, 'DJI_0001.MP4', Buffer.alloc(4096, 7))
    const before = await computeFileId(filePath)

    fs.writeFileSync(filePath, Buffer.alloc(4096, 9))
    const after = await computeFileId(filePath)

    expect(after).not.toBe(before)
  })

  it('produces same id for same content regardless of filename', async () => {
    const content = Buffer.alloc(1024, 42)
    const a = writeTempFile(tmpDir, 'CAM_A.MP4', content)
    const b = writeTempFile(tmpDir, 'CAM_B.MP4', content)

    const idA = await computeFileId(a)
    const idB = await computeFileId(b)

    expect(idA).toBe(idB)
  })
})

describe('ensureManifestFileIds', () => {
  let tmpDir = ''
  let manifestPath = ''

  const buildManifest = (filePaths: string[]): Manifest => ({
    version: 1,
    status: 'proposed',
    date: '2026-08-26',
    startDatetime: '2026-08-26T09:00:00Z',
    createdAt: new Date().toISOString(),
    theory: [],
    files: filePaths.map((p) => ({
      path: p,
      size: 10,
      mtime: 1787727600,
      filename: path.basename(p)
    })),
    jumps: [
      {
        id: 'jump_1',
        label: 'Jump 1',
        confirmed: false,
        files: filePaths.map((p) => ({
          path: p,
          size: 10,
          mtime: 1787727600,
          filename: path.basename(p)
        }))
      }
    ]
  })

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-manifest-'))
    manifestPath = path.join(tmpDir, 'manifest.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('resolves thumbPath and filmstripDir for videos with ids', async () => {
    const a = writeTempFile(tmpDir, 'a.mp4', Buffer.alloc(2048, 1))
    const manifest = buildManifest([a])
    manifest.files[0].id = 'vid_a'
    manifest.jumps[0].files[0].id = 'vid_a'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    const thumbDir = path.join(tmpDir, '.cache', 'thumbs')
    const filmstripDir = path.join(tmpDir, '.cache', 'filmstrip', 'vid_a')
    fs.mkdirSync(thumbDir, { recursive: true })
    fs.mkdirSync(filmstripDir, { recursive: true })
    fs.writeFileSync(path.join(thumbDir, 'vid_a.jpg'), Buffer.from('thumb'))
    fs.writeFileSync(path.join(filmstripDir, '0001.jpg'), Buffer.from('filmstrip'))

    await ensureManifestFileIds(manifestPath)

    const reloaded = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    expect(reloaded.files[0].thumbPath).toContain('vid_a.jpg')
    expect(reloaded.files[0].filmstripDir).toContain('vid_a')
  })

  it('leaves existing ids untouched', async () => {
    const a = writeTempFile(tmpDir, 'a.bin', Buffer.alloc(1024, 5))
    const manifest = buildManifest([a])
    manifest.files[0].id = 'PHOTO:custom0000000001'
    manifest.jumps[0].files[0].id = 'PHOTO:custom0000000001'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    await ensureManifestFileIds(manifestPath)

    const reloaded = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    expect(reloaded.files[0].id).toBe('PHOTO:custom0000000001')
  })

  it('ignores entries whose source file no longer exists', async () => {
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(['/gone/missing.bin'])))

    await ensureManifestFileIds(manifestPath)

    const reloaded = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    expect(reloaded.files[0].id).toBeUndefined()
  })
})
