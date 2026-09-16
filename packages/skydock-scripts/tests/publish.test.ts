// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { dsmLogin } from '../src/nas'
import { publishJump } from '../src/publish'
import {
  createTmpDir,
  jsonResponse,
  loginFailure,
  loginSuccess,
  makeTmpTree,
  seen,
  stubFetch
} from './fixtures'

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type ReceivedUpload = {
  url: string
  headers: http.IncomingHttpHeaders
  bytes: number
  body: Buffer
}

type UploadServer = {
  url: string
  uploads: Array<ReceivedUpload>
  close: () => Promise<void>
}

const startUploadServer = (
  respond: (calls: number) => { status: number; body: unknown }
): Promise<UploadServer> => {
  const uploads: Array<ReceivedUpload> = []
  let calls = 0
  const server = http.createServer((req, res) => {
    calls++
    const chunks: Array<Buffer> = []
    req.on('data', (chunk: string | Buffer) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    )
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      uploads.push({ url: req.url ?? '', headers: req.headers, bytes: body.length, body })
      const answer = respond(calls)
      res.writeHead(answer.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(answer.body))
    })
  })
  return new Promise<UploadServer>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        uploads,
        close: () => new Promise<void>((done) => server.close(() => done()))
      })
    })
  })
}

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
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch(async (url) => {
        if (url.includes('SYNO.API.Auth') && url.includes('method=login'))
          return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Sharing')) {
          expect(new URL(url).searchParams.get('path')).toBe('/SkyDock/john_doe_20260824')
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc123' }] } })
        }
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/john_doe_20260824',
        outputDir: out
      })
      expect(result).toMatchObject({
        shareUrl: `${server.url}/sharing/abc123`,
        uploaded: 2,
        skipped: 0
      })

      expect(server.uploads.length).toBe(2)
      const bodies: Array<{ text: string; contentLength: string }> = []
      for (const u of server.uploads) {
        expect(u.url).toContain('SYNO.FileStation.Upload')
        expect(u.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
        const contentLength = String(u.headers['content-length'] ?? '')
        expect(u.bytes).toBe(Number(contentLength))
        bodies.push({ text: u.body.toString('utf8'), contentLength })
      }
      const paths = bodies.map((b) => b.text.match(/name="path"\r\n\r\n([^\r]+)/)?.[1]).sort()
      expect(paths).toEqual([
        '/SkyDock/john_doe_20260824/photos',
        '/SkyDock/john_doe_20260824/videos'
      ])
      for (const b of bodies) {
        expect(b.text).toContain('name="create_parents"\r\n\r\ntrue')
        expect(b.text).toContain('name="overwrite"\r\n\r\ntrue')
        expect(b.text.match(/name="file"; filename="([^"]+)"/)?.[1]).toMatch(/\.(mp4|jpg)$/)
        expect(b.text.endsWith('--\r\n')).toBe(true)
      }
      expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  /* a flat fun jump's files sit directly in localDir, where path.relative() returns '' — joining
     that on made `/SkyDock/jump/`, which DSM refuses with error 418 */
  it('uploads a file at the root of the folder to that exact path, with no trailing slash', async () => {
    const dir = createTmpDir('skydock-publish-flat-')
    const out = createTmpDir('skydock-publish-nas-')
    fs.writeFileSync(path.join(dir, 'yverdon_20260829_011623.mp4'), Buffer.from('flat'))
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/flat' }] } })
        return jsonResponse({ success: true })
      })
      await publishJump({
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/Yverdon',
        outputDir: out
      })
      expect(server.uploads).toHaveLength(1)
      const body = server.uploads[0].body.toString('utf8')
      expect(body.match(/name="path"\r\n\r\n([^\r]+)/)?.[1]).toBe('/SkyDock/Yverdon')
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('keeps session and throws when an upload fails', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer(() => ({
      status: 200,
      body: { success: false, errno: { key: 'disk_full' } }
    }))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        return jsonResponse({ success: true })
      })
      await expect(
        publishJump({
          host: server.url,
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        })
      ).rejects.toThrow('Upload failed')
      expect(server.uploads.length).toBe(3)
      expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('throws when sharing returns no link', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: {} })
        return jsonResponse({ success: true })
      })
      await expect(
        publishJump({
          host: server.url,
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        })
      ).rejects.toThrow('no link')
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('reports progress during upload', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const progress: Array<{ filename: string; bytesUploaded: number; totalBytes: number }> = []
      await publishJump(
        {
          host: server.url,
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        },
        { onProgress: (p) => progress.push({ ...p }) }
      )
      expect(progress.length).toBe(6)
      const completions = progress.filter(
        (p) => p.bytesUploaded === p.totalBytes && p.bytesUploaded > 0
      )
      expect(completions.length).toBe(2)
      for (const p of progress) {
        expect(p.bytesUploaded).toBeGreaterThanOrEqual(0)
        expect(p.bytesUploaded).toBeLessThanOrEqual(p.totalBytes)
      }
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('streams large files with exact Content-Length and monotonic progress', async () => {
    const dir = createTmpDir('skydock-publish-big-')
    const out = createTmpDir('skydock-publish-nas-')
    const fileSize = 64 * 1024 * 1024
    fs.mkdirSync(path.join(dir, 'videos'), { recursive: true })
    const bigPath = path.join(dir, 'videos', 'big.mp4')
    fs.writeFileSync(bigPath, '')
    fs.truncateSync(bigPath, fileSize)
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/big' }] } })
        return jsonResponse({ success: true })
      })
      const progress: Array<{ bytesUploaded: number; totalBytes: number }> = []
      await publishJump(
        {
          host: server.url,
          user: 'u',
          password: 'p',
          localDir: dir,
          remoteDir: '/SkyDock/jump',
          outputDir: out
        },
        {
          onProgress: (p) =>
            progress.push({ bytesUploaded: p.bytesUploaded, totalBytes: p.totalBytes })
        }
      )
      expect(server.uploads.length).toBe(1)
      const [upload] = server.uploads
      expect(upload.bytes).toBe(Number(upload.headers['content-length']))
      expect(upload.bytes).toBeGreaterThan(fileSize)
      expect(progress.length).toBeGreaterThan(2)
      expect(progress.length).toBeLessThan(200)
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i].bytesUploaded).toBeGreaterThanOrEqual(progress[i - 1].bytesUploaded)
        expect(progress[i].totalBytes).toBe(fileSize)
      }
      const last = progress[progress.length - 1]
      expect(last.bytesUploaded).toBe(fileSize)
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('retries failed uploads', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer((calls) =>
      calls === 1
        ? { status: 200, body: { success: false } }
        : { status: 200, body: { success: true } }
    )
    try {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/jump',
        outputDir: out
      })
      expect(result.shareUrl).toContain('/sharing/abc')
      expect(server.uploads.length).toBe(3)
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  it('keeps stored session alive after successful upload (does not logout reused SID)', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const { saveNasSession } = await import('../src/nas')
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    saveNasSession({ hostname: server.url, username: 'u', sessionId: 'reused-sid' }, out)
    try {
      stubFetch((url) => {
        if (url.includes('method=list_share'))
          return jsonResponse({ success: true, data: { shares: [] } })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/keepalive' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: server.url,
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
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  /* A tandem's folder holds the working trees, the project and the rushes as well as the two
     things the passenger gets. Sending the folder is how the rushes ended up behind a passenger's
     share link, so what travels has to be named rather than walked. */
  it('sends only the files it was given, although the folder holds more', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    fs.writeFileSync(path.join(dir, 'film.mp4'), Buffer.from('film'))
    fs.writeFileSync(path.join(dir, 'rushes.zip'), Buffer.from('rushes'))
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch(async (url) => {
        if (url.includes('SYNO.API.Auth') && url.includes('method=login'))
          return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.List'))
          return jsonResponse({ success: true, data: { files: [] } })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/one' }] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/Luc Favre',
        outputDir: out,
        files: [path.join(dir, 'film.mp4')]
      })
      expect(result.uploaded).toBe(1)
      const sent = server.uploads.map(
        (u) => /filename="([^"]+)"/.exec(u.body.toString('latin1'))?.[1]
      )
      expect(sent).toEqual(['film.mp4'])
      expect(sent).not.toContain('rushes.zip')
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })

  /* nobody is handed a link to the backup folder */
  it('asks for no share link when told not to', async () => {
    const dir = makeTmpTree()
    const out = createTmpDir('skydock-publish-nas-')
    const server = await startUploadServer(() => ({ status: 200, body: { success: true } }))
    try {
      stubFetch(async (url) => {
        if (url.includes('SYNO.API.Auth') && url.includes('method=login'))
          return loginSuccess('sid')
        if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
        if (url.includes('SYNO.FileStation.List'))
          return jsonResponse({ success: true, data: { files: [] } })
        throw new Error(`unexpected call ${url}`)
      })
      const result = await publishJump({
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/Backup',
        outputDir: out,
        share: false
      })
      expect(result.shareUrl).toBeNull()
      expect(seen.some((c) => c.url.includes('SYNO.FileStation.Sharing'))).toBe(false)
    } finally {
      await server.close()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(out, { recursive: true, force: true })
    }
  })
})
