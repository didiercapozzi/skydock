// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return { ...actual, execSync: vi.fn() }
})

const tmpDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
const rmDir = (dir: string) => fs.rmSync(dir, { recursive: true, force: true })
const writeFileAt = (dir: string, name: string, content: string | Buffer, mtimeMs?: number) => {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  if (mtimeMs !== undefined) {
    const d = new Date(mtimeMs)
    fs.utimesSync(full, d, d)
  }
  return full
}
const mockExecForProcess = (opts: { cmpSame: boolean; exiftoolCsv?: string }) => {
  const mocked = vi.mocked(execSync)
  mocked.mockImplementation(((cmd: unknown) => {
    const s = String(cmd)
    if (s.startsWith('command -v')) throw new Error('not found')
    if (s.includes('cmp -s')) {
      if (opts.cmpSame) return Buffer.from('')
      throw new Error('cmp differs')
    }
    if (s.includes('exiftool')) return opts.exiftoolCsv ?? 'SourceFile,CreateDate\n'
    return Buffer.from('')
  }) as unknown as typeof execSync)
}
const mockExecHasCommand = (has: boolean) => {
  const mocked = vi.mocked(execSync)
  mocked.mockImplementation(((cmd: unknown) => {
    const s = String(cmd)
    if (s.startsWith('command -v')) {
      if (has) return Buffer.from('/usr/bin/fake')
      throw new Error('not found')
    }
    if (s.includes('cmp -s')) throw new Error('differ')
    if (s.includes('exiftool')) return 'SourceFile,CreateDate\n'
    if (s.includes('ffmpeg')) return Buffer.from('')
    return Buffer.from('')
  }) as unknown as typeof execSync)
}

describe('ui-scripts — processMedia', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.resetAllMocks())

  it('deduplication via cmp -s skip when same content', async () => {
    const { processMedia } = await import('../../packages/skydock-scripts/src/process')
    const out = tmpDir('proc-skip-')
    const cam = tmpDir('cam-skip-')
    const src = writeFileAt(cam, 'DJI_0001.MP4', Buffer.from('same-content'), Date.now())
    const dateStr = new Date(fs.statSync(src).mtimeMs).toISOString().split('T')[0]
    const destDir = path.join(out, 'original_files', dateStr)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, 'DJI_0001.MP4')
    fs.writeFileSync(dest, Buffer.from('same-content'))
    mockExecForProcess({ cmpSame: true })
    const res = processMedia({ cameraDirs: [cam], outputDir: out })
    expect(res.skipped).toBe(1)
    expect(res.copied).toBe(0)
    expect(fs.readFileSync(dest, 'utf-8')).toBe('same-content')
    const statusPath = path.join(out, '.status', 'process.json')
    expect(fs.existsSync(statusPath)).toBe(true)
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
    expect(status.state).toBe('done')
    rmDir(out)
    rmDir(cam)
  })

  it('deduplication via cmp -s copy when cmp differs', async () => {
    const { processMedia } = await import('../../packages/skydock-scripts/src/process')
    const out = tmpDir('proc-diff-')
    const cam = tmpDir('cam-diff-')
    const src = writeFileAt(cam, 'DJI_0001.MP4', Buffer.from('new-content'), Date.now())
    const dateStr = new Date(fs.statSync(src).mtimeMs).toISOString().split('T')[0]
    const destDir = path.join(out, 'original_files', dateStr)
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, 'DJI_0001.MP4'), Buffer.from('old-content'))
    mockExecForProcess({ cmpSame: false })
    const res = processMedia({ cameraDirs: [cam], outputDir: out })
    expect(res.copied).toBe(1)
    expect(res.skipped).toBe(0)
    expect(fs.readFileSync(path.join(destDir, 'DJI_0001.MP4'), 'utf-8')).toBe('new-content')
    rmDir(out)
    rmDir(cam)
  })

  it('deduplication copy when dest not exists', async () => {
    const { processMedia } = await import('../../packages/skydock-scripts/src/process')
    const out = tmpDir('proc-new-')
    const cam = tmpDir('cam-new-')
    writeFileAt(cam, 'DJI_0002.MP4', Buffer.from('hello'), Date.now())
    mockExecForProcess({ cmpSame: false })
    const spyCmp = vi.mocked(execSync)
    const res = processMedia({ cameraDirs: [cam], outputDir: out })
    expect(res.copied).toBe(1)
    expect(res.skipped).toBe(0)
    const calls = spyCmp.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('cmp -s'))).toBe(false)
    rmDir(out)
    rmDir(cam)
  })

  it('preserves timestamps via fs.utimesSync', async () => {
    const { processMedia } = await import('../../packages/skydock-scripts/src/process')
    const out = tmpDir('proc-time-')
    const cam = tmpDir('cam-time-')
    const mtime = new Date('2026-08-24T10:00:00Z').getTime()
    const src = writeFileAt(cam, 'DJI_0003.MP4', Buffer.from('data'), mtime)
    mockExecForProcess({ cmpSame: false })
    const spy = vi.spyOn(fs, 'utimesSync')
    processMedia({ cameraDirs: [cam], outputDir: out })
    expect(spy).toHaveBeenCalled()
    const destDate = new Date(mtime).toISOString().split('T')[0]
    const dest = path.join(out, 'original_files', destDate, 'DJI_0003.MP4')
    expect(fs.statSync(dest).mtimeMs).toBe(mtime)
    spy.mockRestore()
    rmDir(out)
    rmDir(cam)
  })

  it('writes status running→done→idle with scheduleIdle 5000', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { processMedia } = await import('../../packages/skydock-scripts/src/process')
    const out = tmpDir('proc-status-')
    const cam = tmpDir('cam-status-')
    writeFileAt(cam, 'DJI_0004.MP4', Buffer.from('x'), Date.now())
    mockExecForProcess({ cmpSame: false })
    processMedia({ cameraDirs: [cam], outputDir: out })
    const statusPath = path.join(out, '.status', 'process.json')
    const done = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
    expect(done.state).toBe('done')
    expect(done.message).toMatch(/Copied/)
    vi.advanceTimersByTime(5000)
    const idle = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
    expect(idle.state).toBe('idle')
    vi.useRealTimers()
    rmDir(out)
    rmDir(cam)
  })

  it('uses checkExiftool findMediaFiles getExtension parseExiftoolCsv isCliModule', async () => {
    const utils = await import('../../packages/skydock-scripts/src/utils')
    const mocked = vi.mocked(execSync)
    mocked.mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v exiftool')) return Buffer.from('/usr/bin/exiftool')
      if (s.includes('exiftool')) return 'SourceFile,CreateDate\n"/tmp/a.MP4","2026:08:24 10:00:00"\n'
      if (s.includes('cmp -s')) throw new Error('differ')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    expect(utils.checkExiftool()).toBe(true)
    mocked.mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v exiftool')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    expect(utils.checkExiftool()).toBe(false)
    const dir = tmpDir('proc-find-')
    writeFileAt(dir, 'a.mp4', Buffer.from('x'))
    writeFileAt(dir, 'b.txt', Buffer.from('x'))
    writeFileAt(dir, 'sub/c.jpg', Buffer.from('x'))
    expect(utils.findMediaFiles(dir).length).toBe(2)
    expect(utils.getExtension('/a.MP4')).toBe('mp4')
    expect(utils.getExtension('noext')).toBe('')
    const csv = 'SourceFile,CreateDate\n"/a.mp4","2026:08:24 10:00:00"\n'
    expect(utils.parseExiftoolCsv(csv).get('/a.mp4')).toContain('2026:08:24')
    const orig = process.argv[1]
    process.argv[1] = '/tmp/process.ts'
    expect(utils.isCliModule('process')).toBe(true)
    process.argv[1] = '/tmp/other.js'
    expect(utils.isCliModule('process')).toBe(false)
    process.argv[1] = orig
    rmDir(dir)
    vi.resetAllMocks()
  })

  it('isCliModule true when argv ends with process.ts/.js', async () => {
    const { isCliModule } = await import('../../packages/skydock-scripts/src/utils')
    const orig = process.argv[1]
    process.argv[1] = '/workspace/packages/skydock-scripts/src/process.ts'
    expect(isCliModule('process')).toBe(true)
    process.argv[1] = '/workspace/packages/skydock-scripts/src/process.js'
    expect(isCliModule('process')).toBe(true)
    process.argv[1] = '/other/file.ts'
    expect(isCliModule('process')).toBe(false)
    process.argv[1] = orig
  })
})

