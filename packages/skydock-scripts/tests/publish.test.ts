// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { dsmLogin } from '../src/nas'
import { publishJump } from '../src/publish'

type SeenCall = { url: string; init: RequestInit }

const seen: SeenCall[] = []

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const stubFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return handler(url, init)
    })
  )
}

const loginSuccess = (sid: string) => jsonResponse({ success: true, data: { sid } })
const loginFailure = () =>
  jsonResponse({ success: false, errno: { section: 'auth', key: 'login' } })

const makeTmpTree = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-test-'))
  fs.mkdirSync(path.join(dir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'videos', 'a.mp4'), Buffer.from('video'))
  fs.writeFileSync(path.join(dir, 'photos', 'b.jpg'), Buffer.from('photo'))
  return dir
}

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dsmLogin', () => {
  it('returns sid on version 6 success', async () => {
    stubFetch((url) => {
      expect(url).toMatch(/version=(7|6)/)
      return loginSuccess('sid-6')
    })
    await expect(
      dsmLogin({ host: 'https://nas.local:5001', user: 'u', password: 'p' })
    ).resolves.toBe('sid-6')
  })

  it('throws when DSM login returns failure', async () => {
    stubFetch(() => loginFailure())
    await expect(
      dsmLogin({ host: 'https://nas.local:5001', user: 'u', password: 'p' })
    ).rejects.toThrow(/DSM login failed/)
  })

  it('throws when DSM login fails (network error)', async () => {
    stubFetch(() => {
      throw new Error('network down')
    })
    await expect(
      dsmLogin({ host: 'https://nas.local:5001', user: 'u', password: 'p' })
    ).rejects.toThrow()
  })
})

describe('publishJump', () => {
  it('uploads every file, creates a share link and keeps session alive', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    const bodies: Array<{ text: string; contentLength: string }> = []
    try {
      stubFetch(async (url, init) => {
        if (url.includes('SYNO.API.Auth') && url.includes('method=login'))
          return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Upload')) {
          const text = await new Response(init.body as BodyInit).text()
          const fieldValue = (name: string) =>
            text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1]
          expect(fieldValue('create_parents')).toBe('true')
          expect(fieldValue('overwrite')).toBe('true')
          expect(typeof fieldValue('path')).toBe('string')
          expect(text.match(/name="file"; filename="([^"]+)"/)?.[1]).toMatch(/\.(mp4|jpg)$/)
          const headers = init.headers as Record<string, string>
          expect(headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/)
          bodies.push({ text, contentLength: headers['Content-Length'] })
          return jsonResponse({ success: true })
        }
        if (url.includes('SYNO.FileStation.Sharing')) {
          expect(new URL(url).searchParams.get('path')).toBe('/SkyDock/john_doe_20260824')
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc123' }] } })
        }
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: 'https://nas.local:5001',
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/john_doe_20260824',
        outputDir: out
      })
      expect(result).toEqual({ shareUrl: 'https://nas.local:5001/sharing/abc123' })

      const uploads = seen.filter((c) => c.url.includes('SYNO.FileStation.Upload'))
      expect(uploads.length).toBe(2)
      for (const c of uploads) expect(c.init.body).toBeInstanceOf(ReadableStream)
      const paths = bodies.map((b) => b.text.match(/name="path"\r\n\r\n([^\r]+)/)?.[1]).sort()
      expect(paths).toEqual([
        '/SkyDock/john_doe_20260824/photos',
        '/SkyDock/john_doe_20260824/videos'
      ])
      for (const b of bodies) {
        expect(Number(b.contentLength)).toBe(Buffer.byteLength(b.text))
        expect(b.text.endsWith('--\r\n')).toBe(true)
      }
      expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('keeps session and throws when an upload fails', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Upload'))
          return jsonResponse({ success: false, errno: { key: 'disk_full' } })
        return jsonResponse({ success: true })
      })
      await expect(
        publishJump({
          host: 'https://nas.local:5001',
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        })
      ).rejects.toThrow('Upload failed')
      expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('throws when sharing returns no link', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: {} })
        return jsonResponse({ success: true })
      })
      await expect(
        publishJump({
          host: 'https://nas.local:5001',
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        })
      ).rejects.toThrow('no link')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('reports progress during upload', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Upload')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const progress: Array<{ filename: string; bytesUploaded: number; totalBytes: number }> = []
      await publishJump(
        {
          host: 'https://nas.local:5001',
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        },
        (p) => progress.push({ ...p })
      )
      expect(progress.length).toBe(4)
      const completions = progress.filter(
        (p) => p.bytesUploaded === p.totalBytes && p.bytesUploaded > 0
      )
      expect(completions.length).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('streams large files with exact Content-Length and monotonic progress', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-big-'))
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    const fileSize = 64 * 1024 * 1024
    fs.mkdirSync(path.join(dir, 'videos'), { recursive: true })
    const bigPath = path.join(dir, 'videos', 'big.mp4')
    fs.writeFileSync(bigPath, '')
    fs.truncateSync(bigPath, fileSize)
    let receivedBytes = 0
    let sentContentLength = ''
    try {
      stubFetch((url, init) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Upload')) {
          sentContentLength = (init.headers as Record<string, string>)['Content-Length']
          expect(init.body).toBeInstanceOf(ReadableStream)
          return new Response(init.body as BodyInit).arrayBuffer().then((buf) => {
            receivedBytes = buf.byteLength
            return jsonResponse({ success: true })
          })
        }
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/big' }] } })
        return jsonResponse({ success: true })
      })
      const progress: Array<{ bytesUploaded: number; totalBytes: number }> = []
      await publishJump(
        {
          host: 'https://nas.local:5001',
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        },
        (p) => progress.push({ bytesUploaded: p.bytesUploaded, totalBytes: p.totalBytes })
      )
      expect(receivedBytes).toBe(Number(sentContentLength))
      expect(receivedBytes).toBeGreaterThan(fileSize)
      expect(progress.length).toBeGreaterThan(2)
      expect(progress.length).toBeLessThan(200)
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i].bytesUploaded).toBeGreaterThanOrEqual(progress[i - 1].bytesUploaded)
        expect(progress[i].totalBytes).toBe(fileSize)
      }
      const last = progress[progress.length - 1]
      expect(last.bytesUploaded).toBe(fileSize)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('retries failed uploads', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    try {
      let uploadCalls = 0
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Upload')) {
          uploadCalls++
          if (uploadCalls === 1) return jsonResponse({ success: false })
          return jsonResponse({ success: true })
        }
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: 'https://nas.local:5001',
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/jump',
        outputDir: out
      })
      expect(result.shareUrl).toContain('/sharing/abc')
      expect(uploadCalls).toBe(3)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('keeps stored session alive after successful upload (does not logout reused SID)', async () => {
    const dir = makeTmpTree()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-publish-nas-'))
    const { saveNasSession } = await import('../src/nas')
    saveNasSession(
      { hostname: 'https://nas.local:5001', username: 'u', sessionId: 'reused-sid' },
      out
    )
    try {
      stubFetch((url) => {
        if (url.includes('method=list_share'))
          return jsonResponse({ success: true, data: { shares: [] } })
        if (url.includes('SYNO.FileStation.Upload')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/keepalive' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: 'https://nas.local:5001',
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/jump',
        outputDir: out
      })
      expect(result.shareUrl).toContain('/sharing/keepalive')
      expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
      expect(seen.some((c) => c.url.includes('method=login'))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })
})
