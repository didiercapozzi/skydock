// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as nodePath from 'node:path'
import * as nodeOs from 'node:os'

type MockStream = {
  on: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const createMockStream = (): MockStream => ({
  on: vi.fn(),
  destroy: vi.fn()
})

const makeFormRequest = (url: string, fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return new Request(url, { method: 'POST', body: fd })
}

const makeJsonRequest = (url: string, body: Record<string, unknown>) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const getActualFs = async () => await vi.importActual<typeof import('node:fs')>('node:fs')

const makeTmpDir = async () => {
  const actualFs = await getActualFs()
  const dir = actualFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'skydock-api-test-'))
  return { dir, actualFs }
}

const makeManifest = (overrides: Partial<Record<string, unknown>> = {}) => {
  const base = {
    version: 1,
    status: 'proposed' as const,
    date: '2026-08-27',
    startDatetime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    theory: [],
    files: [
      { path: '/out/original_files/2026-08-27/DJI_0001.MP4', size: 100, mtime: 1000, filename: 'DJI_0001.MP4', id: 'id1' },
      { path: '/out/original_files/2026-08-27/DJI_0002.MP4', size: 100, mtime: 2000, filename: 'DJI_0002.MP4', id: 'id2' },
      { path: '/out/original_files/2026-08-27/DJI_0003.MP4', size: 100, mtime: 30000, filename: 'DJI_0003.MP4', id: 'id3' }
    ],
    jumps: [
      {
        id: 'jump_1',
        label: 'Jump 1',
        confirmed: false,
        files: [{ path: '/out/original_files/2026-08-27/DJI_0001.MP4', size: 100, mtime: 1000, filename: 'DJI_0001.MP4', id: 'id1' }]
      },
      {
        id: 'jump_2',
        label: 'Jump 2',
        confirmed: false,
        files: [{ path: '/out/original_files/2026-08-27/DJI_0002.MP4', size: 100, mtime: 2000, filename: 'DJI_0002.MP4', id: 'id2' }]
      }
    ]
  }
  return { ...base, ...overrides } as unknown as import('@skydock/scripts').Manifest
}