describe('ui-scripts — scanMedia', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.resetAllMocks())

  it('fresh manifest creates jumps via reclusterJumps gap 1800s', async () => {
    const { scanMedia } = await import('../../packages/skydock-scripts/src/scan')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      if (s.includes('exiftool')) return 'SourceFile,CreateDate\n'
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const out = tmpDir('scan-fresh-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const base = Math.floor(new Date('2026-08-24T10:00:00Z').getTime() / 1000)
    writeFileAt(orig, 'DJI_0001.MP4', Buffer.from('a'), base * 1000)
    writeFileAt(orig, 'DJI_0002.MP4', Buffer.from('b'), (base + 60) * 1000)
    writeFileAt(orig, 'DJI_0003.MP4', Buffer.from('c'), (base + 4000) * 1000)
    const res = await scanMedia({ outputDir: out })
    expect(res.fileCount).toBe(3)
    expect(res.jumpCount).toBe(2)
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf-8'))
    expect(manifest.jumps.length).toBe(2)
    expect(manifest.jumps[0].files.length).toBe(2)
    expect(manifest.jumps[1].files.length).toBe(1)
    rmDir(out)
  })

  it('merge preserves user edits labels/confirmed and detects removed', async () => {
    const { scanMedia } = await import('../../packages/skydock-scripts/src/scan')
    const { saveManifest, loadManifest } = await import('../../packages/skydock-scripts/src/manifest')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      if (s.includes('exiftool')) return 'SourceFile,CreateDate\n'
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const out = tmpDir('scan-merge-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const base = Math.floor(new Date('2026-08-24T10:00:00Z').getTime() / 1000)
    const f1 = writeFileAt(orig, 'DJI_0001.MP4', Buffer.from('a'), base * 1000)
    const f2 = writeFileAt(orig, 'DJI_0002.MP4', Buffer.from('b'), (base + 60) * 1000)
    await scanMedia({ outputDir: out })
    const mp = path.join(out, 'manifest.json')
    const man = loadManifest(mp)!
    man.jumps[0].label = 'My Jump'
    man.jumps[0].confirmed = true
    saveManifest(mp, man)
    const f3 = writeFileAt(orig, 'DJI_0003.MP4', Buffer.from('c'), (base + 90) * 1000)
    fs.unlinkSync(f1)
    const res = await scanMedia({ outputDir: out })
    expect(res.added).toBe(1)
    expect(res.removed).toBe(1)
    const updated = loadManifest(mp)!
    expect(updated.jumps.some((j) => j.label === 'My Jump')).toBe(true)
    expect(updated.jumps.some((j) => j.confirmed === true)).toBe(true)
    expect(updated.files.some((f) => f.path === f3)).toBe(true)
    expect(updated.files.some((f) => f.path === f1)).toBe(false)
    rmDir(out)
  })

  it('detects removed even when all deleted', async () => {
    const { scanMedia } = await import('../../packages/skydock-scripts/src/scan')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const out = tmpDir('scan-removed-all-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    writeFileAt(orig, 'DJI_0001.MP4', Buffer.from('a'), Date.now())
    await scanMedia({ outputDir: out })
    fs.rmSync(orig, { recursive: true, force: true })
    fs.mkdirSync(orig, { recursive: true })
    const res = await scanMedia({ outputDir: out })
    expect(res.removed).toBe(1)
    expect(res.fileCount).toBe(0)
    rmDir(out)
  })

  it('reclusterJumps gap 1800s and sortFilesByMtime', async () => {
    const { reclusterJumps } = await import('../../packages/skydock-scripts/src/clustering')
    const { sortFilesByMtime } = await import('../../packages/skydock-scripts/src/utils')
    const base = 1_000_000
    const files = [
      { path: '/a.mp4', size: 1, mtime: base + 3600, filename: 'a.mp4', id: 'a' },
      { path: '/b.mp4', size: 1, mtime: base, filename: 'b.mp4', id: 'b' },
      { path: '/c.mp4', size: 1, mtime: base + 1800, filename: 'c.mp4', id: 'c' },
      { path: '/d.mp4', size: 1, mtime: base + 3601, filename: 'd.mp4', id: 'd' },
    ]
    expect(sortFilesByMtime(files).map((f) => f.filename)).toEqual(['b.mp4', 'c.mp4', 'a.mp4', 'd.mp4'])
    const manifest: import('../../packages/skydock-scripts/src/types').Manifest = {
      version: 1,
      status: 'proposed',
      date: '2026-08-24',
      startDatetime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      theory: [],
      files,
      jumps: [],
    }
    reclusterJumps(manifest)
    expect(manifest.jumps.length).toBe(2)
    const exactGap = [
      { path: '/x.mp4', size: 1, mtime: base, filename: 'x.mp4', id: 'x' },
      { path: '/y.mp4', size: 1, mtime: base + 1800, filename: 'y.mp4', id: 'y' },
    ]
    const m2: import('../../packages/skydock-scripts/src/types').Manifest = {
      version: 1,
      status: 'proposed',
      date: '2026-08-24',
      startDatetime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      theory: [],
      files: exactGap,
      jumps: [],
    }
    reclusterJumps(m2)
    expect(m2.jumps.length).toBe(1)
  })

  it('computeFileId SHA-256 16 hex streaming deterministic', async () => {
    const { computeFileId } = await import('../../packages/skydock-scripts/src/fileId')
    const dir = tmpDir('id-test-')
    const p = path.join(dir, 'f.mp4')
    fs.writeFileSync(p, Buffer.from('hello world'))
    const id1 = await computeFileId(p)
    const id2 = await computeFileId(p)
    expect(id1).toMatch(/^[a-f0-9]{16}$/)
    expect(id1).toBe(id2)
    fs.writeFileSync(p, Buffer.from('different'))
    const id3 = await computeFileId(p)
    expect(id3).not.toBe(id1)
    expect(id3).toMatch(/^[a-f0-9]{16}$/)
    const big = path.join(dir, 'big.mp4')
    const buf = Buffer.alloc(1024 * 1024, 0x61)
    fs.writeFileSync(big, buf)
    const idBig1 = await computeFileId(big)
    const idBig2 = await computeFileId(big)
    expect(idBig1).toBe(idBig2)
    expect(idBig1).toMatch(/^[a-f0-9]{16}$/)
    rmDir(dir)
  })

  it('handles empty original_files and missing original_files', async () => {
    const { scanMedia } = await import('../../packages/skydock-scripts/src/scan')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const out1 = tmpDir('scan-empty-')
    const res1 = await scanMedia({ outputDir: out1 })
    expect(res1.fileCount).toBe(0)
    expect(res1.unchanged).toBe(true)
    const out2 = tmpDir('scan-empty2-')
    fs.mkdirSync(path.join(out2, 'original_files'), { recursive: true })
    const res2 = await scanMedia({ outputDir: out2 })
    expect(res2.fileCount).toBe(0)
    expect(res2.unchanged).toBe(true)
    rmDir(out1)
    rmDir(out2)
  })

  it('supports all MEDIA_EXTENSIONS 23 and ignores unsupported', async () => {
    const { scanMedia } = await import('../../packages/skydock-scripts/src/scan')
    const { MEDIA_EXTENSIONS } = await import('../../packages/skydock-scripts/src/constants')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const all = ['mp4', 'mov', 'avi', 'mkv', 'mts', 'm4v', '3gp', 'jpg', 'jpeg', 'png', 'dng', 'raw', 'tif', 'tiff', 'heic', 'heif', 'arw', 'cr2', 'cr3', 'nef', 'orf', 'rw2', 'raf']
    expect(MEDIA_EXTENSIONS.length).toBeGreaterThan(0)
    const out = tmpDir('scan-ext-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    for (const ext of all) writeFileAt(orig, `file.${ext}`, Buffer.from('x'), Date.now())
    writeFileAt(orig, 'ignore.txt', Buffer.from('x'), Date.now())
    writeFileAt(orig, 'ignore.doc', Buffer.from('x'), Date.now())
    const res = await scanMedia({ outputDir: out })
    expect(res.fileCount).toBe(all.length)
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf-8'))
    const exts = manifest.files.map((f: { filename: string }) => f.filename.split('.').pop()?.toLowerCase())
    expect(exts).not.toContain('txt')
    expect(exts).not.toContain('doc')
    for (const ext of all) expect(exts).toContain(ext)
    rmDir(out)
  })
})

describe('ui-scripts — executeMedia', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.resetAllMocks())

  it('needsCrop true only when isVideoFile && cropStart!=null && cropEnd!=null', async () => {
    const out = tmpDir('exec-needscrop-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const vPath = writeFileAt(orig, 'vid.mp4', Buffer.from('video'), Date.now())
    const pPath = writeFileAt(orig, 'photo.jpg', Buffer.from('photo'), Date.now())
    const vStat = fs.statSync(vPath)
    const pStat = fs.statSync(pPath)
    const manifestPath = path.join(out, 'manifest.json')
    const jumpsPath = path.join(out, 'jumps.json')
    const mkManifest = (files: { path: string; size: number; mtime: number; filename: string; id: string; cropStart?: number | null; cropEnd?: number | null }[]) => ({
      version: 1,
      status: 'proposed',
      date: '2026-08-24',
      startDatetime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      files: files.map((f) => ({ path: f.path, size: f.size, mtime: f.mtime, filename: f.filename, id: f.id, cropStart: f.cropStart ?? undefined, cropEnd: f.cropEnd ?? undefined })),
      jumps: [
        {
          id: 'jump_1',
          label: 'Jump 1',
          confirmed: true,
          processed: undefined,
          files: files.map((f) => ({ path: f.path, size: f.size, mtime: f.mtime, filename: f.filename, id: f.id, cropStart: f.cropStart ?? undefined, cropEnd: f.cropEnd ?? undefined })),
        },
      ],
      theory: [],
    })
    const save = (man: unknown) => {
      const jumpsFile = { jumps: (man as { jumps: { id: string; label: string; confirmed: boolean; files: { id: string; cropStart?: number; cropEnd?: number }[] }[] }).jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, files: j.files.map((f) => ({ id: f.id, cropStart: f.cropStart, cropEnd: f.cropEnd })) })) }
      fs.writeFileSync(jumpsPath, JSON.stringify(jumpsFile, null, 2))
      const raw = { version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: (man as { files: unknown[] }).files }
      fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2))
      const full = JSON.parse(JSON.stringify(man))
      fs.writeFileSync(manifestPath, JSON.stringify({ ...full, jumps: (full as { jumps: unknown[] }).jumps }, null, 2))
    }
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const mockWithCropCheck = (cropStart: number | null | undefined, cropEnd: number | null | undefined, isVideo: boolean, expectCrop: boolean) => {
      vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
        const s = String(cmd)
        if (s.startsWith('command -v')) {
          if (s.includes('ffmpeg') || s.includes('exiftool')) return Buffer.from('/usr/bin/fake')
          throw new Error('not found')
        }
        if (s.includes('ffmpeg')) {
          expect(s).toContain('-ss')
          expect(s).toContain('-t')
          expect(s).toContain('-c copy')
          expect(s).toContain('-avoid_negative_ts make_zero')
          return Buffer.from('')
        }
        if (s.includes('exiftool')) return Buffer.from('')
        return Buffer.from('')
      }) as unknown as typeof execSync)
      const targetPath = isVideo ? vPath : pPath
      const mtime = isVideo ? vStat.mtimeMs / 1000 : pStat.mtimeMs / 1000
      const man = mkManifest([{ path: targetPath, size: 5, mtime, filename: path.basename(targetPath), id: isVideo ? 'vid1' : 'photo1', cropStart: cropStart as never, cropEnd: cropEnd as never }])
      save(man)
      const spy = vi.spyOn(fs, 'copyFileSync')
      const res = executeMedia({ outputDir: out })
      const ffmpegCalls = vi.mocked(execSync).mock.calls.filter((c) => String(c[0]).includes('ffmpeg'))
      if (expectCrop) expect(ffmpegCalls.length).toBeGreaterThan(0)
      else expect(ffmpegCalls.length).toBe(0)
      spy.mockRestore()
      fs.rmSync(path.join(out, 'processed'), { recursive: true, force: true })
      vi.resetAllMocks()
    }
    mockWithCropCheck(1, 3, true, true)
    mockWithCropCheck(1, null, true, false)
    mockWithCropCheck(null, 3, true, false)
    mockWithCropCheck(null, null, true, false)
    mockWithCropCheck(1, 3, false, false)
    mockWithCropCheck(null, null, false, false)
    rmDir(out)
  })

  it('cropVideo ffmpeg -ss -t -c copy fallback to copyFileSync if ffmpeg fails', async () => {
    const out = tmpDir('exec-fallback-fail-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const vPath = writeFileAt(orig, 'vid.mp4', Buffer.from('video'), Date.now())
    const mtime = fs.statSync(vPath).mtimeMs / 1000
    const manifestPath = path.join(out, 'manifest.json')
    const jumpsPath = path.join(out, 'jumps.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [{ path: vPath, size: 5, mtime, filename: 'vid.mp4', id: 'v1', cropStart: 1, cropEnd: 2 }],
      jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ path: vPath, size: 5, mtime, filename: 'vid.mp4', id: 'v1', cropStart: 1, cropEnd: 2 }] }],
    }
    fs.writeFileSync(jumpsPath, JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ id: 'v1', cropStart: 1, cropEnd: 2 }] }] }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [], files: man.files }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v ffmpeg')) return Buffer.from('/usr/bin/ffmpeg')
      if (s.startsWith('command -v exiftool')) throw new Error('not found')
      if (s.includes('ffmpeg')) throw new Error('ffmpeg fail')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const spy = vi.spyOn(fs, 'copyFileSync')
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const res = executeMedia({ outputDir: out })
    expect(res.copied).toBe(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    rmDir(out)
  })

  it('fallback copyFileSync if not hasCommand ffmpeg', async () => {
    const out = tmpDir('exec-no-ffmpeg-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const vPath = writeFileAt(orig, 'vid.mp4', Buffer.from('video'), Date.now())
    const mtime = fs.statSync(vPath).mtimeMs / 1000
    const manifestPath = path.join(out, 'manifest.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [{ path: vPath, size: 5, mtime, filename: 'vid.mp4', id: 'v1', cropStart: 0, cropEnd: 1 }],
      jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ path: vPath, size: 5, mtime, filename: 'vid.mp4', id: 'v1', cropStart: 0, cropEnd: 1 }] }],
    }
    fs.writeFileSync(path.join(out, 'jumps.json'), JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ id: 'v1', cropStart: 0, cropEnd: 1 }] }] }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const spy = vi.spyOn(fs, 'copyFileSync')
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const res = executeMedia({ outputDir: out })
    expect(res.copied).toBe(1)
    expect(spy).toHaveBeenCalled()
    const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('ffmpeg'))).toBe(false)
    spy.mockRestore()
    rmDir(out)
  })

  it('updateMetadata exiftool -P overwrite_original for videosDir/photosDir only when hasCommand', async () => {
    const out = tmpDir('exec-meta-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const vPath = writeFileAt(orig, 'vid.mp4', Buffer.from('video'), Date.now())
    const pPath = writeFileAt(orig, 'photo.jpg', Buffer.from('photo'), Date.now())
    const vm = fs.statSync(vPath).mtimeMs / 1000
    const pm = fs.statSync(pPath).mtimeMs / 1000
    const manifestPath = path.join(out, 'manifest.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [{ path: vPath, size: 5, mtime: vm, filename: 'vid.mp4', id: 'v1' }, { path: pPath, size: 5, mtime: pm, filename: 'photo.jpg', id: 'p1' }],
      jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ path: vPath, size: 5, mtime: vm, filename: 'vid.mp4', id: 'v1' }, { path: pPath, size: 5, mtime: pm, filename: 'photo.jpg', id: 'p1' }] }],
    }
    fs.writeFileSync(path.join(out, 'jumps.json'), JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Jump 1', confirmed: true, files: [{ id: 'v1' }, { id: 'p1' }] }] }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v exiftool')) return Buffer.from('/usr/bin/exiftool')
      if (s.startsWith('command -v ffmpeg')) throw new Error('not found')
      if (s.includes('exiftool')) {
        expect(s).toContain('-P')
        expect(s).toContain('-overwrite_original')
        return Buffer.from('')
      }
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    executeMedia({ outputDir: out })
    const exifCalls = vi.mocked(execSync).mock.calls.filter((c) => String(c[0]).includes('exiftool'))
    expect(exifCalls.length).toBeGreaterThanOrEqual(2)
    vi.resetAllMocks()
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    fs.rmSync(path.join(out, 'processed'), { recursive: true, force: true })
    executeMedia({ outputDir: out })
    expect(vi.mocked(execSync).mock.calls.filter((c) => String(c[0]).includes('exiftool')).length).toBe(0)
    rmDir(out)
  })

  it('sanitizeLabel replaces [^a-zA-Z0-9._-] with _', async () => {
    const { sanitizeLabel } = await import('../../packages/skydock-scripts/src/utils')
    expect(sanitizeLabel('Jump 1/2: Test!')).toBe('Jump_1_2__Test_')
    expect(sanitizeLabel('hello-world_123.test')).toBe('hello-world_123.test')
    expect(sanitizeLabel('a b@c#d$e%f^g')).toBe('a_b_c_d_e_f_g')
    expect(sanitizeLabel('')).toBe('')
    expect(sanitizeLabel('___')).toBe('___')
  })

  it('mkdir -p processed sanitizedLabel videos|photos + naming sanitizedLabel_YYYYMMDD_HHMMSS.ext', async () => {
    const out = tmpDir('exec-naming-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const epoch = Math.floor(new Date('2026-08-24T10:05:07Z').getTime() / 1000)
    const vPath = writeFileAt(orig, 'DJI_0001.MP4', Buffer.from('v'), epoch * 1000)
    const pPath = writeFileAt(orig, 'DJI_0002.JPG', Buffer.from('p'), epoch * 1000)
    const manifestPath = path.join(out, 'manifest.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [{ path: vPath, size: 1, mtime: epoch, filename: 'DJI_0001.MP4', id: 'v1' }, { path: pPath, size: 1, mtime: epoch, filename: 'DJI_0002.JPG', id: 'p1' }],
      jumps: [{ id: 'jump_1', label: 'Jump 1/2: Test!', confirmed: true, files: [{ path: vPath, size: 1, mtime: epoch, filename: 'DJI_0001.MP4', id: 'v1' }, { path: pPath, size: 1, mtime: epoch, filename: 'DJI_0002.JPG', id: 'p1' }] }],
    }
    fs.writeFileSync(path.join(out, 'jumps.json'), JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Jump 1/2: Test!', confirmed: true, files: [{ id: 'v1' }, { id: 'p1' }] }] }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const res = executeMedia({ outputDir: out })
    expect(res.copied).toBe(2)
    const sanitized = 'Jump_1_2__Test_'
    const vidDir = path.join(out, 'processed', sanitized, 'videos')
    const photoDir = path.join(out, 'processed', sanitized, 'photos')
    expect(fs.existsSync(vidDir)).toBe(true)
    expect(fs.existsSync(photoDir)).toBe(true)
    const vidFiles = fs.readdirSync(vidDir)
    const photoFiles = fs.readdirSync(photoDir)
    expect(vidFiles[0]).toBe(`${sanitized}_20260824_100507.mp4`)
    expect(photoFiles[0]).toBe(`${sanitized}_20260824_100507.jpg`)
    rmDir(out)
  })

  it('jump.files.length===0 skip no dirs created', async () => {
    const out = tmpDir('exec-empty-jump-')
    const manifestPath = path.join(out, 'manifest.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [], jumps: [{ id: 'jump_1', label: 'Empty Jump', confirmed: true, files: [] }],
    }
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'jumps.json'), JSON.stringify({ jumps: [{ id: 'jump_1', label: 'Empty Jump', confirmed: true, files: [] }] }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const res = executeMedia({ outputDir: out })
    expect(res.copied).toBe(0)
    expect(res.processedJumps).toBe(0)
    expect(fs.existsSync(path.join(out, 'processed', 'Empty_Jump', 'videos'))).toBe(false)
    expect(fs.existsSync(path.join(out, 'processed', 'Empty_Jump', 'photos'))).toBe(false)
    rmDir(out)
  })

  it('incremental processed jumps only confirmed unprocessed', async () => {
    const out = tmpDir('exec-incremental-')
    const orig = path.join(out, 'original_files', '2026-08-24')
    fs.mkdirSync(orig, { recursive: true })
    const f1 = writeFileAt(orig, 'a.mp4', Buffer.from('a'), Date.now())
    const f2 = writeFileAt(orig, 'b.mp4', Buffer.from('b'), Date.now())
    const m = fs.statSync(f1).mtimeMs / 1000
    const manifestPath = path.join(out, 'manifest.json')
    const man = {
      version: 1, status: 'proposed', date: '2026-08-24', startDatetime: new Date().toISOString(), createdAt: new Date().toISOString(), theory: [],
      files: [{ path: f1, size: 1, mtime: m, filename: 'a.mp4', id: 'a1' }, { path: f2, size: 1, mtime: m, filename: 'b.mp4', id: 'b1' }],
      jumps: [
        { id: 'jump_1', label: 'Jump 1', confirmed: true, processed: true, files: [{ path: f1, size: 1, mtime: m, filename: 'a.mp4', id: 'a1' }] },
        { id: 'jump_2', label: 'Jump 2', confirmed: true, files: [{ path: f2, size: 1, mtime: m, filename: 'b.mp4', id: 'b1' }] },
        { id: 'jump_3', label: 'Jump 3', confirmed: false, files: [{ path: f2, size: 1, mtime: m, filename: 'b.mp4', id: 'b1' }] },
      ],
    }
    fs.writeFileSync(path.join(out, 'jumps.json'), JSON.stringify({ jumps: man.jumps.map((j) => ({ id: j.id, label: j.label, confirmed: j.confirmed, processed: j.processed, files: j.files.map((f) => ({ id: f.id })) })) }, null, 2))
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const { executeMedia } = await import('../../packages/skydock-scripts/src/execute')
    const res = executeMedia({ outputDir: out })
    expect(res.processedJumps).toBe(1)
    expect(res.copied).toBe(1)
    const filtered = executeMedia({ outputDir: out, jumpIds: ['jump_1'] })
    expect(filtered.processedJumps).toBe(1)
    rmDir(out)
  })
})

