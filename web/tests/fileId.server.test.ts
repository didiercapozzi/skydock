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

  it('matches the bash sha256sum fingerprint for a small file', async () => {
    const filePath = writeTempFile(tmpDir, 'small.bin', SMALL_CONTENT)

    const id = await computeFileId(filePath, 'PHOTO')

    expect(id).toBe('PHOTO:61cf47824a3ef32e')
  })

  it('is stable across repeated calls and unchanged mtimes', async () => {
    const filePath = writeTempFile(tmpDir, 'clip.mp4', SMALL_CONTENT)
    const stat = fs.statSync(filePath)

    const first = await computeFileId(filePath, 'VIDEO')
    const second = await computeFileId(filePath, 'VIDEO')

    expect(second).toBe(first)
    expect(fs.statSync(filePath).mtimeMs).toBe(stat.mtimeMs)
  })

  it('changes when binary content changes under the same name', async () => {
    const filePath = writeTempFile(tmpDir, 'DJI_0001.MP4', Buffer.alloc(4096, 7))
    const before = await computeFileId(filePath, 'PHOTO')

    fs.writeFileSync(filePath, Buffer.alloc(4096, 9))
    const after = await computeFileId(filePath, 'PHOTO')

    expect(after).not.toBe(before)
    expect(after.startsWith('PHOTO:')).toBe(true)
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
    cameras: [
      { id: 'camera1', path: '/camera1', fileCount: filePaths.length },
      { id: 'camera2', path: '/camera2', fileCount: 0 }
    ],
    theory: [],
    files: filePaths.map((p) => ({
      path: p,
      camera: 'PHOTO' as const,
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
          camera: 'PHOTO' as const,
          size: 10,
          mtime: 1787727600,
          filename: path.basename(p)
        }))
      }
    ]
  })

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-manifest-'))
    manifestPath = path.join(tmpDir, 'proposed_jumps.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('fills missing ids for files and embedded jump copies', async () => {
    const a = writeTempFile(tmpDir, 'a.bin', Buffer.alloc(2048, 1))
    const b = writeTempFile(tmpDir, 'b.bin', Buffer.alloc(2048, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest([a, b])))

    await ensureManifestFileIds(manifestPath)

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    const ids = manifest.files.map((f) => f.id)
    expect(ids.every((id) => typeof id === 'string' && id.startsWith('PHOTO:'))).toBe(true)
    expect(new Set(ids).size).toBe(2)
    expect(manifest.jumps[0].files.map((f) => f.id)).toEqual(ids)
  })

  it('leaves existing ids untouched and is a no-op when nothing is missing', async () => {
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