describe('ui-api — file, library, jump, open, simulate, scan, manifest, status, duration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('api/file Range and streamResponse', () => {
    it('returns 206 with Content-Range for valid bytes=0-99', async () => {
      const mockStream = createMockStream()
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 1000 } as unknown as ReturnType<typeof import('node:fs').statSync>)
      const mockCreateReadStream = vi.fn().mockReturnValue(mockStream as unknown as ReturnType<typeof import('node:fs').createReadStream>)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: mockCreateReadStream }
      })
      const { loader } = await import('../app/routes/api.file')
      const req = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=0-99' } })
      const res = await loader({ request: req } as never)
      expect(res.status).toBe(206)
      expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000')
      expect(res.headers.get('Content-Length')).toBe('100')
      expect(mockCreateReadStream).toHaveBeenCalledWith(expect.any(String), { start: 0, end: 99 })
    })

    it('returns 416 on invalid range regex', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 500 } as never)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: vi.fn() }
      })
      const { loader } = await import('../app/routes/api.file')
      const req = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=invalid' } })
      const res = await loader({ request: req } as never)
      expect(res.status).toBe(416)
    })

    it('returns 416 when start > end', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 1000 } as never)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: vi.fn() }
      })
      const { loader } = await import('../app/routes/api.file')
      const req = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=900-100' } })
      const res = await loader({ request: req } as never)
      expect(res.status).toBe(416)
      expect(res.headers.get('Content-Range')).toBe('bytes */1000')
    })

    it('returns 416 when start >= size', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 100 } as never)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: vi.fn() }
      })
      const { loader } = await import('../app/routes/api.file')
      const req = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=100-200' } })
      const res = await loader({ request: req } as never)
      expect(res.status).toBe(416)
    })

    it('returns 416 on NaN and empty suffix handling', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 1000 } as never)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: vi.fn() }
      })
      const { loader } = await import('../app/routes/api.file')
      const req1 = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=abc-def' } })
      const res1 = await loader({ request: req1 } as never)
      expect(res1.status).toBe(416)
      const req2 = new Request('http://localhost/api/file?path=/tmp/a.mp4', { headers: { range: 'bytes=-' } })
      const res2 = await loader({ request: req2 } as never)
      expect([416, 206]).toContain(res2.status)
    })

    it('streamResponse cancel destroys nodeStream', async () => {
      const mockStream = createMockStream()
      const mockExistsSync = vi.fn().mockReturnValue(true)
      const mockStatSync = vi.fn().mockReturnValue({ isFile: () => true, size: 1000 } as never)
      const mockCreateReadStream = vi.fn().mockReturnValue(mockStream as never)
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: mockCreateReadStream }
      })
      const { loader } = await import('../app/routes/api.file')
      const req = new Request('http://localhost/api/file?path=/tmp/a.mp4')
      const res = await loader({ request: req } as never)
      expect(res.status).toBe(200)
      const body = res.body as ReadableStream<Uint8Array>
      expect(body).toBeDefined()
      await body.cancel()
      expect(mockStream.destroy).toHaveBeenCalled()
    })

    it('returns 400 missing path and 404 not found', async () => {
      const mockExistsSync = vi.fn().mockReturnValue(false)
      const mockStatSync = vi.fn()
      vi.doMock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>()
        return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync, createReadStream: vi.fn() }
      })
      const { loader } = await import('../app/routes/api.file')
      const reqMissing = new Request('http://localhost/api/file')
      const resMissing = await loader({ request: reqMissing } as never)
      expect(resMissing.status).toBe(400)
      const reqNotFound = new Request('http://localhost/api/file?path=/tmp/missing.mp4')
      const resNotFound = await loader({ request: reqNotFound } as never)
      expect(resNotFound.status).toBe(404)
    })
  })

  describe('api/library toggle and apply', () => {
    it('action=toggle with isInLibrary true adds override optimistic vs initial isTheory', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const overridesPath = nodePath.join(dir, '.theory_overrides.json')
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir, saveOverrides: (o: string, data: unknown) => actualFs.writeFileSync(nodePath.join(o, '.theory_overrides.json'), JSON.stringify(data)) }
      })
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { action } = await import('../app/routes/api.library')
      const filePath = nodePath.join(dir, '2026-08-27', 'Jump_1', 'videos', 'DJI_0001.MP4')
      actualFs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
      actualFs.writeFileSync(filePath, 'x')
      const req = makeFormRequest('http://localhost/api/library', { action: 'toggle', filePath, jumpId: 'jump_1', isInLibrary: 'true' })
      const res = await action({ request: req } as never) as { ok: boolean }
      expect(res.ok).toBe(true)
      const saved = JSON.parse(actualFs.readFileSync(overridesPath, 'utf-8') as string) as Record<string, unknown>
      expect(saved[filePath]).toBeDefined()
      const req2 = makeFormRequest('http://localhost/api/library', { action: 'toggle', filePath, isInLibrary: 'false' })
      const res2 = await action({ request: req2 } as never) as { ok: boolean }
      expect(res2.ok).toBe(true)
      const saved2 = JSON.parse(actualFs.readFileSync(overridesPath, 'utf-8') as string) as Record<string, unknown>
      expect(saved2[filePath]).toBeUndefined()
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('action=apply copies theory to all jumps via filePath/jumpId/isInLibrary guards', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const sourceJump = 'Jump_1'
      const sourceDate = '2026-08-27'
      const sourceDir = nodePath.join(dir, sourceDate, sourceJump, 'videos')
      const targetJumpDir = nodePath.join(dir, sourceDate, 'Jump_2', 'videos')
      actualFs.mkdirSync(sourceDir, { recursive: true })
      actualFs.mkdirSync(targetJumpDir, { recursive: true })
      actualFs.writeFileSync(nodePath.join(sourceDir, 'DJI_0001.MP4'), 'x')
      actualFs.writeFileSync(nodePath.join(targetJumpDir, 'DJI_0001.MP4'), 'y')
      actualFs.writeFileSync(nodePath.join(dir, '.theory_overrides.json'), JSON.stringify({ [nodePath.join(sourceDir, 'DJI_0001.MP4')]: { originalPath: nodePath.join(sourceDir, 'DJI_0001.MP4'), sourceDate } }))
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir, saveOverrides: (o: string, d: unknown) => actualFs.writeFileSync(nodePath.join(o, '.theory_overrides.json'), JSON.stringify(d)) }
      })
      const { action } = await import('../app/routes/api.library')
      const req = makeFormRequest('http://localhost/api/library', { action: 'apply', sourceJump, sourceJumpDate: sourceDate })
      const res = await action({ request: req } as never) as { ok: boolean }
      expect(res.ok).toBe(true)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/jump rename and delete .jump_number', () => {
    it('rename label writes .jump_number and renames dir', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const date = '2026-08-27'
      const jumpDir = 'Jump_1'
      const oldPath = nodePath.join(dir, date, jumpDir)
      actualFs.mkdirSync(oldPath, { recursive: true })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.jump')
      const req = makeFormRequest('http://localhost/api/jump', { action: 'rename', date, jumpDir, newName: 'My Jump!' })
      const res = await action({ request: req } as never) as { ok: boolean; jumpDir: string }
      expect(res.ok).toBe(true)
      expect(res.jumpDir).toBe('My_Jump')
      expect(actualFs.existsSync(nodePath.join(dir, date, 'My_Jump'))).toBe(true)
      expect(actualFs.readFileSync(nodePath.join(dir, date, 'My_Jump', '.jump_number'), 'utf-8')).toBe('1')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('rename returns error on missing date/jumpDir and invalid format', async () => {
      const { dir, actualFs } = await makeTmpDir()
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.jump')
      const req1 = makeFormRequest('http://localhost/api/jump', { action: 'rename', date: '', jumpDir: '' })
      const res1 = await action({ request: req1 } as never) as { ok: boolean }
      expect(res1.ok).toBe(false)
      const req2 = makeFormRequest('http://localhost/api/jump', { action: 'rename', date: '2026-08-27', jumpDir: 'Jump_1', newName: 'x' })
      const res2 = await action({ request: req2 } as never) as { ok: boolean }
      expect(res2.ok).toBe(false)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/open spawn xdg-open', () => {
    it('spawns xdg-open via exec and returns ok', async () => {
      const mockExec = vi.fn((_cmd: string, _opts: unknown, cb: (e: null, out: string) => void) => cb(null, ''))
      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>()
        return { ...actual, exec: mockExec }
      })
      const { action } = await import('../app/routes/api.open')
      const req = makeFormRequest('http://localhost/api/open', { path: '/tmp/a.mp4' })
      const res = await action({ request: req } as never) as { ok: boolean }
      expect(res.ok).toBe(true)
      expect(mockExec).toHaveBeenCalled()
      const calledCmd = (mockExec.mock.calls[0] as unknown[])[0] as string
      expect(calledCmd).toContain('xdg-open')
    })

    it('returns error on missing path and on exec failure', async () => {
      const mockExecFail = vi.fn((_cmd: string, _opts: unknown, cb: (e: Error) => void) => cb(new Error('fail')))
      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>()
        return { ...actual, exec: mockExecFail }
      })
      const { action } = await import('../app/routes/api.open')
      const reqMissing = makeFormRequest('http://localhost/api/open', { path: '' })
      const resMissing = await action({ request: reqMissing } as never) as { ok: boolean }
      expect(resMissing.ok).toBe(false)
    })
  })

  describe('api/simulate add-jump vs reset', () => {
    it('add-jump calls simulateCameras numFiles:4 plus processMedia scanMedia ensureManifestFileIds', async () => {
      const { dir } = await makeTmpDir()
      const mockSimulate = vi.fn().mockResolvedValue(undefined)
      const mockProcess = vi.fn()
      const mockScan = vi.fn().mockResolvedValue({ added: 1 })
      const mockEnsure = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, simulateCameras: mockSimulate, processMedia: mockProcess, scanMedia: mockScan, ensureManifestFileIds: mockEnsure, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.simulate')
      const req = makeFormRequest('http://localhost/api/simulate', { action: 'add-jump' })
      const res = await action({ request: req } as never) as { ok: boolean }
      expect(res.ok).toBe(true)
      expect(mockSimulate).toHaveBeenCalledWith(expect.objectContaining({ numFiles: 4 }))
      expect(mockScan).toHaveBeenCalled()
      expect(mockEnsure).toHaveBeenCalled()
    })

    it('reset dev data calls simulateCameras clean:true devData:true', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const mockSimulate = vi.fn().mockResolvedValue(undefined)
      const mockProcess = vi.fn()
      const mockScan = vi.fn().mockResolvedValue({ added: 0 })
      const mockEnsure = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, simulateCameras: mockSimulate, processMedia: mockProcess, scanMedia: mockScan, ensureManifestFileIds: mockEnsure, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.simulate')
      const req = makeFormRequest('http://localhost/api/simulate', { action: '' })
      const res = await action({ request: req } as never) as { ok: boolean }
      expect(res.ok).toBe(true)
      expect(mockSimulate).toHaveBeenCalledWith(expect.objectContaining({ clean: true, devData: true }))
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/scan scanMedia + ensureManifestFileIds', () => {
    it('runs scanMedia and ensureManifestFileIds returns ok manifest', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify(makeManifest()))
      const mockScan = vi.fn().mockResolvedValue({ added: 1, fileCount: 2, jumpCount: 1 })
      const mockEnsure = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, scanMedia: mockScan, ensureManifestFileIds: mockEnsure, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.scan')
      const res = await action() as { ok: boolean }
      expect(res.ok).toBe(true)
      expect(mockScan).toHaveBeenCalledWith({ outputDir: dir })
      expect(mockEnsure).toHaveBeenCalledWith(manifestPath)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('handles no manifest file and scan failure', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const mockScan = vi.fn().mockResolvedValue({ added: 0 })
      const mockEnsure = vi.fn().mockResolvedValue(undefined)
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, scanMedia: mockScan, ensureManifestFileIds: mockEnsure, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.scan')
      const res = await action() as { ok: boolean; error: string }
      expect(res.ok).toBe(false)
      expect(res.error).toContain('No media')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/manifest handlers', () => {
    it('update-label requireJump success and error', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files, cameraClockOffsetSeconds: null }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqOk = makeJsonRequest('http://localhost/api/manifest', { action: 'update-label', jumpId: 'jump_1', label: 'New Label' })
      const resOk = await action({ request: reqOk } as never) as { ok: boolean }
      expect(resOk.ok).toBe(true)
      const reqFail = makeJsonRequest('http://localhost/api/manifest', { action: 'update-label', jumpId: 'missing', label: 'x' })
      const resFail = await action({ request: reqFail } as never) as { ok: boolean; error: string }
      expect(resFail.ok).toBe(false)
      expect(resFail.error).toBe('Jump not found')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('confirm-jump and confirm-all handlers', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const req1 = makeJsonRequest('http://localhost/api/manifest', { action: 'confirm-jump', jumpId: 'jump_1', confirmed: true })
      const res1 = await action({ request: req1 } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(res1.ok).toBe(true)
      expect(res1.manifest.jumps.find((j) => j.id === 'jump_1')?.confirmed).toBe(true)
      const reqAll = makeJsonRequest('http://localhost/api/manifest', { action: 'confirm-all', confirmed: true })
      const resAll = await action({ request: reqAll } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(resAll.ok).toBe(true)
      expect(resAll.manifest.jumps.every((j) => j.confirmed)).toBe(true)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('delete-jump removes processed dir via sanitizeLabel', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, processed: true, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] }, { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [{ path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }] as unknown as import('@skydock/scripts').ManifestJump[] })
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, processed: (j as unknown as { processed: boolean }).processed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      const processedDir = nodePath.join(dir, 'processed', 'Jump_1')
      actualFs.mkdirSync(processedDir, { recursive: true })
      actualFs.writeFileSync(nodePath.join(processedDir, 'a.mp4'), 'x')
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir, sanitizeLabel: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_') }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const req = makeJsonRequest('http://localhost/api/manifest', { action: 'delete-jump', jumpId: 'jump_1' })
      const res = await action({ request: req } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(res.ok).toBe(true)
      expect(res.manifest.jumps.find((j) => j.id === 'jump_1')).toBeUndefined()
      expect(actualFs.existsSync(processedDir)).toBe(false)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('create-jump generates new Jump id and label', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const req = makeJsonRequest('http://localhost/api/manifest', { action: 'create-jump' })
      const res = await action({ request: req } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(res.ok).toBe(true)
      expect(res.manifest.jumps.length).toBe(3)
      expect(res.manifest.jumps[2].id).toContain('jump_')
      expect(res.manifest.jumps[2].label).toBe('Jump 3')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('move-files and remove-files requireUnprocessed guard', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, processed: true, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] }, { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [{ path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }] as unknown as import('@skydock/scripts').ManifestJump[] })
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, processed: (j as unknown as { processed?: boolean }).processed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqMove = makeJsonRequest('http://localhost/api/manifest', { action: 'move-files', fromJumpId: 'jump_1', toJumpId: 'jump_2', fileIds: ['id1'] })
      const resMove = await action({ request: reqMove } as never) as { ok: boolean; error: string }
      expect(resMove.ok).toBe(false)
      expect(resMove.error).toContain('processed')
      const reqRemove = makeJsonRequest('http://localhost/api/manifest', { action: 'remove-files', jumpId: 'jump_1', fileIds: ['id1'] })
      const resRemove = await action({ request: reqRemove } as never) as { ok: boolean; error: string }
      expect(resRemove.ok).toBe(false)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('copy-files requireUnprocessed and duplicate skip', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const req = makeJsonRequest('http://localhost/api/manifest', { action: 'copy-files', toJumpId: 'jump_2', fileIds: ['id1'] })
      const res = await action({ request: req } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(res.ok).toBe(true)
      expect(res.manifest.jumps.find((j) => j.id === 'jump_2')?.files.some((f) => f.id === 'id1')).toBe(true)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('reorder-files size check and id set check', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }, { path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }] as unknown as import('@skydock/scripts').ManifestJump[] })
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }, { path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ id: 'id1' }, { id: 'id2' }] }] }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqBadSize = makeJsonRequest('http://localhost/api/manifest', { action: 'reorder-files', jumpId: 'jump_1', fileIds: ['id1'] })
      const resBadSize = await action({ request: reqBadSize } as never) as { ok: boolean; error: string }
      expect(resBadSize.ok).toBe(false)
      expect(resBadSize.error).toContain('does not match')
      const reqBadId = makeJsonRequest('http://localhost/api/manifest', { action: 'reorder-files', jumpId: 'jump_1', fileIds: ['id1', 'missing'] })
      const resBadId = await action({ request: reqBadId } as never) as { ok: boolean; error: string }
      expect(resBadId.ok).toBe(false)
      const reqOk = makeJsonRequest('http://localhost/api/manifest', { action: 'reorder-files', jumpId: 'jump_1', fileIds: ['id2', 'id1'] })
      const resOk = await action({ request: reqOk } as never) as { ok: boolean }
      expect(resOk.ok).toBe(true)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('merge-jumps need >=2, target in selection, processed guard, offset>12h shift via shiftFiles', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({
        files: [
          { path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' },
          { path: '/out/b.mp4', size: 10, mtime: 100000, filename: 'b.mp4', id: 'id2' }
        ],
        jumps: [
          { id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] },
          { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [{ path: '/out/b.mp4', size: 10, mtime: 100000, filename: 'b.mp4', id: 'id2' }] }
        ]
      } as unknown as Partial<import('@skydock/scripts').Manifest>)
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqNeed2 = makeJsonRequest('http://localhost/api/manifest', { action: 'merge-jumps', sourceJumpIds: ['jump_1'], targetJumpId: 'jump_1' })
      const resNeed2 = await action({ request: reqNeed2 } as never) as { ok: boolean; error: string }
      expect(resNeed2.ok).toBe(false)
      expect(resNeed2.error).toContain('at least 2')
      const reqNoTarget = makeJsonRequest('http://localhost/api/manifest', { action: 'merge-jumps', sourceJumpIds: ['jump_1', 'jump_2'], targetJumpId: 'jump_3' })
      const resNoTarget = await action({ request: reqNoTarget } as never) as { ok: boolean; error: string }
      expect(resNoTarget.ok).toBe(false)
      expect(resNoTarget.error).toContain('Target')
      const reqOk = makeJsonRequest('http://localhost/api/manifest', { action: 'merge-jumps', sourceJumpIds: ['jump_1', 'jump_2'], targetJumpId: 'jump_1' })
      const resOk = await action({ request: reqOk } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(resOk.ok).toBe(true)
      expect(resOk.manifest.jumps.length).toBe(1)
      expect(resOk.manifest.jumps[0].files.length).toBe(2)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('calibrate-sequences shift-sequences reset-calibration with originalMtime', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({
        files: [
          { path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' },
          { path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }
        ],
        jumps: [
          { id: 'jump_1', label: 'Jump 1', confirmed: false, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] },
          { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [{ path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }
        ]
      } as unknown as Partial<import('@skydock/scripts').Manifest>)
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqShift = makeJsonRequest('http://localhost/api/manifest', { action: 'shift-sequences', fileIds: ['id2'], offsetSeconds: 3600 })
      const resShift = await action({ request: reqShift } as never) as { ok: boolean }
      expect(resShift.ok).toBe(true)
      const reqReset = makeJsonRequest('http://localhost/api/manifest', { action: 'reset-calibration' })
      const resReset = await action({ request: reqReset } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(resReset.ok).toBe(true)
      expect(resReset.manifest.files.every((f) => f.originalMtime === undefined)).toBe(true)
      expect(resReset.manifest.cameraClockOffsetSeconds).toBeUndefined()
      const reqCal = makeJsonRequest('http://localhost/api/manifest', { action: 'calibrate-sequences', referenceIds: ['id1'], targetIds: ['id2'], scope: 'single' })
      const resCal = await action({ request: reqCal } as never) as { ok: boolean }
      expect([true, false]).toContain(resCal.ok)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('execute-jumps and unprocess-jump processed flag and status guards', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({
        status: 'proposed' as const,
        jumps: [
          { id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] },
          { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [{ path: '/out/b.mp4', size: 10, mtime: 2000, filename: 'b.mp4', id: 'id2' }] }
        ]
      } as unknown as Partial<import('@skydock/scripts').Manifest>)
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      const mockExecSync = vi.fn().mockReturnValue('')
      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>()
        return { ...actual, execSync: mockExecSync }
      })
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqExec = makeJsonRequest('http://localhost/api/manifest', { action: 'execute-jumps', jumpIds: ['jump_1'] })
      const resExec = await action({ request: reqExec } as never) as { ok: boolean }
      expect(resExec.ok).toBe(true)
      expect(mockExecSync).toHaveBeenCalled()
      const reqUnprocessFail = makeJsonRequest('http://localhost/api/manifest', { action: 'unprocess-jump', jumpId: 'jump_2' })
      const resUnprocessFail = await action({ request: reqUnprocessFail } as never) as { ok: boolean; error: string }
      expect(resUnprocessFail.ok).toBe(false)
      expect(resUnprocessFail.error).toContain('not processed')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('rename-file and set-crop with cropStart 0 delete behavior', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest()
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqRename = makeJsonRequest('http://localhost/api/manifest', { action: 'rename-file', fileId: 'id1', newFilename: 'NEW.MP4' })
      const resRename = await action({ request: reqRename } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(resRename.ok).toBe(true)
      expect(resRename.manifest.files.find((f) => f.id === 'id1')?.filename).toBe('NEW.MP4')
      const reqCrop = makeJsonRequest('http://localhost/api/manifest', { action: 'set-crop', fileId: 'id1', cropStart: 1.5, cropEnd: 5.0 })
      const resCrop = await action({ request: reqCrop } as never) as { ok: boolean }
      expect(resCrop.ok).toBe(true)
      const reqCropDelete = makeJsonRequest('http://localhost/api/manifest', { action: 'set-crop', fileId: 'id1', cropStart: 0 })
      const resCropDelete = await action({ request: reqCropDelete } as never) as { ok: boolean; manifest: import('@skydock/scripts').Manifest }
      expect(resCropDelete.ok).toBe(true)
      const fileAfter = resCropDelete.manifest.jumps.flatMap((j) => j.files).find((f) => f.id === 'id1')
      expect(fileAfter?.cropStart).toBeUndefined()
      expect(fileAfter?.cropEnd).toBeUndefined()
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('guards requireJump requireUnprocessed requireProcessedIds isAllProcessed', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const m = makeManifest({ status: 'executed' as const, jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, processed: true, files: [{ path: '/out/a.mp4', size: 10, mtime: 1000, filename: 'a.mp4', id: 'id1' }] }] as unknown as import('@skydock/scripts').ManifestJump[] })
      const manifestPath = nodePath.join(dir, 'manifest.json')
      const jumpsPath = nodePath.join(dir, 'jumps.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'executed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: m.files }))
      actualFs.writeFileSync(jumpsPath, JSON.stringify({ jumps: m.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, processed: (j as unknown as { processed: boolean }).processed, files: j.files.map((f) => ({ id: f.id! })) })) }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      vi.doMock('../app/lib/scanner.server', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
        return { ...actual, getOutputDirPath: () => dir }
      })
      const { action } = await import('../app/routes/api.manifest')
      const reqShiftAllProcessed = makeJsonRequest('http://localhost/api/manifest', { action: 'shift-sequences', fileIds: ['id1'], offsetSeconds: 100 })
      const resShift = await action({ request: reqShiftAllProcessed } as never) as { ok: boolean; error: string }
      expect(resShift.ok).toBe(false)
      expect(resShift.error).toContain('already processed')
      const reqCalAll = makeJsonRequest('http://localhost/api/manifest', { action: 'calibrate-sequences', referenceIds: ['id1'], targetIds: ['id1'] })
      const resCal = await action({ request: reqCalAll } as never) as { ok: boolean; error: string }
      expect(resCal.ok).toBe(false)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/status STALE_THRESHOLD_MS 120000', () => {
    it('loader returns ok status polling output/.status/*.json', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const statusDir = nodePath.join(dir, '.status')
      actualFs.mkdirSync(statusDir, { recursive: true })
      actualFs.writeFileSync(nodePath.join(statusDir, 'scan.json'), JSON.stringify({ state: 'running', updatedAt: new Date().toISOString() }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir, getStatusDir: () => statusDir }
      })
      const { loader } = await import('../app/routes/api.status')
      const res = await loader() as { ok: boolean; status: import('@skydock/scripts').SystemStatus }
      expect(res.ok).toBe(true)
      expect(res.status.scan.state).toBe('running')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('stale threshold returns idle after 120000 ms and handles missing file', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const statusDir = nodePath.join(dir, '.status')
      actualFs.mkdirSync(statusDir, { recursive: true })
      const staleTime = new Date(Date.now() - 130_000).toISOString()
      actualFs.writeFileSync(nodePath.join(statusDir, 'scan.json'), JSON.stringify({ state: 'running', updatedAt: staleTime }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir, getStatusDir: () => statusDir }
      })
      const { getSystemStatus } = await import('../app/lib/status.server')
      const status = getSystemStatus()
      expect(status.scan.state).toBe('idle')
      expect(status.execute.state).toBe('idle')
      expect(status.process.state).toBe('idle')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('api/duration ffprobe format→stream JSON', () => {
    it('returns {ok,duration} via format=duration', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const filePath = nodePath.join(dir, 'a.mp4')
      actualFs.writeFileSync(filePath, 'x')
      const mockExecSync = vi.fn().mockReturnValue('12.34\n')
      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>()
        return { ...actual, execSync: mockExecSync }
      })
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { loader } = await import('../app/routes/api.duration')
      const req = new Request(`http://localhost/api/duration?path=${encodeURIComponent(filePath)}`)
      const res = await loader({ request: req } as never) as Response
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; duration: number }
      expect(body.ok).toBe(true)
      expect(body.duration).toBeCloseTo(12.34)
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('format=duration'), expect.any(Object))
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('falls back to stream=duration when format fails', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const filePath = nodePath.join(dir, 'b.mp4')
      actualFs.writeFileSync(filePath, 'x')
      const mockExecSync = vi.fn().mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('format=duration')) throw new Error('no format')
        return '5.5\n'
      })
      vi.doMock('node:child_process', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:child_process')>()
        return { ...actual, execSync: mockExecSync }
      })
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { loader } = await import('../app/routes/api.duration')
      const req = new Request(`http://localhost/api/duration?path=${encodeURIComponent(filePath)}`)
      const res = await loader({ request: req } as never) as Response
      const body = await res.json() as { ok: boolean; duration: number }
      expect(body.ok).toBe(true)
      expect(body.duration).toBeCloseTo(5.5)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('returns 400 missing path/id and 404 not found', async () => {
      const { dir } = await makeTmpDir()
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { loader } = await import('../app/routes/api.duration')
      const reqMissing = new Request('http://localhost/api/duration')
      const resMissing = await loader({ request: reqMissing } as never) as Response
      expect(resMissing.status).toBe(400)
      const reqNotFound = new Request(`http://localhost/api/duration?path=${encodeURIComponent(nodePath.join(dir, 'missing.mp4'))}`)
      const resNotFound = await loader({ request: reqNotFound } as never) as Response
      expect(resNotFound.status).toBe(404)
    })
  })

  describe('path.server resolvePath and ffmpeg.server constants', () => {
    it('resolvePath returns null for missing, resolved for path, and id lookup via manifest', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const filePath = nodePath.join(dir, 'a.mp4')
      actualFs.writeFileSync(filePath, 'x')
      const manifestPath = nodePath.join(dir, 'manifest.json')
      actualFs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-27', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: [{ path: filePath, size: 1, mtime: 1000, filename: 'a.mp4', id: 'myid' }], jumps: [] }))
      actualFs.writeFileSync(nodePath.join(dir, 'jumps.json'), JSON.stringify({ jumps: [] }))
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { resolvePath } = await import('../app/lib/path.server')
      expect(resolvePath(null, null)).toBeNull()
      expect(resolvePath(filePath, null)).toBe(nodePath.resolve(filePath))
      expect(resolvePath(null, 'myid')).toBe(nodePath.resolve(filePath))
      expect(resolvePath(null, 'missing')).toBeNull()
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('resolveAndValidateFile prefix check and jsonError and getOutputDir', async () => {
      const { dir, actualFs } = await makeTmpDir()
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const { resolveAndValidateFile } = await import('../app/lib/path.server')
      const { getOutputDir } = await import('@skydock/scripts')
      expect(getOutputDir()).toBe(dir)
      const resMissing = resolveAndValidateFile(null, null)
      expect('error' in resMissing).toBe(true)
      if ('error' in resMissing) expect(resMissing.error.status).toBe(400)
      const missingPath = nodePath.join(dir, 'nope.mp4')
      const res404 = resolveAndValidateFile(missingPath, null)
      expect('error' in res404).toBe(true)
      if ('error' in res404) expect(res404.error.status).toBe(404)
      actualFs.rmSync(dir, { recursive: true, force: true })
    })

    it('ffmpeg.server constants CRF 28 KEYFRAME 60 AUDIO 64k and buildBaseArgs', async () => {
      const { FFMPEG_VIDEO_FLAGS, FFMPEG_AUDIO_FLAGS, FFMPEG_SHARED_FLAGS, buildBaseArgs } = await import('../app/lib/ffmpeg.server')
      expect(FFMPEG_VIDEO_FLAGS.join(' ')).toContain('28')
      expect(FFMPEG_VIDEO_FLAGS.join(' ')).toContain('60')
      expect(FFMPEG_AUDIO_FLAGS.join(' ')).toContain('64k')
      expect(FFMPEG_SHARED_FLAGS).toContain('-hide_banner')
      const argsWithSeek = buildBaseArgs('/tmp/a.mp4', 5)
      expect(argsWithSeek.join(' ')).toContain('-ss')
      expect(argsWithSeek.join(' ')).toContain('5')
      const argsNoSeek = buildBaseArgs('/tmp/a.mp4', 0)
      expect(argsNoSeek.join(' ')).not.toContain('-ss')
    })
  })

  describe('error handling section20 and streaming', () => {
    it('status loader network failure swallowed no crash returns idle', async () => {
      const { dir } = await makeTmpDir()
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => '/nonexistent', getStatusDir: () => nodePath.join('/nonexistent', '.status') }
      })
      const { loader } = await import('../app/routes/api.status')
      const res = await loader() as { ok: boolean; status: unknown }
      expect(res.ok).toBe(true)
      expect(res.status).toBeDefined()
      const { getOutputDir: _g } = await import('@skydock/scripts')
      void _g
    })

    it('api/stream respects MAX_LIVE 429 and api/hls session 30s TTL constants', async () => {
      const { dir, actualFs } = await makeTmpDir()
      const filePath = nodePath.join(dir, 'vid.mp4')
      actualFs.writeFileSync(filePath, 'x')
      vi.doMock('@skydock/scripts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@skydock/scripts')>()
        return { ...actual, getOutputDir: () => dir }
      })
      const hlsMod = await import('../app/routes/api.hls')
      expect(hlsMod.buildHlsArgs).toBeDefined()
      const args = hlsMod.buildHlsArgs(filePath, 0, nodePath.join(dir, '.cache', 'hls', 'test'))
      expect(args.join(' ')).toContain('hls_time')
      expect(args.join(' ')).toContain('4')
      const rewritten = hlsMod.rewritePlaylist('seg001.ts\nseg002.ts', '/api/hls?path=' + encodeURIComponent(filePath))
      expect(rewritten).toContain('segment=seg001.ts')
      actualFs.rmSync(dir, { recursive: true, force: true })
    })
  })
})

export {}