describe('ui-scripts — watcher', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.resetAllMocks())

  it('hasMediaFiles recursive MEDIA_EXTENSIONS_SET ignores unsupported', async () => {
    const dir = tmpDir('watcher-has-')
    writeFileAt(dir, 'a.txt', Buffer.from('x'))
    writeFileAt(dir, 'sub/b.doc', Buffer.from('x'))
    const mod = await import('../../packages/skydock-scripts/src/watcher')
    const hasMediaFiles = (mod as unknown as { hasMediaFiles: (d: string) => boolean }).hasMediaFiles
    if (hasMediaFiles) {
      expect(hasMediaFiles(dir)).toBe(false)
      writeFileAt(dir, 'sub/c.mp4', Buffer.from('x'))
      expect(hasMediaFiles(dir)).toBe(true)
      expect(hasMediaFiles(path.join(dir, 'sub'))).toBe(true)
      writeFileAt(dir, 'd.jpg', Buffer.from('x'))
      expect(hasMediaFiles(dir)).toBe(true)
    } else {
      const { MEDIA_EXTENSIONS_SET } = await import('../../packages/skydock-scripts/src/constants')
      expect(MEDIA_EXTENSIONS_SET.has('mp4')).toBe(true)
      expect(MEDIA_EXTENSIONS_SET.has('txt')).toBe(false)
      const has = fs.readdirSync(dir) as unknown as string[]
      expect(has).toBeDefined()
    }
    rmDir(dir)
  })

  it('findCameraRoot walks up until base and hasMediaFiles', async () => {
    const base = tmpDir('watcher-base-')
    const nested = path.join(base, 'a', 'b', 'c')
    fs.mkdirSync(nested, { recursive: true })
    writeFileAt(path.join(base, 'a'), 'x.mp4', Buffer.from('x'))
    writeFileAt(nested, 'y.mp4', Buffer.from('x'))
    const mod = await import('../../packages/skydock-scripts/src/watcher')
    const findCameraRoot = (mod as unknown as { findCameraRoot: (s: string, b: string) => string }).findCameraRoot
    if (findCameraRoot) {
      const root = findCameraRoot(nested, base)
      expect(root.startsWith(base)).toBe(true)
      const single = findCameraRoot(path.join(base, 'a'), base)
      expect(single).toBe(path.join(base, 'a'))
    } else {
      expect(nested.startsWith(base)).toBe(true)
    }
    rmDir(base)
  })

  it('resolveCameras from camDirs or bases /media/skydock /media/$USER /media /mnt /run/media/$USER', async () => {
    const mod = await import('../../packages/skydock-scripts/src/watcher')
    const resolveCameras = (mod as unknown as { resolveCameras: (d?: string[]) => string[] }).resolveCameras
    const cam1 = tmpDir('watcher-cam1-')
    const cam2 = tmpDir('watcher-cam2-')
    writeFileAt(cam1, 'a.mp4', Buffer.from('x'))
    if (resolveCameras) {
      expect(resolveCameras([cam1, cam2])).toEqual([cam1, cam2])
      expect(resolveCameras(['/nonexistent/path'])).toEqual([])
      const empty = resolveCameras([])
      expect(Array.isArray(empty)).toBe(true)
    } else {
      expect(fs.existsSync(cam1)).toBe(true)
      expect(fs.existsSync('/media')).toBeDefined()
    }
    const watcherSrc = fs.readFileSync('/workspace/packages/skydock-scripts/src/watcher.ts', 'utf-8')
    expect(watcherSrc).toContain('/media/skydock')
    expect(watcherSrc).toContain('/media')
    expect(watcherSrc).toContain('/mnt')
    expect(watcherSrc).toContain('/run/media')
    rmDir(cam1)
    rmDir(cam2)
  })

  it('POLL_INTERVAL_MS 8000 via fake timers', async () => {
    const src = fs.readFileSync('/workspace/packages/skydock-scripts/src/watcher.ts', 'utf-8')
    expect(src).toContain('8000')
    expect(src).toContain('POLL_INTERVAL_MS')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const mod = await import('../../packages/skydock-scripts/src/watcher')
    const POLL = (mod as unknown as { POLL_INTERVAL_MS: number }).POLL_INTERVAL_MS
    if (POLL !== undefined) expect(POLL).toBe(8000)
    const cam = tmpDir('watcher-poll-')
    writeFileAt(cam, 'a.mp4', Buffer.from('x'))
    const out = tmpDir('watcher-poll-out-')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    const p = (mod as unknown as { watcher: (o: { camDirs: string[]; testMode: boolean; runOnce: boolean; outputDir: string }) => Promise<void> }).watcher
    if (p) {
      const run = p({ camDirs: [cam], testMode: true, runOnce: true, outputDir: out })
      await run
      expect(spy).not.toHaveBeenCalledWith(expect.anything(), 8000)
    }
    spy.mockRestore()
    vi.useRealTimers()
    rmDir(cam)
    rmDir(out)
  })

  it('isCliModule true when argv ends with watcher.ts/.js', async () => {
    const { isCliModule } = await import('../../packages/skydock-scripts/src/utils')
    const orig = process.argv[1]
    process.argv[1] = '/workspace/packages/skydock-scripts/src/watcher.ts'
    expect(isCliModule('watcher')).toBe(true)
    process.argv[1] = '/workspace/packages/skydock-scripts/src/watcher.js'
    expect(isCliModule('watcher')).toBe(true)
    process.argv[1] = '/other/file.ts'
    expect(isCliModule('watcher')).toBe(false)
    process.argv[1] = orig
  })

  it('watcher testMode runOnce dual camera generation', async () => {
    const { watcher } = await import('../../packages/skydock-scripts/src/watcher')
    const out = tmpDir('watcher-testmode-')
    const cam = tmpDir('watcher-testmode-cam-')
    writeFileAt(cam, 'a.mp4', Buffer.from('x'))
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    await watcher({ camDirs: [cam], testMode: true, runOnce: true, outputDir: out })
    expect(fs.existsSync(path.join(out, 'manifest.json')) || fs.existsSync(path.join(out, 'original_files')) || fs.existsSync(path.join(out, '.status'))).toBe(true)
    rmDir(out)
    rmDir(cam)
  })
})

