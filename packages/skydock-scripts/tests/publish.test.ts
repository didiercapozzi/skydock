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
      expect(url).toContain('version=6')
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
    try {
      stubFetch((url, init) => {
        if (url.includes('SYNO.API.Auth') && url.includes('method=login'))
          return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Upload')) {
          const form = init.body as FormData
          expect(form.get('create_parents')).toBe('true')
          expect(form.get('overwrite')).toBe('true')
          expect(typeof form.get('path')).toBe('string')
          expect((form.get('file') as File).name).toMatch(/\.(mp4|jpg)$/)
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
      const paths = uploads.map((c) => (c.init.body as FormData).get('path')).sort()
      expect(paths).toEqual([
        '/SkyDock/john_doe_20260824/photos',
        '/SkyDock/john_doe_20260824/videos'
      ])
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