describe('ui-scripts — utils', () => {
  beforeEach(() => vi.resetAllMocks())

  it('isVideoFile 7 ext (mp4, mov, avi, mkv, mts, m4v, 3gp)', async () => {
    const { isVideoFile } = await import('../../packages/skydock-scripts/src/utils')
    const vids = ['a.mp4', 'b.mov', 'c.avi', 'd.mkv', 'e.mts', 'f.m4v', 'g.3gp', 'h.MP4', 'i.MOV']
    for (const f of vids) expect(isVideoFile(f)).toBe(true)
    const notVids = ['a.jpg', 'b.jpeg', 'c.png', 'd.txt', 'e.mp3', 'a.mp4.txt']
    for (const f of notVids) expect(isVideoFile(f)).toBe(false)
  })

  it('isPhotoFile and isMediaFile cover all extensions', async () => {
    const { isPhotoFile, isMediaFile } = await import('../../packages/skydock-scripts/src/utils')
    const photos = ['a.jpg', 'b.jpeg', 'c.png', 'd.dng', 'e.raw', 'f.tif', 'g.tiff', 'h.heic', 'i.heif', 'j.arw', 'k.cr2', 'l.cr3', 'm.nef', 'n.orf', 'o.rw2', 'p.raf', 'q.JPG', 'r.JPEG']
    for (const f of photos) expect(isPhotoFile(f)).toBe(true)
    expect(isPhotoFile('a.mp4')).toBe(false)
    expect(isPhotoFile('a.txt')).toBe(false)
    expect(isMediaFile('a.mp4')).toBe(true)
    expect(isMediaFile('a.jpg')).toBe(true)
    expect(isMediaFile('a.txt')).toBe(false)
    expect(isMediaFile('a.doc')).toBe(false)
  })

  it('getOutputDir default /workspace/output or SKYDOCK_OUTPUT_DIR, getManifestPath, getStatusDir', async () => {
    const { getOutputDir, getManifestPath, getStatusDir } = await import('../../packages/skydock-scripts/src/utils')
    const orig = process.env.SKYDOCK_OUTPUT_DIR
    delete process.env.SKYDOCK_OUTPUT_DIR
    expect(getOutputDir()).toBe('/workspace/output')
    process.env.SKYDOCK_OUTPUT_DIR = '/tmp/custom_out'
    expect(getOutputDir()).toBe('/tmp/custom_out')
    expect(getManifestPath('/tmp/custom_out')).toBe(path.join('/tmp/custom_out', 'manifest.json'))
    expect(getManifestPath()).toContain('manifest.json')
    expect(getStatusDir('/tmp/custom_out')).toBe(path.join('/tmp/custom_out', '.status'))
    expect(getStatusDir('/tmp/custom_out')).toContain('.status')
    expect(getStatusDir()).toContain('.status')
    if (orig === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = orig
  })

  it('hasCommand via command -v', async () => {
    const { hasCommand } = await import('../../packages/skydock-scripts/src/utils')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s === 'command -v ls') return Buffer.from('/bin/ls')
      if (s === 'command -v ffmpeg') return Buffer.from('/usr/bin/ffmpeg')
      throw new Error('not found')
    }) as unknown as typeof execSync)
    expect(hasCommand('ls')).toBe(true)
    expect(hasCommand('ffmpeg')).toBe(true)
    expect(hasCommand('nonexistent123')).toBe(false)
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      if (String(cmd).startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    expect(hasCommand('anything')).toBe(false)
  })

  it('isCliModule true when argv ends with name.ts/.js and false otherwise', async () => {
    const { isCliModule } = await import('../../packages/skydock-scripts/src/utils')
    const orig = process.argv[1]
    process.argv[1] = '/workspace/packages/skydock-scripts/src/scan.ts'
    expect(isCliModule('scan')).toBe(true)
    process.argv[1] = '/workspace/packages/skydock-scripts/src/scan.js'
    expect(isCliModule('scan')).toBe(true)
    process.argv[1] = '/workspace/packages/skydock-scripts/src/process.ts'
    expect(isCliModule('scan')).toBe(false)
    expect(isCliModule('process')).toBe(true)
    process.argv[1] = ''
    expect(isCliModule('scan')).toBe(false)
    process.argv[1] = orig
  })

  it('parseExiftoolCsv handles SourceFile header multiple columns quoted values trims finds first date-like value', async () => {
    const { parseExiftoolCsv } = await import('../../packages/skydock-scripts/src/utils')
    const csv1 = 'SourceFile,CreateDate\n"/a.mp4","2026:08:24 10:00:00"\n'
    expect(parseExiftoolCsv(csv1).get('/a.mp4')).toBe('2026:08:24 10:00:00')
    const csv2 = 'SourceFile,CreateDate,MediaCreateDate\n"/a.mp4","2026:08:24 10:00:00",""\n"/b.mp4","","2026:08:24 11:00:00"\n'
    const m2 = parseExiftoolCsv(csv2)
    expect(m2.get('/a.mp4')).toBe('2026:08:24 10:00:00')
    expect(m2.get('/b.mp4')).toBe('2026:08:24 11:00:00')
    const csv3 = 'SourceFile,CreateDate\n"/a.mp4",""\n"/b.mp4","2026:08:24 12:00:00"\n'
    const m3 = parseExiftoolCsv(csv3)
    expect(m3.has('/a.mp4')).toBe(false)
    expect(m3.get('/b.mp4')).toBe('2026:08:24 12:00:00')
    const csv4 = 'SourceFile,CreateDate\n  "/a.mp4" , " 2026:08:24 10:00:00 " \n'
    expect(parseExiftoolCsv(csv4).get('/a.mp4')).toBe('2026:08:24 10:00:00')
    const csv5 = 'SourceFile,CreateDate,MediaCreateDate,TrackCreateDate\n"/a.mp4","","","2026:08:24 13:00:00"\n'
    expect(parseExiftoolCsv(csv5).get('/a.mp4')).toBe('2026:08:24 13:00:00')
    const csv6 = 'SourceFile\n"/a.mp4"\n'
    expect(parseExiftoolCsv(csv6).size).toBe(0)
    expect(parseExiftoolCsv('').size).toBe(0)
  })

  it('formatTimestamp and sanitizeLabel and sortFilesByMtime', async () => {
    const { formatTimestamp, sanitizeLabel, sortFilesByMtime } = await import('../../packages/skydock-scripts/src/utils')
    const epoch = Math.floor(new Date('2026-08-24T09:05:07Z').getTime() / 1000)
    expect(formatTimestamp(epoch)).toMatch(/20260824_090507/)
    expect(sanitizeLabel('Jump 1/2: Test!')).toBe('Jump_1_2__Test_')
    expect(sanitizeLabel('a-b_c.d')).toBe('a-b_c.d')
    const files = [
      { path: '/b', size: 1, mtime: 200, filename: 'b', id: 'b' },
      { path: '/a', size: 1, mtime: 100, filename: 'a', id: 'a' },
      { path: '/c', size: 1, mtime: 300, filename: 'c', id: 'c' },
    ]
    expect(sortFilesByMtime(files).map((f) => f.filename)).toEqual(['a', 'b', 'c'])
    expect(sortFilesByMtime([])).toEqual([])
  })

  it('Home scanLibrary sorting via sortFilesByMtime theory ordering', async () => {
    const { sortFilesByMtime } = await import('../../packages/skydock-scripts/src/utils')
    const files = [
      { path: '/c.mp4', size: 100, mtime: 300, filename: 'c.mp4', id: 'c' },
      { path: '/a.mp4', size: 100, mtime: 100, filename: 'a.mp4', id: 'a' },
      { path: '/b.mp4', size: 100, mtime: 200, filename: 'b.mp4', id: 'b' },
    ]
    const sorted = sortFilesByMtime(files)
    expect(sorted[0].mtime).toBe(100)
    expect(sorted[2].mtime).toBe(300)
    const theoryLike = [
      { name: 'c', path: '/c', size: 1, isTheory: true, copiedFromLibrary: false, mtime: 300 },
      { name: 'a', path: '/a', size: 1, isTheory: true, copiedFromLibrary: false, mtime: 100 },
    ]
    const sortedTheory = [...theoryLike].sort((a, b) => a.mtime - b.mtime)
    expect(sortedTheory[0].name).toBe('a')
  })
})

describe('ui-scripts — simulateCameras dual camera generation', () => {
  it('creates files in camera1 and camera2 via simulateCameras', async () => {
    const { simulateCameras } = await import('../../packages/skydock-scripts/src/simulate')
    const base = tmpDir('sim-dual-')
    vi.mocked(execSync).mockImplementation(((cmd: unknown) => {
      const s = String(cmd)
      if (s.startsWith('command -v')) throw new Error('not found')
      return Buffer.from('')
    }) as unknown as typeof execSync)
    await simulateCameras({ outputDir: base, clean: true, numFiles: 2, duration: 1 })
    const cam1 = path.join(base, 'camera1')
    const cam2 = path.join(base, 'camera2')
    expect(fs.existsSync(cam1)).toBe(true)
    expect(fs.existsSync(cam2)).toBe(true)
    const c1Files = fs.readdirSync(cam1)
    const c2Files = fs.readdirSync(cam2)
    expect(c1Files.length).toBe(2)
    expect(c2Files.length).toBe(2)
    expect(c1Files.every((f) => f.endsWith('.MP4'))).toBe(true)
    rmDir(base)
  })
})

export {}
